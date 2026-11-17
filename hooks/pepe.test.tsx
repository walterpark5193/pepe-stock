import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { HttpResponse, On, RenderSurface } from 'claude-code'

import type { PepeView } from '../types'
import { MSFT_CLOSED, NOT_FOUND, NO_DATA, SAMSUNG_OPEN, withCandles } from './fixtures'
import { POLL_MS } from './register'

// 엔진이 명령에 찍어 주는 두 필드: 테스트가 사람의 Enter를 흉내 낸다.
const RUN = {
  origin: { kind: 'composer' },
  presentation: { isFullscreen: true, columns: 160 },
} as const
const CLOSED_NOW = 1794870000000 // 2026-11-16 18:00 EST: MSFT 장 마감 뒤
const OPEN_NOW = 1794882100000 // 2026-11-17 11:21 KST: 삼성전자 장중
const SESSION = { cwd: '/', surface: 'terminal', isInteractive: true } as const

const ok = (json: unknown): HttpResponse => ({ status: 200, ok: true, headers: {}, text: JSON.stringify(json) })
const notFound = (): HttpResponse => ({ status: 404, ok: false, headers: {}, text: JSON.stringify(NOT_FOUND) })
const symbolOf = (url: string): string => url.split('/chart/')[1]?.split('?')[0] ?? url

type Answer = HttpResponse | { deny: string }
type World = {
  urls: string[]
  opened: { id: string; title: string | undefined; columns: number | undefined; rows: number | undefined }[]
  closed: string[]
  clock: ReturnType<typeof mock.clock>
  view: PepeView | undefined // 플러그인이 마지막으로 쓴 view 아톰 값
  store: Record<string, unknown> // 플러그인이 $.store에 쓴 값들(삭제 반영)
}

// 플러그인 아래의 세상: 명령 등록, 패널 열고 닫기, 네트워크, 저장소, 시계를 메모리로 답한다.
function boot(on: On, opts: { now: number; store?: Record<string, unknown>; fetch?: (url: string) => Answer }): World {
  const world: World = {
    urls: [],
    opened: [],
    closed: [],
    clock: mock.clock(on, { now: opts.now }),
    view: undefined,
    store: { ...(opts.store ?? {}) },
  }
  // 테스트의 $에는 store 명사도 없다: 저장소를 메모리 객체 하나로 답하고 그 객체를 검사한다.
  on('store.get', (_, e) => ({ value: world.store[e.key] }))
  on('store.set', (_, e) => {
    world.store[e.key] = e.value
    return { value: undefined }
  })
  on('store.delete', (_, e) => {
    delete world.store[e.key]
    return { value: undefined }
  })
  on('store.keys', () => ({ value: Object.keys(world.store) }))
  on('command.register', () => ({ value: { command: 'pepe' } }))
  // 테스트의 $에는 state 명사가 없다: 플러그인의 쓰기를 아래에서 받아 적고 그대로 넘긴다.
  on('state.set', (_, e, next) => {
    if (e.plugin === 'pepe-stock' && e.key === 'view') {
      const written = e.value as { shape?: string; value?: PepeView } | PepeView | undefined
      world.view = written && 'shape' in written ? written.value : (written as PepeView | undefined)
    }
    return next(e)
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.open', (_, e) => {
    world.opened.push({ id: e.id, title: e.title, columns: e.columns, rows: e.rows })
    return { value: { isPlaced: true } }
  })
  on('ui.close', (_, e) => {
    world.closed.push(e.id)
    return { value: undefined }
  })
  on('http.fetch', (_, e) => {
    world.urls.push(e.url)
    const answer = opts.fetch ? opts.fetch(e.url) : notFound()
    return 'deny' in answer ? answer : { value: answer }
  })
  return world
}

const run = ($: Engine, args: string) => $.command.run({ command: 'pepe', args, ...RUN })

const viewOf = (w: World): PepeView => w.view ?? { status: 'idle' }

test('/pepe without a ticker and nothing remembered answers the usage', async ($, on) => {
  boot(on, { now: CLOSED_NOW })
  await $.session.start(SESSION)
  const ran = await run($, '')
  expect(ran.text).toContain('/pepe MSFT')
  expect(ran.text).toContain('/pepe off')
})

