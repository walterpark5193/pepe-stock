# pepe-stock 모드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/pepe MSFT`로 종목을 넣으면 최근 1시간 등락률(5분봉)에 따라 표정이 바뀌는 페페 아스키 아트를 Claude Code 사이드 패널에 그리고 5분마다 갱신하는 모드.

**Architecture:** Claude Code 함수 훅 모드 하나. `quote.ts`(Yahoo 응답 파싱·1시간 등락 계산, 순수 함수)와 `faces.ts`(표정 데이터·구간 판정·스파크라인, 순수 데이터)를 `register.tsx`가 묶는다: `/pepe` 명령, `session.start`의 5분 타이머, `ui.render` 패널 훅. 시세 스냅숏은 `$.state` 아톰 `view`에, 마지막 종목은 `$.store`에 둔다. 패널 트리는 `pane.tsx`의 `drawPane`이 만든다.

**Tech Stack:** Claude Code plugin hooks API(`claude-code` 타입, JSX `h`), `claude plugin validate` / `claude plugin test`(테스트 키트 `claude-code/testing`), TypeScript 5.9(`npx -y -p typescript@5.9 tsc`), Yahoo Finance chart v8 JSON.

**Spec:** `/home/ec2-user/claude-lab/docs/superpowers/specs/2026-11-17-pepe-stock-pane-design.md`

## Global Constraints

- 모드 폴더 `$MOD` = `/home/ec2-user/.claude/dev-mods/578333e4-260e-4b3b-a4e1-8f7a6ad622d6/pepe-stock`. 플러그인 이름 `pepe-stock`, 명령 `pepe`, 패널 id `pepe`.
- 훅 모듈은 ES 모듈(.ts/.tsx), Node·DOM 없음. 시간은 `$.clock`, 네트워크는 `$.http.fetch`, 저장은 `$.store`/`$.state`만.
- 데이터 URL: `https://query1.finance.yahoo.com/v8/finance/chart/{SYMBOL}?interval=5m&range=1d`, 헤더 `User-Agent: Mozilla/5.0 (pepe-stock mod)`.
- 표정 구간(1시간 등락률 %): euphoric ≥ 2.5, happy ≥ 1.0, smug ≥ 0.3, neutral > −0.3, worried > −1.0, sad > −2.5, crying 그 아래.
- 얼굴 아스키 아트: 폭 ≤ 28열, 높이 ≤ 10줄. 얼굴 초록 `#43a047`. 등락 색 상승 빨강 `#e53935`, 하락 파랑 `#1e88e5`.
- 갱신: 타이머 5분(`POLL_MS = 300000`), 장 마감 중 30분(`CLOSED_POLL_MS = 1800000`).
- 사용자 문구는 한국어. 시각 표기: 갱신 시각 KST(+32400초), 장 마감 시각은 거래소 `gmtoffset`.
- 모드 폴더와 `claude-lab`은 git 저장소가 아니다. 사용자가 요청하지 않았으므로 커밋 단계 없음. 각 Task는 validate + test 통과로 끝낸다.
- 타입 체크 설정은 모드 폴더 밖 `/tmp/pepe-stock-tsc/tsconfig.json`(Task 1에서 만듦). 명령: `npx -y -p typescript@5.9 tsc -p /tmp/pepe-stock-tsc/tsconfig.json`.
- 첫 파일을 `$MOD` 아래 쓰면 엔진이 이 세션의 모드를 켠다(auto 모드면 자동). 턴이 끝날 때 모드가 로드되고 `$MOD/.claude-plugin/types/`가 생긴다.

## Review Focus

