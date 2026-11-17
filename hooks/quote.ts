// Yahoo Finance chart v8 응답을 읽고 1시간 등락을 계산하는 순수 함수들. `$`를 쓰지 않는다.

export type Candle = { t: number; close: number } // t: epoch 초, 오름차순

export type Chart = {
  symbol: string
  name: string
  currency: string
  gmtoffset: number
  price: number
  lastTradeAt: number
  regular: { start: number; end: number }
  candles: Candle[]
}

export type HourChange = {
  pct: number
  base: number
  last: number
  spanMin: number
  isSinceOpen: boolean
}

export type QuoteErrorKind = 'not-found' | 'no-data' | 'bad-response' | 'http' | 'network'

export class QuoteError extends Error {
  readonly kind: QuoteErrorKind
  readonly status: number | undefined

  constructor(kind: QuoteErrorKind, message: string, status?: number) {
    super(message)
    this.name = 'QuoteError'
    this.kind = kind
    this.status = status
  }
}

const CHART_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart/'

export function chartUrl(symbol: string): string {
  return `${CHART_BASE}${encodeURIComponent(symbol)}?interval=5m&range=1d`
}

// 공백·앞의 $ 제거, 대문자. 6자리 숫자만이면 코스피(.KS)로 본다.
export function normalizeTicker(input: string): string {
  const s = input.trim().replace(/^\$/, '').toUpperCase()
  return /^\d{6}$/.test(s) ? `${s}.KS` : s
}

// .KS로 못 찾은 6자리 코드는 코스닥(.KQ)으로 한 번 더 본다.
export function kosdaqFallback(symbol: string): string | undefined {
  const m = /^(\d{6})\.KS$/.exec(symbol)
  return m ? `${m[1]}.KQ` : undefined
}

type Rec = Record<string, unknown>
const isRec = (x: unknown): x is Rec => typeof x === 'object' && x !== null
const bad = (why: string) => new QuoteError('bad-response', `Yahoo 응답을 읽을 수 없습니다: ${why}`)

export function parseChart(json: unknown): Chart {
  if (!isRec(json) || !isRec(json.chart)) throw bad('chart 없음')
  const chart = json.chart
  const results = chart.result
  if (!Array.isArray(results) || results.length === 0) {
    if (isRec(chart.error)) {
      const e = chart.error
      throw new QuoteError('not-found', String(e.description ?? e.code ?? 'not found'))
    }
    throw bad('result 없음')
  }
  const r: unknown = results[0]
  if (!isRec(r) || !isRec(r.meta)) throw bad('meta 없음')
  const meta = r.meta

  const num = (v: unknown, name: string): number => {
    if (typeof v !== 'number' || !Number.isFinite(v)) throw bad(`${name} 없음`)
    return v
  }
  const numOr = (v: unknown, fallback: number | undefined): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback
  const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined)

  const symbol = str(meta.symbol)
  if (symbol === undefined) throw bad('symbol 없음')
  const regular =
    isRec(meta.currentTradingPeriod) && isRec(meta.currentTradingPeriod.regular)
      ? meta.currentTradingPeriod.regular
      : undefined

  const timestamps: unknown[] = Array.isArray(r.timestamp) ? r.timestamp : []
  const quote0: unknown =
    isRec(r.indicators) && Array.isArray(r.indicators.quote) ? r.indicators.quote[0] : undefined
  const closes: unknown[] = isRec(quote0) && Array.isArray(quote0.close) ? quote0.close : []
  const candles: Candle[] = []
  timestamps.forEach((t, i) => {
    const close = closes[i]
    if (typeof t === 'number' && typeof close === 'number' && Number.isFinite(close)) {
      candles.push({ t, close })
    }
  })
  candles.sort((a, b) => a.t - b.t)
  const last = candles[candles.length - 1]

  // 존재하지만 거래가 없는 심볼(예: AWS, ECNQUOTE)은 meta만 오고 가격·봉이 없다.
  const price = numOr(meta.regularMarketPrice, last?.close)
  const lastTradeAt = numOr(meta.regularMarketTime, last?.t)
  if (price === undefined || lastTradeAt === undefined) {
    throw new QuoteError('no-data', `${symbol}: 시세 데이터 없음`)
  }

  return {
    symbol,
    name: str(meta.longName) ?? str(meta.shortName) ?? symbol,
    currency: str(meta.currency) ?? '',
    gmtoffset: typeof meta.gmtoffset === 'number' ? meta.gmtoffset : 0,
    price,
    lastTradeAt,
    regular: { start: num(regular?.start, 'regular.start'), end: num(regular?.end, 'regular.end') },
    candles,
  }
}

// 마지막 봉 종가 vs 그보다 windowSec 이상 앞선 가장 가까운 봉의 종가.
// 그런 봉이 없으면(개장 직후) 첫 봉을 기준으로 삼고 isSinceOpen을 켠다.
export function hourChange(candles: readonly Candle[], windowSec = 3600): HourChange {
  const last = candles[candles.length - 1]
  if (last === undefined) throw new QuoteError('no-data', '봉 데이터 없음')
  const cutoff = last.t - windowSec
  let base: Candle | undefined
  for (const c of candles) {
    if (c.t <= cutoff) base = c
    else break
  }
  const isSinceOpen = base === undefined
  const b = base ?? candles[0] ?? last
  const pct = b.close === 0 ? 0 : ((last.close - b.close) / b.close) * 100
  return { pct, base: b.close, last: last.close, spanMin: Math.round((last.t - b.t) / 60), isSinceOpen }
}

export function isMarketOpen(chart: Pick<Chart, 'regular'>, nowSec: number): boolean {
  return nowSec >= chart.regular.start && nowSec <= chart.regular.end
}

const withCommas = (digits: string): string => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')

export function formatPrice(price: number, currency: string): string {
  if (currency === 'KRW') return `₩${withCommas(Math.round(price).toString())}`
  const [int = '0', frac = '00'] = price.toFixed(2).split('.')
  const body = `${withCommas(int)}.${frac}`
  return currency === 'USD' ? `$${body}` : `${currency} ${body}`
}

export function formatPct(pct: number): string {
  const s = pct.toFixed(2)
  if (Number(s) === 0) return '0.00%'
  return pct > 0 ? `+${s}%` : `${s}%`
}

const pad = (n: number): string => String(n).padStart(2, '0')

// epoch 초를 주어진 오프셋(초)의 HH:MM으로.
export function hm(epochSec: number, gmtoffsetSec: number): string {
  const day = ((Math.floor(epochSec + gmtoffsetSec) % 86400) + 86400) % 86400
  return `${pad(Math.floor(day / 3600))}:${pad(Math.floor((day % 3600) / 60))}`
}