test('/pepe MSFT fetches, remembers, opens the pane and fills the view', async ($, on) => {
  const w = boot(on, { now: CLOSED_NOW, fetch: () => ok(MSFT_CLOSED) })
  await $.session.start(SESSION)
  const ran = await run($, 'msft')
  expect(ran.text).toBe('Pepe가 MSFT를 지켜봅니다. 5분마다 갱신해요.')
  expect(w.urls.join()).toBe('https://query1.finance.yahoo.com/v8/finance/chart/MSFT?interval=5m&range=1d')
  expect(w.opened.length).toBe(1)
  expect(w.opened[0]?.id).toBe('pepe')
  expect(w.opened[0]?.title).toBe('Pepe · MSFT')
  expect(w.store['ticker']).toBe('MSFT')
  const v = viewOf(w)
  expect(v.status).toBe('ok')
  if (v.status !== 'ok') return
  expect(v.pct.toFixed(4)).toBe('-0.2042')
  expect(v.isOpen).toBe(false)
  expect(v.closes.length).toBe(13)
  expect(v.fetchedAt).toBe(CLOSED_NOW)
  expect(v.name).toBe('Microsoft Corporation')
  expect(v.price).toBe(517.99)
  expect(v.currency).toBe('USD')
  expect(v.gmtoffset).toBe(-18000)
})

test('/pepe 005930 tries .KS then .KQ on 404', async ($, on) => {
  const w = boot(on, { now: OPEN_NOW, fetch: url => (symbolOf(url) === '005930.KQ' ? ok(SAMSUNG_OPEN) : notFound()) })
  await $.session.start(SESSION)
  const ran = await run($, '005930')
  expect(w.urls.map(symbolOf).join(',')).toBe('005930.KS,005930.KQ')
  expect(ran.text).toBe('Pepe가 005930.KQ를 지켜봅니다. 5분마다 갱신해요.')
  expect(w.store['ticker']).toBe('005930.KQ')
  const v = viewOf(w)
  expect(v.status).toBe('ok')
  if (v.status !== 'ok') return
  expect(v.ticker).toBe('005930.KQ')
  expect(v.symbol).toBe('005930.KS')
  expect(v.price).toBe(191400)
  expect(v.isOpen).toBe(true)
  expect(v.pct.toFixed(4)).toBe('-0.9317')
})

test('an unknown ticker becomes the error view', async ($, on) => {
  const w = boot(on, { now: CLOSED_NOW })
  await $.session.start(SESSION)
  const ran = await run($, 'ZZZZNOPE')
  expect(ran.text).toBe('Pepe가 ZZZZNOPE를 못 봤어요: 없는 티커예요')
  const v = viewOf(w)
  expect(v.status === 'error' ? `${v.ticker} ${v.message}` : v.status).toBe('ZZZZNOPE 없는 티커예요')
})

test('a symbol without trade data says so', async ($, on) => {
  const w = boot(on, { now: CLOSED_NOW, fetch: () => ok(NO_DATA) })
  await $.session.start(SESSION)
  const ran = await run($, 'AWS')
  expect(ran.text).toBe('Pepe가 AWS를 못 봤어요: 시세 데이터가 없는 종목이에요')
  const v = viewOf(w)
  expect(v.status === 'error' ? v.message : v.status).toBe('시세 데이터가 없는 종목이에요')
})

test('http failure becomes the error view', async ($, on) => {
  let mode: 'rate-limited' | 'offline' = 'rate-limited'
  const w = boot(on, {
    now: CLOSED_NOW,
    fetch: () => (mode === 'rate-limited' ? { status: 429, ok: false, headers: {}, text: '' } : { deny: 'offline' }),
  })
  await $.session.start(SESSION)
  await run($, 'MSFT')
  let v = viewOf(w)
  expect(v.status === 'error' ? v.message : v.status).toBe('Yahoo 응답 429')
  mode = 'offline'
  await run($, 'MSFT')
  v = viewOf(w)
  expect(v.status === 'error' ? v.message : v.status).toBe('네트워크 오류')
})

test('/pepe without args reopens the remembered ticker', async ($, on) => {
  const w = boot(on, { now: CLOSED_NOW, store: { ticker: 'MSFT' }, fetch: () => ok(MSFT_CLOSED) })
  await $.session.start(SESSION)
  await w.clock.settle()
  const fetchesBefore = w.urls.length
  const opensBefore = w.opened.length
  const ran = await run($, '')
  expect(ran.text).toBe('Pepe가 MSFT를 지켜봅니다. 5분마다 갱신해요.')
  expect(w.urls.length - fetchesBefore).toBe(1)
  expect(w.opened.length - opensBefore).toBe(1)
  expect((viewOf(w)).status).toBe('ok')
})