1. Yahoo 봉 배열의 `null` 종가(거래 없는 구간) → 버리고 계산해야 한다. 테스트: Task 2 `hourChange skips null closes`.
2. 마지막 봉의 타임스탬프가 5분 격자에 안 맞음(현재가 봉, 예: 1794882069) → 12개 세기가 아니라 시각 기준으로 60분 전 봉을 골라야 한다. 테스트: Task 2 `hourChange picks the base by time, not by count`.
3. 장 마감·주말 → `range=1d`가 마지막 거래일을 주고 현재 시각이 `regular.end` 뒤 → "장 마감 16:00" 표기와 표정 유지. 테스트: Task 2 `isMarketOpen`, Task 5 `closed market shows the close time`.
4. HTTP 429/5xx나 fetch 예외 → 오류 얼굴과 메시지, 타이머는 계속 돌아야 한다(거부된 주기는 인터벌을 끝낸다). 테스트: Task 4 `http failure becomes the error view`, Task 6 `a failed poll does not stop the timer`.
5. 개장 1시간 안(봉 3개) → 당일 첫 봉 기준, "개장 후 N분" 표기. 테스트: Task 2 `hourChange falls back to the first candle`, Task 5 `young session says 개장 후`.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `$MOD/.claude-plugin/plugin.json` | 이름·버전·설명·`types` 경로 |
| `$MOD/hooks/hooks.json` | `{ "modules": ["./register.tsx"] }` |
| `$MOD/types/index.d.ts` | `PepeView` 타입과 `PluginState['pepe-stock']` 계약 |
| `$MOD/hooks/quote.ts` | Yahoo 파싱, 1시간 등락, 티커 정규화, 장 상태, 숫자·시각 포맷. `$` 없음 |
| `$MOD/hooks/faces.ts` | 표정 10개 아스키 아트, 구간 판정, 스파크라인, 색 상수. `$` 없음 |
| `$MOD/hooks/pane.tsx` | `drawPane(els, view, room)`: 뷰 → 패널 JSX 트리. `$` 없음 |
| `$MOD/hooks/register.tsx` | 명령, 타이머, fetch 흐름, `ui.render` 훅 연결 |
| `$MOD/hooks/fixtures.ts` | 테스트용 Yahoo 응답 2개 + 404 응답 |
| `$MOD/hooks/quote.test.ts`, `faces.test.ts`, `pepe.test.tsx` | 각 모듈 테스트, 통합(명령·타이머·패널) 테스트 |
| `$MOD/README.md` | 사용법·동작·알아둘 점 |

---

### Task 1: 뼈대와 `/pepe` 사용법 응답

**Files:**
- Create: `$MOD/.claude-plugin/plugin.json`, `$MOD/hooks/hooks.json`, `$MOD/types/index.d.ts`, `$MOD/hooks/register.tsx`
- Create: `/tmp/pepe-stock-tsc/tsconfig.json`
- Test: `$MOD/hooks/pepe.test.tsx`

**Interfaces:**
- Produces: `types/index.d.ts`의
  ```ts
  export type PepeView =
    | { status: 'idle' }
    | { status: 'loading'; ticker: string }
    | { status: 'error'; ticker: string; message: string; fetchedAt: number }
    | { status: 'ok'; ticker: string; symbol: string; name: string; currency: string; price: number
        pct: number; spanMin: number; isSinceOpen: boolean; closes: number[]
        isOpen: boolean; lastTradeAt: number; gmtoffset: number; fetchedAt: number }
  declare module 'claude-code' { interface PluginState { 'pepe-stock': { view: Shaped<PepeView> } } }
  ```
- Produces: `register.tsx`의 `export const PANE_ID = 'pepe'`, `export const view = atom({ plugin: 'pepe-stock', key: 'view' } as const, { status: 'idle' } as PepeView, { shape: 'view-1' })`, `export function parseArgs(args: string): Command` with `export type Command = { kind: 'set'; ticker: string } | { kind: 'reopen' } | { kind: 'off' }`, `export const USAGE: string`(세 줄: `/pepe MSFT`, `/pepe 005930`, `/pepe off` 설명).

- [ ] **Step 1: 매니페스트 세 파일 작성**

`plugin.json`: `{ "name": "pepe-stock", "version": "0.1.0", "description": "주가 1시간 등락률에 따라 표정이 바뀌는 페페 사이드 패널", "types": "./types/index.d.ts" }`. `hooks.json`: 위 한 줄. `types/index.d.ts`: Interfaces의 내용.

- [ ] **Step 2: 실패하는 테스트 작성** (`pepe.test.tsx`)

```tsx
import { expect, test } from 'claude-code/testing'
const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } } as const

test('/pepe without a ticker and nothing remembered answers the usage', async ($, on) => {
  on('command.register', () => ({ value: { command: 'pepe' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('store.get', () => ({ value: undefined }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ran = await $.command.run({ command: 'pepe', args: '', ...RUN })
  expect(ran.text).toContain('/pepe MSFT')
  expect(ran.text).toContain('/pepe off')
})
```

- [ ] **Step 3: 실패 확인**

Run: `claude plugin test $MOD`
Expected: FAIL (register 모듈 없음 또는 명령 미등록).

- [ ] **Step 4: `register.tsx` 최소 구현**

