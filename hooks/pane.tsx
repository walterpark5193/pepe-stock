// 뷰 → 패널 트리. 얼굴은 줄마다 가로 Box에 색 세그먼트 Text를 늘어놓는다(Text 중첩 없음).
import type { EngineInterface, RenderInput } from 'claude-code'

import type { PepeView } from '../types'
import {
  DOWN_BLUE,
  FACES,
  FACE_MAX_COLUMNS,
  FACE_MAX_ROWS,
  PEPE_GREEN,
  UP_RED,
  moodFor,
  sparkline,
  type FaceKey,
  type Seg,
} from './faces'
import { formatPct, formatPrice, hm } from './quote'

const KST = 32400

export const USAGE_LINES: readonly string[] = [
  '/pepe MSFT      종목을 정하고 페페 패널을 엽니다 (미국 티커, BTC-USD 같은 코인도 됩니다)',
  '/pepe 005930    국내 종목은 6자리 코드만 넣으면 .KS를 붙여 찾습니다',
  '/pepe off       패널을 닫고 조회를 멈춥니다',
]

export type Room = { columns: number; rows: number }

export function faceKeyOf(view: PepeView): FaceKey {
  switch (view.status) {
    case 'idle':
      return 'idle'
    case 'loading':
      return 'loading'
    case 'error':
      return 'error'
    case 'ok':
      return moodFor(view.pct)
  }
}

export function drawPane($: EngineInterface, e: RenderInput<'Pane'>, view: PepeView): JSX.Element {
  const { Box, Text } = $.ui.resolve(e)
  const room: Room = { columns: e.props.bodyColumns, rows: e.props.scroll.bodyRows }
  const face = FACES[faceKeyOf(view)]
  const compact = room.rows < FACE_MAX_ROWS + 6 // 스파크라인과 갱신 시각을 생략
  const showFace = room.columns >= FACE_MAX_COLUMNS // 낮은 패널은 스크롤되지만 좁은 패널은 줄이 깨지므로 얼굴만 뺀다

  const segment = (seg: Seg) => {
    if (typeof seg === 'string') return <Text color={PEPE_GREEN}>{seg}</Text>
    const [text, color] = seg
    return color === null ? <Text>{text}</Text> : <Text color={color}>{text}</Text>
  }

  const label = (
    <Text>
      {face.label} · {face.caption}
    </Text>
  )

  let body: JSX.Element
  switch (view.status) {
    case 'idle':
      body = (
        <Box flexDirection="column">
          {label}
          {USAGE_LINES.map(line => (
            <Text dimColor>{line}</Text>
          ))}
        </Box>
      )
      break
    case 'loading':
      body = (
        <Box flexDirection="column">
          <Text dimColor>{`${view.ticker} 조회 중…`}</Text>
          {label}
        </Box>
      )
      break
    case 'error':
      body = (
        <Box flexDirection="column">
          <Text color={UP_RED}>{`${view.ticker}: ${view.message}`}</Text>
          {label}
          <Text dimColor>5분 뒤 다시 조회해요</Text>
        </Box>
      )
      break
    case 'ok': {
      const tone = view.pct > 0 ? UP_RED : view.pct < 0 ? DOWN_BLUE : undefined
      const arrow = view.pct > 0 ? '▲' : view.pct < 0 ? '▼' : '■'
      const spark = sparkline(view.closes)
      body = (
        <Box flexDirection="column">
          <Text dimColor>{view.name}</Text>
          <Box flexDirection="row">
            <Text weight="semibold">{`${formatPrice(view.price, view.currency)}   `}</Text>
            <Text color={tone} dimColor={tone === undefined}>{`${arrow} ${formatPct(view.pct)}`}</Text>
            <Text dimColor>{view.isSinceOpen ? `  (개장 후 ${view.spanMin}분)` : '  (1시간)'}</Text>
          </Box>
          {!compact && spark.length > 0 && (
            <Box flexDirection="row">
              <Text dimColor>{spark.slice(0, -1)}</Text>
              <Text color={tone} dimColor={tone === undefined}>{spark.slice(-1)}</Text>
            </Box>
          )}
          {label}
          {!view.isOpen && <Text dimColor>{`장 마감 ${hm(view.lastTradeAt, view.gmtoffset)}`}</Text>}
          {!compact && <Text dimColor>{`갱신 ${hm(view.fetchedAt / 1000, KST)} KST · 5분마다`}</Text>}
        </Box>
      )
      break
    }
  }

  return (
    <Box flexDirection="column">
      {showFace && (
        <Box flexDirection="column" marginTop={1} marginBottom={1}>
          {face.lines.map(line => <Box flexDirection="row">{line.map(segment)}</Box>)}
        </Box>
      )}
      {!showFace && (
        <Text dimColor>{`패널이 좁아 얼굴을 생략했어요 (${room.columns}열, ${FACE_MAX_COLUMNS}열 필요)`}</Text>
      )}
      {body}
    </Box>
  )
}
