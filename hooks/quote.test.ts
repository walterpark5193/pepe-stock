import { expect, test } from 'claude-code/testing'

import { MSFT_CLOSED, NOT_FOUND, NO_DATA, SAMSUNG_OPEN, withCandles } from './fixtures'
import {
  QuoteError,
  chartUrl,
  formatPct,
  formatPrice,
  hm,
  hourChange,
  isMarketOpen,
  kosdaqFallback,
  normalizeTicker,
  parseChart,
} from './quote'

// 던진 QuoteError의 kind; 안 던지면 undefined, 다른 예외면 'other'.
function kindOf(fn: () => unknown): string | undefined {
  try {
    fn()
    return undefined
  } catch (e) {
    return e instanceof QuoteError ? e.kind : 'other'
  }
}

test('normalizeTicker trims, uppercases, strips $ and suffixes 6 digits', () => {
  expect(normalizeTicker(' $msft ')).toBe('MSFT')
  expect(normalizeTicker('005930')).toBe('005930.KS')
  expect(normalizeTicker('005930.kq')).toBe('005930.KQ')
  expect(normalizeTicker('')).toBe('')
})

test('kosdaqFallback turns a .KS code into .KQ once', () => {
  expect(kosdaqFallback('005930.KS')).toBe('005930.KQ')
  expect(kosdaqFallback('MSFT')).toBe(undefined)
  expect(kosdaqFallback('005930.KQ')).toBe(undefined)
})

test('chartUrl encodes the symbol', () => {
  expect(chartUrl('BTC-USD')).toBe(
    'https://query1.finance.yahoo.com/v8/finance/chart/BTC-USD?interval=5m&range=1d',
  )
})

test('parseChart reads meta and candles', () => {
  const c = parseChart(MSFT_CLOSED)
  expect(c.symbol).toBe('MSFT')
  expect(c.name).toBe('Microsoft Corporation')
  expect(c.currency).toBe('USD')
  expect(c.price).toBe(517.99)
  expect(c.gmtoffset).toBe(-18000)
  expect(c.lastTradeAt).toBe(1794862801)
  expect(c.candles.length).toBe(15)
  expect(c.candles[14]?.t).toBe(1794862800)
  expect(c.candles[14]?.close).toBe(517.99)
  expect(c.regular.start).toBe(1794839400)
  expect(c.regular.end).toBe(1794862800)
})

test("parseChart throws not-found on Yahoo's error body", () => {
  expect(kindOf(() => parseChart(NOT_FOUND))).toBe('not-found')
})

test('parseChart throws bad-response on junk', () => {
  expect(kindOf(() => parseChart({}))).toBe('bad-response')
  expect(kindOf(() => parseChart('x'))).toBe('bad-response')
  expect(kindOf(() => parseChart(null))).toBe('bad-response')
})

test('hourChange on the MSFT fixture', () => {
  const h = hourChange(parseChart(MSFT_CLOSED).candles)
  expect(h.pct.toFixed(4)).toBe('-0.2042')
  expect(h.base).toBe(519.05)
  expect(h.last).toBe(517.99)
  expect(h.spanMin).toBe(60)
  expect(h.isSinceOpen).toBe(false)
})

test('hourChange picks the base by time, not by count', () => {
  const h = hourChange(parseChart(SAMSUNG_OPEN).candles)
  expect(h.base).toBe(193200)
  expect(h.last).toBe(191400)
  expect(h.spanMin).toBe(61)
  expect(h.pct.toFixed(4)).toBe('-0.9317')
})

test('hourChange skips null closes', () => {
  const c = parseChart(withCandles(MSFT_CLOSED, 15, 2))
  expect(c.candles.length).toBe(14)
  const h = hourChange(c.candles)
  expect(h.base).toBe(519.12)
  expect(h.spanMin).toBe(65)
})

test('hourChange falls back to the first candle', () => {
  const h = hourChange(parseChart(withCandles(MSFT_CLOSED, 3)).candles)
  expect(h.isSinceOpen).toBe(true)
  expect(h.spanMin).toBe(10)
  expect(h.base).toBe(518.51)
})

test('hourChange with one candle is flat', () => {
  const h = hourChange(parseChart(withCandles(MSFT_CLOSED, 1)).candles)
  expect(h.pct).toBe(0)
  expect(h.spanMin).toBe(0)
  expect(h.isSinceOpen).toBe(true)
})

test('hourChange throws no-data on no candles', () => {
  expect(kindOf(() => hourChange([]))).toBe('no-data')
})

test('parseChart on a chart with meta but no candles yields no candles', () => {
  const c = parseChart(withCandles(MSFT_CLOSED, 0))
  expect(c.symbol).toBe('MSFT')
  expect(c.candles.length).toBe(0)
})

test("parseChart throws no-data on Yahoo's meta-only body for a symbol without trades", () => {
  expect(kindOf(() => parseChart(NO_DATA))).toBe('no-data')
})

test('isMarketOpen compares now with the regular session', () => {
  const c = parseChart(MSFT_CLOSED)
  expect(isMarketOpen(c, 1794870000)).toBe(false)
  expect(isMarketOpen(c, 1794850000)).toBe(true)
  expect(isMarketOpen(c, 1794862800)).toBe(true)
  expect(isMarketOpen(c, 1794862801)).toBe(false)
})

test('formatPrice by currency', () => {
  expect(formatPrice(517.99, 'USD')).toBe('$517.99')
  expect(formatPrice(191400, 'KRW')).toBe('₩191,400')
  expect(formatPrice(1234.5, 'EUR')).toBe('EUR 1,234.50')
})

test('formatPct keeps the sign and two decimals', () => {
  expect(formatPct(1.4211)).toBe('+1.42%')
  expect(formatPct(-0.2042)).toBe('-0.20%')
  expect(formatPct(0)).toBe('0.00%')
})

test('hm renders HH:MM at an offset', () => {
  expect(hm(1794862800, -18000)).toBe('16:00')
  expect(hm(1794882069, 32400)).toBe('11:21')
})