`parseArgs`: 공백 분리 첫 토큰. 없으면 `reopen`; `/^(off|close|stop|끄기|종료)$/i`면 `off`; 그 밖엔 `set`에 토큰 그대로(정규화는 Task 4에서 `normalizeTicker`로 교체). `session.start` 훅: `$.command.register({ name: 'pepe', description: '주가 1시간 등락률에 따라 표정이 바뀌는 페페 패널', argumentHint: '[티커 | off]' })` 후 `next(e)`. `command.run { command: 'pepe' }` 훅: `reopen`이고 `$.store.get('ticker')`가 문자열이 아니면 `{ text: USAGE }`; 나머지 분기는 `{ text: '아직 준비 중' }` 자리표시.

- [ ] **Step 5: 통과 확인 + 검증**

Run: `claude plugin test $MOD` → PASS. Run: `claude plugin validate $MOD` → 오류 0(노트만).

- [ ] **Step 6: 타입 체크 설정과 실행**

`/tmp/pepe-stock-tsc/tsconfig.json`: 타입 파일 헤더의 compilerOptions 그대로, `"include"`를 `["/tmp/claude-1000/bundled-skills/2.1.325/6e7e1389181c5e0a5d9b6c166a13205f/plugin-authoring/types/claude-code.d.ts", "<$MOD 절대경로>/hooks", "<$MOD 절대경로>/types"]`로. Run: `npx -y -p typescript@5.9 tsc -p /tmp/pepe-stock-tsc/tsconfig.json` → 출력 없음(성공).

---

### Task 2: `quote.ts` 순수 함수

**Files:**
- Create: `$MOD/hooks/quote.ts`, `$MOD/hooks/fixtures.ts`
- Test: `$MOD/hooks/quote.test.ts`

**Interfaces:**
- Produces (`quote.ts`):
  ```ts
  export type Candle = { t: number; close: number }                       // t: epoch 초, 오름차순
  export type Chart = { symbol: string; name: string; currency: string; gmtoffset: number
    price: number; lastTradeAt: number; regular: { start: number; end: number }; candles: Candle[] }
  export type HourChange = { pct: number; base: number; last: number; spanMin: number; isSinceOpen: boolean }
  export type QuoteErrorKind = 'not-found' | 'bad-response' | 'http' | 'network'
  export class QuoteError extends Error { constructor(kind: QuoteErrorKind, message: string, status?: number); kind: QuoteErrorKind; status?: number }
  export function normalizeTicker(input: string): string
  export function kosdaqFallback(symbol: string): string | undefined
  export function chartUrl(symbol: string): string
  export function parseChart(json: unknown): Chart
  export function hourChange(candles: readonly Candle[], windowSec?: number): HourChange   // 기본 3600
  export function isMarketOpen(chart: Pick<Chart, 'regular'>, nowSec: number): boolean
  export function formatPrice(price: number, currency: string): string
  export function formatPct(pct: number): string
  export function hm(epochSec: number, gmtoffsetSec: number): string
  ```
- Produces (`fixtures.ts`): `export const MSFT_CLOSED`, `export const SAMSUNG_OPEN`, `export const NOT_FOUND` — Yahoo 응답 JSON 객체(`{ chart: { result: [{ meta, timestamp, indicators: { quote: [{ close }] } }], error: null } }`). 값은 아래 Step 1 표에서.

- [ ] **Step 1: 픽스처 작성** (`fixtures.ts`)

MSFT meta: `symbol "MSFT", shortName/longName "Microsoft Corporation", currency "USD", gmtoffset -18000, regularMarketPrice 517.99, regularMarketTime 1794862801, currentTradingPeriod.regular { start 1794839400, end 1794862800 }`. 봉 15개(t, close): 1794858600 518.6 · 1794858900 519.12 · 1794859200 519.05 · 1794859500 518.79 · 1794859800 517.96 · 1794860100 518.65 · 1794860400 517.8 · 1794860700 517.74 · 1794861000 518.2 · 1794861300 517.55 · 1794861600 518.28 · 1794861900 518.37 · 1794862200 518.51 · 1794862500 518.07 · 1794862800 517.99.

Samsung meta: `symbol "005930.KS", shortName "SamsungElec", longName "Samsung Electronics Co., Ltd.", currency "KRW", gmtoffset 32400, regularMarketPrice 191400, regularMarketTime 1794882069, regular { start 1794873600, end 1794895200 }`. 봉 15개: 1794878100 194800 · 1794878400 193200 · 1794878700 192200 · 1794879000 192300 · 1794879300 193300 · 1794879600 193400 · 1794879900 192200 · 1794880200 192400 · 1794880500 192000 · 1794880800 192600 · 1794881100 192100 · 1794881400 191600 · 1794881700 191900 · 1794882000 191300 · 1794882069 191400.

NOT_FOUND: `{ chart: { result: null, error: { code: 'Not Found', description: 'No data found, symbol may be delisted' } } }`.

