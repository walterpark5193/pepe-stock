import { expect, test } from 'claude-code/testing'

import { FACES, FACE_MAX_COLUMNS, FACE_MAX_ROWS, FACE_ORDER, lineText, moodFor, sparkline } from './faces'

test('moodFor at the boundaries', () => {
  const cases: readonly (readonly [number, string])[] = [
    [2.5, 'euphoric'], [2.49, 'happy'], [1.0, 'happy'], [0.99, 'smug'], [0.3, 'smug'],
    [0.29, 'neutral'], [-0.29, 'neutral'], [-0.3, 'worried'], [-0.99, 'worried'],
    [-1.0, 'sad'], [-2.49, 'sad'], [-2.5, 'crying'], [-9, 'crying'],
  ]
  for (const [pct, mood] of cases) expect(`${pct} → ${moodFor(pct)}`).toBe(`${pct} → ${mood}`)
})

const LABELS: Record<string, readonly [string, string]> = {
  euphoric: ['환희', 'TO THE MOON'],
  happy: ['행복', 'feels good man'],
  smug: ['뿌듯', 'smug'],
  neutral: ['무표정', '...'],
  worried: ['불안', 'monkaS'],
  sad: ['슬픔', 'feels bad man'],
  crying: ['오열', 'REEEEE'],
  loading: ['생각 중', 'hmm...'],
  error: ['어리둥절', '???'],
  idle: ['대기 중', '/pepe MSFT 라고 쳐봐'],
}

test('every face fits the frame and carries its label', () => {
  expect(FACE_ORDER.length).toBe(10)
  for (const key of FACE_ORDER) {
    const face = FACES[key]
    expect(face.key).toBe(key)
    const widest = Math.max(...face.lines.map(line => [...lineText(line)].length))
    expect(face.lines.length <= FACE_MAX_ROWS ? 'rows ok' : `${key}: ${face.lines.length} rows`).toBe('rows ok')
    expect(widest <= FACE_MAX_COLUMNS ? 'cols ok' : `${key}: ${widest} cols`).toBe('cols ok')
    expect(`${key} ${face.label} ${face.caption}`).toBe(`${key} ${LABELS[key]?.[0]} ${LABELS[key]?.[1]}`)
  }
})

// 한 글자가 한 칸: ASCII와 브라유 점자(U+2800-28FF, 동아시아 폭 '중립')만 쓴다.
// 블록 요소(▀▄█)는 애매폭이라 CJK 로캘 터미널이 두 칸으로 그린다.
test('face art is ASCII or braille so every glyph is one cell wide', () => {
  for (const key of FACE_ORDER) {
    for (const line of FACES[key].lines) {
      const text = lineText(line)
      expect(/^[\x20-\x7e\u2800-\u28ff]*$/u.test(text) ? 'one-cell' : `${key}: ${text}`).toBe('one-cell')
    }
  }
})

// 얼굴은 점자 픽셀 그림이다: 줄마다 점자 셀이 있어야 한다(ASCII 선그림으로 되돌아가지 않게).
test('every face is braille pixel art at least 12 rows tall', () => {
  for (const key of FACE_ORDER) {
    const face = FACES[key]
    const brailleRows = face.lines.filter(line => /[\u2800-\u28ff]/u.test(lineText(line))).length
    expect(brailleRows >= 12 ? 'pixel art' : `${key}: ${brailleRows} braille rows`).toBe('pixel art')
  }
})

test('faces are distinct', () => {
  const drawings = new Set(FACE_ORDER.map(key => FACES[key].lines.map(lineText).join('\n')))
  expect(drawings.size).toBe(10)
})

test('sparkline scales to eight blocks', () => {
  expect(sparkline([1, 2, 3, 4, 5, 6, 7, 8])).toBe('▁▂▃▄▅▆▇█')
  expect(sparkline([5, 5])).toBe('▄▄')
  expect(sparkline([])).toBe('')
  expect(sparkline([0, 100])).toBe('▁█')
})
