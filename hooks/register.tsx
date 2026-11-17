import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { PepeView } from '../types'
import { USAGE_LINES, drawPane } from './pane'
import {
  QuoteError,
  chartUrl,
  hourChange,
  isMarketOpen,
  kosdaqFallback,
  normalizeTicker,
  parseChart,
  type Chart,
} from './quote'

export const PANE_ID = 'pepe'
const COMMAND = 'pepe'
export const STORE_TICKER = 'ticker'
export const POLL_MS = 300_000
export const CLOSED_POLL_MS = 1_800_000
const PANE_COLUMNS = 36
const PANE_ROWS = 24 // 인라인 배치(좁은 터미널)에서도 얼굴 16줄 + 정보가 들어갈 높이를 청한다
const SPARK_POINTS = 13
const USER_AGENT = 'Mozilla/5.0 (pepe-stock mod)'

// 패널이 그리는 시세 스냅숏. 세션 안에서 살고, 핫 리로드를 넘어 남는다.
// 필드가 바뀌면 shape 태그를 올려 옛 값을 버린다.
export const view = atom(
  { plugin: 'pepe-stock', key: 'view' } as const,
  { status: 'idle' } as PepeView,
  { shape: 'view-1' },
)

export type Command = { kind: 'set'; ticker: string } | { kind: 'reopen' } | { kind: 'off' }

export const USAGE = USAGE_LINES.join('\n')

export function parseArgs(args: string): Command {
  const token = args.trim().split(/\s+/)[0] ?? ''
  if (token === '') return { kind: 'reopen' }
  if (/^(off|close|stop|끄기|종료)$/i.test(token)) return { kind: 'off' }
  return { kind: 'set', ticker: normalizeTicker(token) }
}

export function errorMessage(err: unknown): string {
  if (err instanceof QuoteError) {
    switch (err.kind) {
      case 'not-found':
        return '없는 티커예요'
      case 'no-data':
        return '시세 데이터가 없는 종목이에요'
      case 'http':
        return `Yahoo 응답 ${err.status ?? '?'}`
      case 'bad-response':
        return '응답을 읽을 수 없어요'
      case 'network':
        return '네트워크 오류'
    }
  }
  return '네트워크 오류'
}

async function fetchChart($: EngineInterface, symbol: string): Promise<Chart> {
  let response
  try {
    response = await $.http.fetch(chartUrl(symbol), { headers: { 'User-Agent': USER_AGENT } })
  } catch (err) {
    throw new QuoteError('network', err instanceof Error ? err.message : String(err))
  }
  if (response.status === 404) throw new QuoteError('not-found', `${symbol}: not found`, 404)
  if (!response.ok) throw new QuoteError('http', `HTTP ${response.status}`, response.status)
  let json: unknown
  try {
    json = JSON.parse(response.text)
  } catch {
    throw new QuoteError('bad-response', 'JSON이 아닙니다')
  }
  return parseChart(json)
}

// 조회해서 view를 채운다. .KS로 없으면 .KQ를 한 번 더 보고, 찾은 심볼을 기억한다.
export async function refresh(
  $: EngineInterface,
  ticker: string,
): Promise<{ ticker: string; view: PepeView }> {
  const current = await read($, view)
  if (!(current.status === 'ok' && current.ticker === ticker)) {
    await update($, view, (): PepeView => ({ status: 'loading', ticker }))
  }
  const now = await $.clock.now()
  let symbol = ticker
  try {
    let chart: Chart
    try {
      chart = await fetchChart($, symbol)
    } catch (err) {
      const fallback = err instanceof QuoteError && err.kind === 'not-found' ? kosdaqFallback(symbol) : undefined
      if (fallback === undefined) throw err
      chart = await fetchChart($, fallback)
      symbol = fallback
      await $.store.set(STORE_TICKER, symbol)
    }
    const change = hourChange(chart.candles)
    const next: PepeView = {
      status: 'ok',
      ticker: symbol,
      symbol: chart.symbol,
      name: chart.name,
      currency: chart.currency,
      price: chart.price,
      pct: change.pct,
      spanMin: change.spanMin,
      isSinceOpen: change.isSinceOpen,
      closes: chart.candles.slice(-SPARK_POINTS).map(c => c.close),
      isOpen: isMarketOpen(chart, now / 1000),
      lastTradeAt: chart.lastTradeAt,
      gmtoffset: chart.gmtoffset,
      fetchedAt: now,
    }
    await update($, view, () => next)
    return { ticker: symbol, view: next }
  } catch (err) {
    const next: PepeView = { status: 'error', ticker: symbol, message: errorMessage(err), fetchedAt: now }
    await update($, view, () => next)
    return { ticker: symbol, view: next }
  }
}

const openPane = ($: EngineInterface, ticker: string) =>
  $.ui.open({ id: PANE_ID, title: `Pepe · ${ticker}`, columns: PANE_COLUMNS, rows: PANE_ROWS })

// 타이머 한 틱: 종목이 있고 마지막 조회가 오래됐으면 다시 조회한다. 장중 5분, 마감 중 30분.
// 거부된 주기는 인터벌을 끝내므로 어떤 예외도 밖으로 내보내지 않는다.
async function tick($: EngineInterface): Promise<void> {
  try {
    const ticker = await $.store.get(STORE_TICKER)
    if (typeof ticker !== 'string' || ticker === '') return
    const current = await read($, view)
    if (current.status === 'ok' && current.ticker === ticker) {
      const due = current.isOpen ? POLL_MS : CLOSED_POLL_MS
      const now = await $.clock.now()
      if (now - current.fetchedAt < due - 1000) return
    }
    await refresh($, ticker)
  } catch {
    // 다음 틱에 다시 시도한다.
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: '주가 1시간 등락률에 따라 표정이 바뀌는 페페 패널',
      argumentHint: '[티커 | off]',
    })
    const remembered = await $.store.get(STORE_TICKER)
    if (typeof remembered === 'string' && remembered !== '') {
      // 묻지 않고 여는 패널은 넓은 터미널에서만 자리를 잡는다. 좁으면 /pepe로 열 때까지 기다린다.
      void openPane($, remembered).catch(() => undefined)
      void refresh($, remembered).catch(() => undefined)
    }
    $.clock.every(POLL_MS, () => tick($))
    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const command = parseArgs(e.args)
    if (command.kind === 'off') {
      await $.ui.close({ id: PANE_ID })
      await $.store.delete(STORE_TICKER)
      await update($, view, (): PepeView => ({ status: 'idle' }))
      return { text: 'Pepe 패널을 닫았어요.' }
    }
    let ticker = ''
    if (command.kind === 'set') {
      ticker = command.ticker
    } else {
      const remembered = await $.store.get(STORE_TICKER)
      if (typeof remembered === 'string') ticker = remembered
    }
    if (ticker === '') return { text: USAGE }

    await $.store.set(STORE_TICKER, ticker)
    await openPane($, ticker)
    const done = await refresh($, ticker)
    if (done.ticker !== ticker) await openPane($, done.ticker) // .KQ로 찾았으면 제목을 바꾼다
    return {
      text:
        done.view.status === 'error'
          ? `Pepe가 ${done.ticker}를 못 봤어요: ${done.view.message}`
          : `Pepe가 ${done.ticker}를 지켜봅니다. 5분마다 갱신해요.`,
    }
  }).catch(() => ({ text: 'Pepe 명령을 처리하지 못했어요. 다시 시도해 주세요.' }))

  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e) => drawPane($, e, await read($, view)))
}