- [ ] **Step 2: 실패하는 테스트 작성** (`quote.test.ts`, `test(name, () => {...})`로 `$` 없이)

- `normalizeTicker trims, uppercases, strips $ and suffixes 6 digits`: `' $msft '`→`'MSFT'`, `'005930'`→`'005930.KS'`, `'005930.kq'`→`'005930.KQ'`, `''`→`''`.
- `kosdaqFallback`: `'005930.KS'`→`'005930.KQ'`, `'MSFT'`→`undefined`, `'005930.KQ'`→`undefined`.
- `chartUrl encodes the symbol`: `chartUrl('BTC-USD')` === `'https://query1.finance.yahoo.com/v8/finance/chart/BTC-USD?interval=5m&range=1d'`.
- `parseChart reads meta and candles`: MSFT_CLOSED → `symbol 'MSFT'`, `name 'Microsoft Corporation'`, `currency 'USD'`, `price 517.99`, `candles.length 15`, `candles[14]` = `{ t: 1794862800, close: 517.99 }`, `regular.end 1794862800`.
- `parseChart throws not-found on Yahoo's error body`: `expect(() => parseChart(NOT_FOUND)).toThrow()` 후 catch해서 `kind === 'not-found'`.
- `parseChart throws bad-response on junk`: `parseChart({})`, `parseChart('x')` → `kind 'bad-response'`.
- `hourChange on the MSFT fixture`: `pct`를 `toBeCloseTo(-0.2042, 3)`, `base 519.05`, `last 517.99`, `spanMin 60`, `isSinceOpen false`.
- `hourChange picks the base by time, not by count`: SAMSUNG_OPEN → `base 193200`, `last 191400`, `spanMin 61`, `pct` ≈ `-0.9317`.
- `hourChange skips null closes`: MSFT 봉 복사본에서 `close[2] = null`(519.05 자리) → `parseChart` 결과 `candles.length 14`, `hourChange(...)`는 `base 519.12`(1794858900 봉), `spanMin 65`.
- `hourChange falls back to the first candle`: 마지막 3개 봉만 → `isSinceOpen true`, `spanMin 10`, `base 518.51`.
- `hourChange with one candle is flat`: 봉 1개 → `pct 0`, `spanMin 0`, `isSinceOpen true`.
- `hourChange throws on no candles`: `[]` → `kind 'bad-response'`.
- `isMarketOpen`: MSFT, now `1794870000` → `false`; `1794850000` → `true`; 정확히 `end` → `true`; `end + 1` → `false`.
- `formatPrice`: `(517.99,'USD')`→`'$517.99'`, `(191400,'KRW')`→`'₩191,400'`, `(1234.5,'EUR')`→`'EUR 1,234.50'`.
- `formatPct`: `1.4211`→`'+1.42%'`, `-0.2042`→`'-0.20%'`, `0`→`'0.00%'`.
- `hm`: `(1794862800, -18000)`→`'16:00'`, `(1794882069, 32400)`→`'11:21'`.

- [ ] **Step 3: 실패 확인**

Run: `claude plugin test $MOD` → quote.test FAIL(모듈 없음).

- [ ] **Step 4: `quote.ts` 구현**

`hourChange` 규칙: `last = candles[length-1]`; `base` = `t <= last.t - windowSec`인 마지막 봉, 없으면 `candles[0]`이고 `isSinceOpen = true`; `pct = (last.close - base.close) / base.close * 100`; `spanMin = Math.round((last.t - base.t) / 60)`. `parseChart`: `result[0].meta`와 `timestamp[i]`/`quote[0].close[i]`를 짝지어 `close`가 숫자인 것만, `name = longName ?? shortName ?? symbol`. `formatPrice`: KRW는 정수+천 단위 콤마에 `₩`, USD는 소수 2자리+콤마에 `$`, 그 외 `${currency} ` 접두. `hm`: `((epochSec + off) % 86400 + 86400) % 86400`을 HH:MM.

- [ ] **Step 5: 통과 확인**

Run: `claude plugin test $MOD` → PASS. Run: tsc 명령 → 출력 없음.

---

### Task 3: `faces.ts` 표정·구간·스파크라인