test('/pepe off closes, forgets and idles', async ($, on) => {
  const w = boot(on, { now: CLOSED_NOW, store: { ticker: 'MSFT' }, fetch: () => ok(MSFT_CLOSED) })
  await $.session.start(SESSION)
  await w.clock.settle()
  const ran = await run($, 'off')
  expect(ran.text).toBe('Pepe 패널을 닫았어요.')
  expect(w.closed.join()).toBe('pepe')
  expect(w.store['ticker']).toBe(undefined)
  expect((viewOf(w)).status).toBe('idle')
})

// ── 패널 그리기 ─────────────────────────────────────────────────────────────

const PANE = {
  plugin: 'pepe-stock',
  component: 'Pane',
  requestId: 'pepe',
  props: {
    title: 'Pepe',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 24 },
    view: {},
  },
} as const

const mountPane = ($: Engine, surface: RenderSurface = 'terminal', bodyRows = 24, bodyColumns = 40) =>
  $.ui.mount({ ...PANE, surface, props: { ...PANE.props, bodyColumns, scroll: { offset: 0, bodyRows } } })

const SPARK = /^[▁▂▃▄▅▆▇█]+$/u
const BRAILLE = /[\u2800-\u28ff]/u

test('the idle pane shows the usage face', async ($, on) => {
  boot(on, { now: CLOSED_NOW })
  await $.session.start(SESSION)
  const ui = await mountPane($)
  expect(await ui.find({ type: 'Text', text: /대기 중/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\/pepe MSFT/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\/pepe off/ })).toBeDefined()
  await ui.unmount()
})

test('closed market shows the close time', async ($, on) => {
  boot(on, { now: CLOSED_NOW, fetch: () => ok(MSFT_CLOSED) })
  await $.session.start(SESSION)
  await run($, 'MSFT')
  const ui = await mountPane($)
  expect((await ui.find({ type: 'Text', text: /Microsoft Corporation/ }))?.text).toBe('Microsoft Corporation')
  expect(await ui.find({ type: 'Text', text: /\$517\.99/ })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /▼/ }))?.text).toBe('▼ -0.20%')
  expect(await ui.find({ type: 'Text', text: /\(1시간\)/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /무표정 · \.\.\./ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /장 마감 16:00/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /갱신 08:00 KST/ })).toBeDefined()
  const spark = await ui.findAll({ type: 'Text', text: SPARK })
  expect(spark.map(s => s.text).join('|').length).toBe(14) // 12 blocks + '|' + 1 block
  expect(spark[0]?.props['dimColor']).toBe(true)
  expect(spark[1]?.props['color']).toBe('#1e88e5')
  await ui.unmount()
})

test('an open market has no close line', async ($, on) => {
  boot(on, { now: OPEN_NOW, fetch: () => ok(SAMSUNG_OPEN) })
  await $.session.start(SESSION)
  await run($, '005930.KS')
  const ui = await mountPane($)
  expect(await ui.find({ type: 'Text', text: /₩191,400/ })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /▼/ }))?.text).toBe('▼ -0.93%')
  expect(await ui.find({ type: 'Text', text: /불안 · monkaS/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /장 마감/ })).toBe(undefined)
  await ui.unmount()
})

test('young session says 개장 후', async ($, on) => {
  boot(on, { now: 1794863000000, fetch: () => ok(withCandles(MSFT_CLOSED, 3)) })
  await $.session.start(SESSION)
  await run($, 'MSFT')
  const ui = await mountPane($)
  expect(await ui.find({ type: 'Text', text: /\(개장 후 10분\)/ })).toBeDefined()
  await ui.unmount()
})

test('a bad ticker shows the error face and message', async ($, on) => {
  boot(on, { now: CLOSED_NOW })
  await $.session.start(SESSION)
  await run($, 'MSFT')
  const ui = await mountPane($)
  expect(await ui.find({ type: 'Text', text: /MSFT: 없는 티커예요/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /어리둥절/ })).toBeDefined()
  await ui.unmount()
})

// 낮은 패널(인라인 배치 등)에서도 얼굴은 남긴다: 얼굴이 이 패널의 존재 이유다. 스파크라인과 갱신 시각만 뺀다.
test('a short pane keeps the face but drops the footer and sparkline', async ($, on) => {
  boot(on, { now: CLOSED_NOW, fetch: () => ok(MSFT_CLOSED) })
  await $.session.start(SESSION)
  await run($, 'MSFT')
  const ui = await mountPane($, 'terminal', 12)
  expect(await ui.find({ type: 'Text', text: /\$517\.99/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /갱신/ })).toBe(undefined)
  expect((await ui.findAll({ type: 'Text', text: SPARK })).length).toBe(0)
  expect((await ui.findAll({ type: 'Text', text: BRAILLE })).length >= 12 ? 'face' : 'no face').toBe('face')
  await ui.unmount()
})

