// Yahoo Finance chart v8 응답 픽스처. 2026-11-17에 실제로 받은 응답에서 봉 15개만 남겼다.
// 테스트는 이 값을 손으로 계산한 기대값과 비교한다(계산 코드로 기대값을 만들지 않는다).

const quoteOf = (close: readonly (number | null)[]) => ({
  open: [...close],
  high: [...close],
  low: [...close],
  close: [...close],
  volume: close.map(() => 0),
})

// 장 마감 뒤의 MSFT: 마지막 봉이 정규장 끝 16:00 EST(1794862800)에 정확히 놓인다.
export const MSFT_CLOSED = {
  chart: {
    result: [
      {
        meta: {
          currency: 'USD',
          symbol: 'MSFT',
          exchangeName: 'NMS',
          fullExchangeName: 'NasdaqGS',
          instrumentType: 'EQUITY',
          firstTradeDate: 511108200,
          regularMarketTime: 1794862801,
          hasPrePostMarketData: true,
          gmtoffset: -18000,
          timezone: 'EST',
          exchangeTimezoneName: 'America/New_York',
          regularMarketPrice: 517.99,
          fiftyTwoWeekHigh: 555.45,
          fiftyTwoWeekLow: 344.79,
          regularMarketDayHigh: 524.5,
          regularMarketDayLow: 516.2,
          regularMarketVolume: 18234567,
          longName: 'Microsoft Corporation',
          shortName: 'Microsoft Corporation',
          chartPreviousClose: 523.88,
          previousClose: 523.88,
          scale: 3,
          priceHint: 2,
          currentTradingPeriod: {
            pre: { timezone: 'EST', start: 1794819600, end: 1794839400, gmtoffset: -18000 },
            regular: { timezone: 'EST', start: 1794839400, end: 1794862800, gmtoffset: -18000 },
            post: { timezone: 'EST', start: 1794862800, end: 1794877200, gmtoffset: -18000 },
          },
          dataGranularity: '5m',
          range: '1d',
          validRanges: ['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', '10y', 'ytd', 'max'],
        },
        timestamp: [
          1794858600, 1794858900, 1794859200, 1794859500, 1794859800, 1794860100, 1794860400, 1794860700,
          1794861000, 1794861300, 1794861600, 1794861900, 1794862200, 1794862500, 1794862800,
        ],
        indicators: {
          quote: [
            quoteOf([
              518.6, 519.12, 519.05, 518.79, 517.96, 518.65, 517.8, 517.74,
              518.2, 517.55, 518.28, 518.37, 518.51, 518.07, 517.99,
            ]),
          ],
        },
      },
    ],
    error: null,
  },
}

// 장중의 삼성전자: 마지막 봉이 5분 격자에 맞지 않는 "현재가 봉"(1794882069)이다.
export const SAMSUNG_OPEN = {
  chart: {
    result: [
      {
        meta: {
          currency: 'KRW',
          symbol: '005930.KS',
          exchangeName: 'KSC',
          fullExchangeName: 'KSE',
          instrumentType: 'EQUITY',
          firstTradeDate: 946857600,
          regularMarketTime: 1794882069,
          hasPrePostMarketData: false,
          gmtoffset: 32400,
          timezone: 'KST',
          exchangeTimezoneName: 'Asia/Seoul',
          regularMarketPrice: 191400,
          fiftyTwoWeekHigh: 199000,
          fiftyTwoWeekLow: 52300,
          regularMarketDayHigh: 196000,
          regularMarketDayLow: 191000,
          regularMarketVolume: 9876543,
          longName: 'Samsung Electronics Co., Ltd.',
          shortName: 'SamsungElec',
          chartPreviousClose: 196800,
          previousClose: 196800,
          scale: 3,
          priceHint: 2,
          currentTradingPeriod: {
            pre: { timezone: 'KST', start: 1794873600, end: 1794873600, gmtoffset: 32400 },
            regular: { timezone: 'KST', start: 1794873600, end: 1794895200, gmtoffset: 32400 },
            post: { timezone: 'KST', start: 1794895200, end: 1794895200, gmtoffset: 32400 },
          },
          dataGranularity: '5m',
          range: '1d',
          validRanges: ['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', '10y', 'ytd', 'max'],
        },
        timestamp: [
          1794878100, 1794878400, 1794878700, 1794879000, 1794879300, 1794879600, 1794879900, 1794880200,
          1794880500, 1794880800, 1794881100, 1794881400, 1794881700, 1794882000, 1794882069,
        ],
        indicators: {
          quote: [
            quoteOf([
              194800, 193200, 192200, 192300, 193300, 193400, 192200, 192400,
              192000, 192600, 192100, 191600, 191900, 191300, 191400,
            ]),
          ],
        },
      },
    ],
    error: null,
  },
}

// 없는 티커에 Yahoo가 404로 돌려주는 본문.
export const NOT_FOUND = {
  chart: {
    result: null,
    error: { code: 'Not Found', description: 'No data found, symbol may be delisted' },
  },
}

export type ChartJson = typeof MSFT_CLOSED

// 봉 배열을 바꾼 복사본: 마지막 `keep`개만 남기고, `nullAt` 자리의 종가를 null로.
export function withCandles(json: ChartJson, keep: number, nullAt?: number): ChartJson {
  const copy: ChartJson = JSON.parse(JSON.stringify(json))
  const r = copy.chart.result[0]!
  const tail = <T,>(xs: T[]): T[] => (keep === 0 ? [] : xs.slice(-keep)) // slice(-0)은 전체를 돌려준다
  r.timestamp = tail(r.timestamp)
  const q = r.indicators.quote[0]!
  q.open = tail(q.open)
  q.high = tail(q.high)
  q.low = tail(q.low)
  q.close = tail(q.close)
  q.volume = tail(q.volume)
  if (nullAt !== undefined) q.close[nullAt] = null
  return copy
}

// 존재하지만 거래 데이터가 없는 심볼(예: AWS)에 Yahoo가 200으로 돌려준 본문: meta만 있고 timestamp가 없다.
export const NO_DATA = {
  chart: {
    result: [
      {
        meta: {
          currency: 'USD',
          symbol: 'AWS',
          exchangeName: 'NMS',
          fullExchangeName: 'NasdaqGS',
          instrumentType: 'ECNQUOTE',
          firstTradeDate: null,
          regularMarketTime: null,
          hasPrePostMarketData: false,
          gmtoffset: -18000,
          timezone: 'EST',
          exchangeTimezoneName: 'America/New_York',
          regularMarketPrice: null,
          chartPreviousClose: null,
          priceHint: 2,
          currentTradingPeriod: {
            pre: { timezone: 'EST', start: 1794819600, end: 1794839400, gmtoffset: -18000 },
            regular: { timezone: 'EST', start: 1794839400, end: 1794862800, gmtoffset: -18000 },
            post: { timezone: 'EST', start: 1794862800, end: 1794877200, gmtoffset: -18000 },
          },
          dataGranularity: '5m',
          range: '1d',
          validRanges: ['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', '10y', 'ytd', 'max'],
        },
        indicators: { quote: [{}] },
      },
    ],
    error: null,
  },
}