**Files:**
- Create: `$MOD/hooks/faces.ts`
- Test: `$MOD/hooks/faces.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Mood = 'euphoric' | 'happy' | 'smug' | 'neutral' | 'worried' | 'sad' | 'crying'
  export type FaceKey = Mood | 'loading' | 'error' | 'idle'
  export type Seg = string | readonly [text: string, color: string]      // 문자열은 PEPE_GREEN
  export type Face = { key: FaceKey; label: string; caption: string; lines: readonly (readonly Seg[])[] }
  export const PEPE_GREEN = '#43a047', UP_RED = '#e53935', DOWN_BLUE = '#1e88e5'
  export const FACE_MAX_COLUMNS = 28, FACE_MAX_ROWS = 10
  export const FACE_ORDER: readonly FaceKey[]   // 10개 전부
  export function moodFor(pct: number): Mood
  export const FACES: Readonly<Record<FaceKey, Face>>
  export function lineText(line: readonly Seg[]): string
  export function sparkline(values: readonly number[]): string          // '▁▂▃▄▅▆▇█'
  ```
- 라벨/캡션 고정: euphoric `환희`/`TO THE MOON`, happy `행복`/`feels good man`, smug `뿌듯`/`smug`, neutral `무표정`/`...`, worried `불안`/`monkaS`, sad `슬픔`/`feels bad man`, crying `오열`/`REEEEE`, loading `생각 중`/`hmm...`, error `어리둥절`/`???`, idle `대기 중`/`/pepe MSFT 라고 쳐봐`.

- [ ] **Step 1: 스파크라인 전에 `dataviz` 스킬을 Skill 도구로 불러 읽는다** (차트 코드 규칙).

- [ ] **Step 2: 실패하는 테스트 작성** (`faces.test.ts`)

- `moodFor at the boundaries`: `2.5→euphoric, 2.49→happy, 1.0→happy, 0.99→smug, 0.3→smug, 0.29→neutral, -0.29→neutral, -0.3→worried, -0.99→worried, -1.0→sad, -2.49→sad, -2.5→crying, -9→crying`.
- `every face fits the frame`: `FACE_ORDER.length === 10`; 각 `FACES[key]`에 대해 `lines.length <= 10`, 모든 `lineText(line).length <= 28`(코드포인트 기준 `[...s].length`), `key` 일치, `label`과 `caption`이 위 표와 같음.
- `faces are distinct`: `lines.map(lineText).join('\n')`이 10개 모두 서로 다름.
- `sparkline scales to eight blocks`: `[1,2,3,4,5,6,7,8]`→`'▁▂▃▄▅▆▇█'`, `[5,5]`→`'▄▄'`, `[]`→`''`, `[0,100]`→`'▁█'`.

- [ ] **Step 3: 실패 확인**

Run: `claude plugin test $MOD` → faces.test FAIL.

- [ ] **Step 4: `faces.ts` 구현**

표정 10개를 직접 그린다. 공통 두상(둥근 초록 머리, 큰 눈 두 개, 넓은 입)에 표정만 바꾼다: euphoric 선글라스(`['▀▀▀▀', '#212121']`)와 오른쪽 `🚀` 대신 `>>` 아스키 로켓, happy 입꼬리 올린 `‿`, smug 한쪽 눈 가늘게·입 비스듬, neutral 평평한 입, worried 땀방울(`['°', '#4fc3f7']`)과 물결 입 `~`, sad 처진 입 `⌒`, crying 눈 밑 `['║', '#4fc3f7']` 눈물 두 줄, loading 눈 위로 `?`가 아닌 `…` 말풍선, error 눈 크기 다르게 + `?`, idle 한쪽에 손 `\o/`. 입술은 `['▬▬', '#8d6e63']` 갈색. `moodFor`는 Global Constraints 구간을 내림차순 비교. `sparkline`: `min==max`면 전부 `▄`, 아니면 `Math.round((v-min)/(max-min)*7)` 인덱스.

- [ ] **Step 5: 통과 확인**

Run: `claude plugin test $MOD` → PASS. tsc → 출력 없음. 각 얼굴을 `node`로 출력해 눈으로 확인(아트 텍스트만, `$` 불필요): `cd $MOD/hooks && npx -y -p typescript@5.9 tsc faces.ts --target es2023 --module esnext --outDir /tmp/pepe-faces && node -e "import('/tmp/pepe-faces/faces.js').then(m=>{for(const k of m.FACE_ORDER){console.log('['+k+']');for(const l of m.FACES[k].lines)console.log(m.lineText(l))}})"`.

---

### Task 4: fetch 흐름과 `/pepe` 명령 완성

**Files:**
- Modify: `$MOD/hooks/register.tsx`
- Test: `$MOD/hooks/pepe.test.tsx`