test('the face is braille pixel art at 40 columns and hidden at 30', async ($, on) => {
  boot(on, { now: CLOSED_NOW, fetch: () => ok(MSFT_CLOSED) })
  await $.session.start(SESSION)
  await run($, 'MSFT')
  const wide = await mountPane($, 'terminal', 24, 40)
  expect((await wide.findAll({ type: 'Text', text: BRAILLE })).length >= 12 ? 'face' : 'no face').toBe('face')
  await wide.unmount()
  const narrow = await mountPane($, 'terminal', 24, 30)
  expect((await narrow.findAll({ type: 'Text', text: BRAILLE })).length).toBe(0)
  expect(await narrow.find({ type: 'Text', text: /\$517\.99/ })).toBeDefined()
  expect((await narrow.find({ type: 'Text', text: /얼굴을 생략/ }))?.text).toBe('패널이 좁아 얼굴을 생략했어요 (30열, 34열 필요)')
  await narrow.unmount()
})

test('opening the pane asks for room for the face', async ($, on) => {
  const w = boot(on, { now: CLOSED_NOW, fetch: () => ok(MSFT_CLOSED) })
  await $.session.start(SESSION)
  await run($, 'MSFT')
  expect(`${w.opened[0]?.columns} ${w.opened[0]?.rows}`).toBe('36 24')
})

test('the pane draws on every surface', async ($, on) => {
  boot(on, { now: CLOSED_NOW, fetch: () => ok(MSFT_CLOSED) })
  await $.session.start(SESSION)
  await run($, 'MSFT')
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await mountPane($, surface)
    expect((await ui.find({ type: 'Text', text: /무표정/ })) ? surface : `${surface}: no face`).toBe(surface)
    await ui.unmount()
  }
})

// ── 5분 타이머와 세션 시작 복원 ──────────────────────────────────────────────

test('session.start with a remembered ticker fetches and opens unasked', async ($, on) => {
  const w = boot(on, { now: CLOSED_NOW, store: { ticker: 'MSFT' }, fetch: () => ok(MSFT_CLOSED) })
  await $.session.start(SESSION)
  await w.clock.settle()
  expect(w.urls.length).toBe(1)
  expect(w.opened.map(o => o.title).join()).toBe('Pepe · MSFT')
  expect(viewOf(w).status).toBe('ok')
})

test('an open market polls every five minutes', async ($, on) => {
  const w = boot(on, { now: OPEN_NOW, fetch: () => ok(SAMSUNG_OPEN) })
  await $.session.start(SESSION)
  await run($, '005930.KS')
  expect(w.urls.length).toBe(1)
  await w.clock.advance(POLL_MS)
  expect(w.urls.length).toBe(2)
  await w.clock.advance(POLL_MS)
  expect(w.urls.length).toBe(3)
})

test('a closed market polls every thirty minutes', async ($, on) => {
  const w = boot(on, { now: CLOSED_NOW, fetch: () => ok(MSFT_CLOSED) })
  await $.session.start(SESSION)
  await run($, 'MSFT')
  await w.clock.advance(POLL_MS * 5)
  expect(w.urls.length).toBe(1)
  await w.clock.advance(POLL_MS)
  expect(w.urls.length).toBe(2)
})

test('a failed poll does not stop the timer', async ($, on) => {
  let isOffline = true
  const w = boot(on, { now: CLOSED_NOW, fetch: () => (isOffline ? { deny: 'offline' } : ok(MSFT_CLOSED)) })
  await $.session.start(SESSION)
  await run($, 'MSFT')
  expect(viewOf(w).status).toBe('error')
  isOffline = false
  await w.clock.advance(POLL_MS)
  expect(w.urls.length).toBe(2)
  expect(viewOf(w).status).toBe('ok')
})

test('nothing remembered: the timer fetches nothing', async ($, on) => {
  const w = boot(on, { now: CLOSED_NOW, fetch: () => ok(MSFT_CLOSED) })
  await $.session.start(SESSION)
  await w.clock.advance(POLL_MS * 3)
  expect(w.urls.length).toBe(0)
})
