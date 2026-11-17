// 페페 표정 10개, 등락률 → 표정 판정, 스파크라인. `$`를 쓰지 않는다.
// 얼굴 그림은 tools/make-faces.py가 픽셀로 그려 브라유 점자 셀로 바꾼 faces-art.ts에서 온다.
import { ART } from './faces-art'

export type Mood = 'euphoric' | 'happy' | 'smug' | 'neutral' | 'worried' | 'sad' | 'crying'
export type FaceKey = Mood | 'loading' | 'error' | 'idle'

// 문자열 세그먼트는 페페 초록. 튜플은 지정한 색, 색이 null이면 터미널 기본 글자색.
export type Seg = string | readonly [text: string, color: string | null]
export type Face = { key: FaceKey; label: string; caption: string; lines: readonly (readonly Seg[])[] }

export const PEPE_GREEN = '#5aa64a' // make-faces.py의 COLORS['G']와 같아야 한다
export const UP_RED = '#e53935'
export const DOWN_BLUE = '#1e88e5'

export const FACE_MAX_COLUMNS = 34
export const FACE_MAX_ROWS = 16

export const FACE_ORDER: readonly FaceKey[] = [
  'euphoric', 'happy', 'smug', 'neutral', 'worried', 'sad', 'crying', 'loading', 'error', 'idle',
]

export const THRESHOLDS: readonly { mood: Mood; min: number }[] = [
  { mood: 'euphoric', min: 2.5 },
  { mood: 'happy', min: 1.0 },
  { mood: 'smug', min: 0.3 },
  { mood: 'neutral', min: -0.3 },
  { mood: 'worried', min: -1.0 },
  { mood: 'sad', min: -2.5 },
]

// 위쪽 구간은 경계를 포함(≥), 아래쪽 구간은 경계를 다음 단계로 넘긴다(>).
export function moodFor(pct: number): Mood {
  if (pct >= 2.5) return 'euphoric'
  if (pct >= 1.0) return 'happy'
  if (pct >= 0.3) return 'smug'
  if (pct > -0.3) return 'neutral'
  if (pct > -1.0) return 'worried'
  if (pct > -2.5) return 'sad'
  return 'crying'
}

export function lineText(line: readonly Seg[]): string {
  return line.map(seg => (typeof seg === 'string' ? seg : seg[0])).join('')
}

const face = (key: FaceKey, label: string, caption: string): Face => ({ key, label, caption, lines: ART[key] })

export const FACES: Readonly<Record<FaceKey, Face>> = {
  euphoric: face('euphoric', '환희', 'TO THE MOON'),
  happy: face('happy', '행복', 'feels good man'),
  smug: face('smug', '뿌듯', 'smug'),
  neutral: face('neutral', '무표정', '...'),
  worried: face('worried', '불안', 'monkaS'),
  sad: face('sad', '슬픔', 'feels bad man'),
  crying: face('crying', '오열', 'REEEEE'),
  loading: face('loading', '생각 중', 'hmm...'),
  error: face('error', '어리둥절', '???'),
  idle: face('idle', '대기 중', '/pepe MSFT 라고 쳐봐'),
}

const BLOCKS = '▁▂▃▄▅▆▇█'

// 값 범위를 8단계 블록으로. 모두 같으면 가운데 높이, 비어 있으면 빈 문자열.
export function sparkline(values: readonly number[]): string {
  if (values.length === 0) return ''
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (max === min) return '▄'.repeat(values.length)
  return values.map(v => BLOCKS[Math.round(((v - min) / (max - min)) * 7)] ?? '▄').join('')
}