**Interfaces:**
- Consumes: Task 2의 `normalizeTicker, kosdaqFallback, chartUrl, parseChart, hourChange, isMarketOpen, QuoteError`; Task 1의 `view`, `PANE_ID`, `USAGE`.
- Produces (`register.tsx`): `export const POLL_MS = 300_000`, `export const CLOSED_POLL_MS = 1_800_000`, `export const STORE_TICKER = 'ticker'`, `export async function refresh($: EngineInterface, ticker: string): Promise<void>`, `export function errorMessage(err: unknown): string`.
- 명령 응답 문구: set → `` `Pepe가 ${ticker}를 지켜봅니다. 5분마다 갱신해요.` ``; reopen 성공 → 같은 문구; off → `'Pepe 패널을 닫았어요.'`; 훅 실패 `.catch` → `'Pepe 명령을 처리하지 못했어요. 다시 시도해 주세요.'`.
- `errorMessage`: not-found → `'없는 티커예요'`, http → `` `Yahoo 응답 ${status}` ``, bad-response → `'응답을 읽을 수 없어요'`, 그 외 → `'네트워크 오류'`.

- [ ] **Step 1: 실패하는 테스트 추가** (`pepe.test.tsx`; 공통 헬퍼 `boot(on, { store, fetch })`는 `command.register`, `session.start`, `ui.open`→`{ isPlaced: true }`, `ui.close`→`{ value: undefined }`, `mock.store(on, store)`, `mock.clock(on, { now })`, `http.fetch` 훅을 건다. fetch 훅은 `e.url`을 배열에 기록한다.)

- `/pepe MSFT fetches, remembers, opens the pane and fills the view`: now `1794870000000`, fetch → MSFT_CLOSED 200. `ran.text` = `'Pepe가 MSFT를 지켜봅니다. 5분마다 갱신해요.'`; 기록된 url이 `chartUrl('MSFT')`; `ui.open` 훅이 `{ id: 'pepe', title: 'Pepe · MSFT' }`로 불림; `viewOf($)`가 `status 'ok'`, `pct≈-0.2042`, `isOpen false`, `closes.length 13`, `fetchedAt 1794870000000`. (`viewOf($)` = `(await $.state.get({ plugin: 'pepe-stock', key: 'view' })).value?.value`를 `PepeView`로 읽는 테스트 헬퍼; Step 3 전에 입력 형태를 타입 파일 `'state.get'`에서 확인.)
- `/pepe 005930 tries .KS then .KQ on 404`: fetch 훅이 `005930.KS` URL엔 `{ status: 404, ok: false, text: JSON.stringify(NOT_FOUND) }`, `005930.KQ` URL엔 SAMSUNG_OPEN 200 → url 기록 2개 순서대로, view `status 'ok'`, `ticker '005930.KQ'`(fallback으로 찾은 심볼을 view.ticker와 store에 쓴다), `symbol '005930.KS'`(픽스처 값 그대로).
- `an unknown ticker becomes the error view`: 두 번 다 404 → view `{ status: 'error', message: '없는 티커예요' }`, `ran.text`는 여전히 set 문구.
- `http failure becomes the error view`: fetch → `{ status: 429, ok: false, text: '' }` → `message 'Yahoo 응답 429'`; fetch 훅이 throw → `message '네트워크 오류'`.
- `/pepe without args reopens the remembered ticker`: store `{ ticker: 'MSFT' }` → fetch 1회, `ui.open` 1회, text set 문구.
- `/pepe off closes, forgets and idles`: store `{ ticker: 'MSFT' }` → `ui.close` 훅이 `{ id: 'pepe' }`로 불림, 이후 `$.store.get('ticker')`는 `undefined`(mock.store 통해 확인: `on('store.get')`은 mock이 답하므로 `view`가 `{ status: 'idle' }`인지와 `ui.close` 호출로 확인), text `'Pepe 패널을 닫았어요.'`.

- [ ] **Step 2: 실패 확인**

Run: `claude plugin test $MOD` → 새 테스트 FAIL.

- [ ] **Step 3: `register.tsx` 구현**

`fetchChart($, symbol)`: `$.http.fetch(chartUrl(symbol), { headers: { 'User-Agent': 'Mozilla/5.0 (pepe-stock mod)' } })`; `status 404` → `QuoteError('not-found')`, 그 외 `!ok` → `QuoteError('http', ..., status)`; `JSON.parse` 실패 → `bad-response`; fetch 자체 예외 → `QuoteError('network')`. `refresh`: 현재 view가 같은 ticker의 `ok`가 아니면 `loading`으로 먼저 쓴다; `fetchChart` 실패가 `not-found`이고 `kosdaqFallback`이 있으면 한 번 재시도하고, 성공하면 그 심볼을 `$.store.set(STORE_TICKER, …)`과 view.ticker에 쓴다; 성공 시 `hourChange`·`isMarketOpen(chart, now/1000)`·마지막 13개 종가로 `ok` view를 `update`; 실패 시 `error` view. `command.run`: `set` → `normalizeTicker` 적용(빈 문자열이면 USAGE), `$.store.set(STORE_TICKER, ticker)`, `await $.ui.open({ id: PANE_ID, title: 'Pepe · ' + ticker, columns: 36 })`, `await refresh`, 응답. `reopen` → store의 ticker로 같은 흐름. `off` → `$.ui.close({ id: PANE_ID })`, `$.store.delete(STORE_TICKER)`, view를 idle로.

- [ ] **Step 4: 통과 확인**

Run: `claude plugin test $MOD` → PASS. tsc → 출력 없음. `claude plugin validate $MOD` → 오류 0.

---

### Task 5: 패널 그리기

**Files:**
- Create: `$MOD/hooks/pane.tsx`
- Modify: `$MOD/hooks/register.tsx` (`ui.render` 훅 추가)
- Test: `$MOD/hooks/pepe.test.tsx`

**Interfaces:**
- Consumes: `FACES, moodFor, sparkline, lineText, PEPE_GREEN, UP_RED, DOWN_BLUE`(Task 3), `formatPrice, formatPct, hm`(Task 2), `PepeView`(Task 1).
- Produces (`pane.tsx`): `export type Room = { columns: number; rows: number }`, `export function faceKeyOf(view: PepeView): FaceKey`, `export function drawPane($: EngineInterface, e: RenderInput<'Pane'>, view: PepeView): JSX.Element` (요소 표는 안에서 `$.ui.resolve(e)`로 얻고, `room`은 `e.props.bodyColumns`와 `e.props.scroll.bodyRows`에서 읽는다).
- 문구: 등락 접미 `(1시간)` 또는 `` `(개장 후 ${spanMin}분)` ``; 라벨 줄 `` `${label} · ${caption}` ``; 장 마감 줄 `` `장 마감 ${hm(lastTradeAt, gmtoffset)}` ``; 푸터 `` `갱신 ${hm(fetchedAt/1000, 32400)} KST · 5분마다` ``; loading `` `${ticker} 조회 중…` ``; error `` `${ticker}: ${message}` ``.

- [ ] **Step 1: 실패하는 테스트 추가** (`pepe.test.tsx`; 마운트 상수 `PANE = { plugin: 'pepe-stock', component: 'Pane', requestId: 'pepe', props: { title: 'Pepe', isFocused: false, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 24 }, view: {} } } as const`, `surface: 'terminal'`)

- `the idle pane shows the usage face`: 명령 없이 마운트 → `find({ type: 'Text', text: /대기 중/ })` 정의됨, `/\/pepe MSFT/` 정의됨.
- `closed market shows the close time`: `/pepe MSFT`(MSFT_CLOSED, now 1794870000000) 후 마운트 → 텍스트에 `'$517.99'`, `'▼ -0.20%'`, `'(1시간)'`, `'무표정 · ...'`, `'장 마감 16:00'`, `'갱신 08:00 KST'`(1794870000초 = 23:00 UTC = 08:00 KST), 스파크라인 Text가 13글자이고 색 `props.color === '#1e88e5'`.
- `an open market has no close line`: `/pepe 005930`(SAMSUNG_OPEN, now 1794882100000) → `'₩191,400'`, `'▼ -0.93%'`, `'불안 · monkaS'`, `find(/장 마감/)` undefined.
- `young session says 개장 후`: MSFT 봉 마지막 3개만 든 응답, now `1794863000000` → `'(개장 후 10분)'`.
- `error and loading faces`: 404 두 번 → `'MSFT: 없는 티커예요'`와 `/어리둥절/`.
- `a short pane drops the footer and sparkline`: `scroll.bodyRows: 12`로 마운트 → `find(/갱신/)` undefined, 가격 줄은 있음.
- `the pane draws on every surface`: `['terminal','desktop','vscode','mobile']` 각각 마운트해 `/무표정/` 찾기.

- [ ] **Step 2: 실패 확인**

Run: `claude plugin test $MOD` → FAIL.

- [ ] **Step 3: `pane.tsx`와 훅 구현**

`drawPane`: 세로 `Box`; 얼굴은 줄마다 `Box flexDirection="row"` 안에 세그먼트별 `<Text color>`(문자열 세그는 `PEPE_GREEN`), 바깥 `Text`에 `wrap="truncate-end"`. ok일 때 이름(dim) → 가격 + 등락(`pct > 0`이면 `▲` `UP_RED`, `< 0`이면 `▼` `DOWN_BLUE`, 0이면 `■` dim) + 접미 → 스파크라인(등락 색) → 라벨 줄 → `!isOpen`이면 장 마감 줄(dim) → 푸터(dim). `room.rows < FACE_MAX_ROWS + 6`이면 스파크라인과 푸터 생략. `register.tsx`에 `on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e) => drawPane($, e, await read($, view)))`.

- [ ] **Step 4: 통과 확인**

Run: `claude plugin test $MOD` → PASS. tsc → 출력 없음. validate → 오류 0.

---

### Task 6: 5분 타이머와 세션 시작 복원

**Files:**
- Modify: `$MOD/hooks/register.tsx`
- Test: `$MOD/hooks/pepe.test.tsx`

**Interfaces:**
- Consumes: Task 4의 `refresh`, `POLL_MS`, `CLOSED_POLL_MS`, `STORE_TICKER`.
- Produces: `register.tsx` 내부 `tick($: EngineInterface): Promise<void>`(export 안 함). 규칙: store에 ticker 없으면 반환; view가 `ok`이고 `now - fetchedAt < due - 1000`이면 반환, `due`는 `isOpen`이면 `POLL_MS`, 아니면 `CLOSED_POLL_MS`; 그 외 `refresh`. 절대 throw하지 않는다(try/catch).

- [ ] **Step 1: 실패하는 테스트 추가**

- `session.start with a remembered ticker fetches and opens unasked`: store `{ ticker: 'MSFT' }` → `$.session.start` 뒤 `clock.settle()` → fetch 1회, `ui.open` 1회(`title 'Pepe · MSFT'`).
- `an open market polls every five minutes`: SAMSUNG_OPEN, now 1794882100000, `/pepe 005930.KS` → fetch 1회; `clock.advance(POLL_MS)` → 2회(now − fetchedAt = 300000 ≥ due − 1000); 다시 `advance(POLL_MS)` → 3회.
- `a closed market polls every thirty minutes`: MSFT_CLOSED, now 1794870000000, `/pepe MSFT` → 1회; `advance(POLL_MS * 5)`(25분) → 여전히 1회; `advance(POLL_MS)`(30분째) → 2회.
- `a failed poll does not stop the timer`: fetch 훅이 처음엔 throw, 이후 성공 → `/pepe MSFT` 후 view error; `advance(POLL_MS)` → fetch 2회째 불리고 view `ok`.
- `nothing remembered: the timer fetches nothing`: store 비움, `$.session.start`, `advance(POLL_MS * 3)` → fetch 0회.

- [ ] **Step 2: 실패 확인** → `claude plugin test $MOD` FAIL.

- [ ] **Step 3: 구현**

`session.start` 훅에서 명령 등록 뒤: `const remembered = await $.store.get(STORE_TICKER)`; 문자열이면 `void refresh($, remembered)`와 `void $.ui.open({ id: PANE_ID, title: 'Pepe · ' + remembered, columns: 36 })`; 그리고 `$.clock.every(POLL_MS, () => tick($))`; `return next(e)`.

- [ ] **Step 4: 통과 확인** → test PASS, tsc 출력 없음, validate 오류 0.

---

### Task 7: README, 마무리 검증, 실사용 확인

**Files:**
- Create: `$MOD/README.md`
- Verify: 전체

- [ ] **Step 1: README 작성** — 사용법 세 줄(`/pepe MSFT`, `/pepe 005930`, `/pepe off`), 동작(Yahoo 5분봉, 1시간 등락, 표정 구간 표, 5분/30분 갱신, 장 마감 표기, 마지막 종목 기억), 알아둘 점(비공식 API, 지연 시세 가능, 등락 색 한국식, 터미널 144열 미만에서 자동 복원 패널은 `/pepe`로 열어야 함).

- [ ] **Step 2: 전체 검증 명령 세 개를 차례로 실행하고 결과를 그대로 기록**

`claude plugin validate $MOD` → 오류 0. `claude plugin test $MOD` → 전부 PASS. `npx -y -p typescript@5.9 tsc -p /tmp/pepe-stock-tsc/tsconfig.json` → 출력 없음.

- [ ] **Step 3: 실사용 확인(턴이 끝난 뒤 사용자가 함)** — 사용자에게 `/pepe 005930.KS`(장중) 또는 `/pepe MSFT`(장 마감 표기)를 쳐 보라고 안내. 패널에 얼굴·가격·등락·스파크라인이 보이면 완료. 훅 실패 알림이 오면 `superpowers:systematic-debugging`으로 다룬다.
