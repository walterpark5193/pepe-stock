#!/usr/bin/env python3
"""페페 얼굴 10개를 68x64 픽셀로 그려 브라유 점자 셀(2x4 px) 아트와 색 세그먼트로 바꿔 hooks/faces-art.ts에 쓴다.

실행: python3 -I tools/make-faces.py  (모드 폴더에서)
브라유 문자는 동아시아 폭이 '중립'이라 한국어 로캘 터미널에서도 한 칸이다.
"""
import collections
import math
import pathlib

W_CELLS, H_CELLS = 34, 16
W, H = W_CELLS * 2, H_CELLS * 4

# 색 키 → 터미널 색. G(머리 초록)는 faces.ts의 PEPE_GREEN과 같아야 한다(세그먼트 문자열은 그 색으로 그려진다).
COLORS = {
    'G': '#5aa64a',  # 페페 초록(머리 윤곽선)
    'E': '#cfd8dc',  # 눈 윤곽선·눈꺼풀 선
    'P': '#eceff1',  # 눈동자(채움)
    'L': '#c0603a',  # 입술(채움)
    'R': '#b71c1c',  # 벌린 입 속(채움)
    'K': '#f48fb1',  # 혀(채움)
    'S': '#3f6fd6',  # 셔츠 윤곽선·깃
    'T': '#4fc3f7',  # 눈물·땀(채움)
    'X': '#546e7a',  # 선글라스(채움)
    'Y': '#fdd835',  # $
    'A': '#ffb300',  # ?
}
# 모델 캔버스의 영역 키: G 피부, E 눈 흰자, D 눈꺼풀 선, M 다문 입선(빈 틈), S 셔츠, 그 밖은 색 그대로.
# 선그림으로 바꿀 때 채우는 키와 윤곽선만 남기는 키:
FILLED = {'K', 'T', 'P', 'D'}                     # D(눈꺼풀 선)는 눈 색으로 그린다
DITHERED = {'R': 4, 'X': 2}                        # 점을 N개 중 하나만 찍는다: 입 속은 1/4, 선글라스는 1/2
OUTLINED = {'G': 'G', 'S': 'S', 'E': 'E', 'L': 'L'}  # 영역 → 윤곽선 색(참고 아트처럼 1px 선)
# 셀 하나에 이만큼 이상 들어오면 그 색이 셀 색이 된다(가느다란 띠가 묻히지 않게).
PRIORITY = [('L', 3), ('T', 2), ('P', 2)]


class Canvas:
    def __init__(self):
        self.px = [[None] * W for _ in range(H)]
        self.text = {}  # (row, col) -> (char, colorkey|None): 셀을 글자로 덮는다
        self.extra_ink = []  # (x, y, colorkey): 선그림에 직접 얹는 점(깃 등)

    def inside(self, x, y, cx, cy, rx, ry):
        return ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1

    def ellipse(self, cx, cy, rx, ry, color, only_if=None):
        for y in range(max(0, int(cy - ry - 1)), min(H, int(cy + ry + 2))):
            for x in range(max(0, int(cx - rx - 1)), min(W, int(cx + rx + 2))):
                if self.inside(x, y, cx, cy, rx, ry) and (only_if is None or self.px[y][x] in only_if):
                    self.px[y][x] = color

    def polygon(self, points, color):
        """짝홀 규칙 스캔라인으로 다각형을 채운다. points: [(x, y), ...]"""
        n = len(points)
        for y in range(H):
            yc = y + 0.5
            xs = []
            for i in range(n):
                (x0, y0), (x1, y1) = points[i], points[(i + 1) % n]
                if (y0 <= yc < y1) or (y1 <= yc < y0):
                    xs.append(x0 + (yc - y0) * (x1 - x0) / (y1 - y0))
            xs.sort()
            for a, b in zip(xs[0::2], xs[1::2]):
                for x in range(max(0, int(a + 0.5)), min(W, int(b + 0.5))):
                    self.px[y][x] = color

    def put(self, x, y, color, only_if=None):
        if 0 <= x < W and 0 <= y < H and (only_if is None or self.px[y][x] in only_if):
            self.px[y][x] = color


# 참고 그림(Feels Good Man) 비율: 3/4 측면, 왼쪽을 본다. 눈은 머리 윤곽 위로 불룩 튀어나오고,
# 입은 얼굴 왼쪽 아래를 넓게 차지하며 윤곽 밖으로 살짝 나온다. 오른쪽 절반은 뒤통수(민무늬).
L_EYE = (19, 13, 7.5, 6.5)   # cx, cy, rx, ry
R_EYE = (35, 12, 8.5, 7.0)
MOUTH_CX, MOUTH_HALF = 29, 21


def head(c):
    # 셔츠: 목에서 좁고 어깨로 넓어지는 다각형. 턱 아래 2px 틈이 목이 된다.
    c.polygon([(29, 51), (43, 51), (49, 52), (55, 54), (60, 57), (64, 60), (67, 63), (70, 66), (70, 80),
               (-2, 80), (-2, 66), (1, 63), (5, 60), (10, 57), (16, 54), (23, 52)], 'S')  # 둥근 어깨; 아래는 캔버스 밖으로
    c.ellipse(44, 27, 21, 21, 'G')      # 뒤통수 돔
    c.ellipse(28, 32, 20, 16, 'G')      # 얼굴 앞부분(왼쪽으로 불룩)
    c.ellipse(34, 20, 18, 12, 'G')      # 눈 아래 이마·콧등 메우기


def eye(c, spec, lid=0.33, pupil=(-0.5, 0.5), pupil_r=None, closed=False):
    cx, cy, rx, ry = spec
    if pupil_r is None:
        pupil_r = ry * 0.42
    c.ellipse(cx, cy, rx + 1.5, ry + 1.5, 'D')          # 테두리(구멍)
    c.ellipse(cx, cy, rx, ry, 'E')                      # 흰자
    # 눈꺼풀: 위에서 lid 비율만큼 피부(G)가 덮고, 그 아랫선은 가운데가 높은 호(구멍 2px)
    def lid_y(x):
        t = (x - cx) / rx
        return cy - ry + lid * 2 * ry + 0.35 * ry * t * t
    for x in range(max(0, int(cx - rx - 3)), min(W, int(cx + rx + 4))):
        ly = lid_y(x)
        for y in range(max(0, int(cy - ry - 3)), min(H, int(ly))):
            if c.inside(x, y, cx, cy, rx + 1.5, ry + 1.5):
                c.px[y][x] = 'G'
        y = int(ly)
        if 0 <= y < H and c.inside(x, y, cx, cy, rx + 1.5, ry + 1.5):
            c.px[y][x] = 'D'
    if closed:
        c.ellipse(cx, cy, rx + 1.5, ry + 1.5, 'X')      # 선글라스 렌즈
        c.ellipse(cx - rx * 0.35, cy - ry * 0.2, rx * 0.22, ry * 0.5, 'E', only_if={'X'})  # 반사광
        return
    top = lid_y(cx)
    py = top + (cy + ry - top) * 0.55 + pupil[1]
    c.ellipse(cx + pupil[0], py, pupil_r, pupil_r, 'P', only_if={'E'})


def mouth(c, cx=MOUTH_CX, base_y=30, half_w=MOUTH_HALF, amp=1.0, tilt=-1.0, lip=None, gap=0, inner='R', wavy=0.0):
    """입. base_y는 입꼬리 높이, amp>0이면 가운데가 내려간 웃는 입. gap>0이면 벌린 입(속 색 inner).
    다문 입은 아랫입술 띠만 그려 윤곽 두 줄(입선·아랫입술선)이 되고, 벌린 입은 얇은 윗입술과 아랫입술 띠가 된다."""
    if lip is None:
        lip = 2.2 if gap > 0 else 3.6
    def yc(x):
        t = (x - cx) / half_w
        y = base_y + amp * (1 - t * t) + tilt * t
        if wavy:
            y += wavy * math.sin(x * 1.1)
        return y

    x0, x1 = max(6, int(cx - half_w)), int(cx + half_w)
    for x in range(x0, x1 + 1):
        y = yc(x)
        top = y - gap / 2 - 1.4 if gap > 0 else y           # 다문 입은 입선부터 아래로만
        for yy in range(int(top), int(y + gap / 2 + lip) + 1):
            if 0 <= yy < H and c.px[yy][x] not in ('E', 'S'):
                c.px[yy][x] = 'L'
    if gap > 0:
        for x in range(x0 + 2, x1 - 1):
            y = yc(x)
            for yy in range(int(y - gap / 2) + 1, int(y + gap / 2)):
                c.put(x, yy, inner, only_if={'L', 'G'})
        if inner == 'R':                                    # 혀
            c.ellipse(cx + 2, yc(cx) + gap * 0.22, half_w * 0.45, max(1.2, gap * 0.3), 'K', only_if={'R'})


def tears(c, xs, y0, y1):
    for x in xs:
        for y in range(y0, y1):
            c.put(x, y, 'T', only_if={'G', 'L', 'D', 'S', 'M', 'R'})


def sunglasses(c):
    eye(c, L_EYE, closed=True)
    eye(c, R_EYE, closed=True)
    for x in range(25, 30):                              # 브리지
        for y in (11, 12, 13):
            c.put(x, y, 'X', only_if={'G', 'D'})
    for x in range(43, 54):                              # 다리
        for dy in (0, 1):
            c.put(x, 9 + (x - 43) // 4 + dy, 'X', only_if={'G', 'D'})


def words(c, row, col, text, color=None):
    for i, ch in enumerate(text):
        if ch != ' ':
            c.text[(row, col + i)] = (ch, color)


def to_ink(c):
    """영역 모델 → 선그림. FILLED는 그대로, DITHERED는 격자 점, OUTLINED는 다른 영역과 맞닿은 안쪽 1px만 그린다."""
    ink = [[None] * W for _ in range(H)]
    for y in range(H):
        for x in range(W):
            col = c.px[y][x]
            if col in FILLED:
                ink[y][x] = 'E' if col == 'D' else col
                continue
            if col in DITHERED:
                n = DITHERED[col]
                if (n == 2 and (x + y) % 2 == 0) or (n == 4 and x % 2 == 0 and y % 2 == 0):
                    ink[y][x] = col
                continue
            if col not in OUTLINED:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if not (0 <= nx < W and 0 <= ny < H):
                    continue                                # 캔버스 가장자리는 경계가 아니다(셔츠가 아래로 흘러 나감)
                other = c.px[ny][nx]
                if other == col or other in FILLED or other in DITHERED or other == 'M':
                    continue
                if other is None or other in OUTLINED:
                    pair = {col, other}
                    # 입술 테두리는 입술 색, 눈 테두리는 눈 색, 셔츠 경계는 셔츠 색, 그 밖(피부|배경)은 초록
                    ink[y][x] = 'L' if col == 'L' else 'E' if 'E' in pair else 'S' if 'S' in pair else 'G'
                    break
    for x, y, col in c.extra_ink:
        if 0 <= x < W and 0 <= y < H:
            ink[y][x] = col
    return ink


def collar(c):
    """셔츠 위선에서 아래로 파인 V자 깃."""
    for i in range(5):
        c.extra_ink.append((31 + i, 52 + i, 'S'))
        c.extra_ink.append((41 - i, 52 + i, 'S'))


def face(kind):
    c = Canvas()
    head(c)
    collar(c)
    return _face(kind, c)


def _face(kind, c):
    if kind == 'euphoric':
        sunglasses(c)
        mouth(c, base_y=26, amp=8, gap=8)
        words(c, 0, 0, '$', 'Y'); words(c, 3, 33, '$', 'Y'); words(c, 9, 32, '$', 'Y')
    elif kind == 'happy':                                 # feels good man: 반쯤 감은 눈, 크게 벌린 웃음
        eye(c, L_EYE, lid=0.4); eye(c, R_EYE, lid=0.4)
        mouth(c, base_y=26, amp=7, gap=7)
    elif kind == 'smug':
        eye(c, L_EYE, lid=0.62, pupil=(1, 0)); eye(c, R_EYE, lid=0.42, pupil=(1, 0))
        mouth(c, base_y=29, amp=2.5, tilt=-3)
    elif kind == 'neutral':
        eye(c, L_EYE); eye(c, R_EYE)
        mouth(c, base_y=30, amp=0.5)
    elif kind == 'worried':
        eye(c, L_EYE, lid=0.12, pupil_r=2.0, pupil=(0, 1)); eye(c, R_EYE, lid=0.12, pupil_r=2.2, pupil=(0, 1))
        mouth(c, base_y=31, amp=-1.0, wavy=0.8, half_w=17)
        c.ellipse(55, 6, 1.6, 2.6, 'T'); c.ellipse(60, 12, 1.4, 2.2, 'T')
    elif kind == 'sad':
        eye(c, L_EYE, lid=0.55, pupil=(0, 2)); eye(c, R_EYE, lid=0.55, pupil=(0, 2))
        mouth(c, base_y=29, amp=-4)
    elif kind == 'crying':
        eye(c, L_EYE, lid=0.5, pupil=(0, 2)); eye(c, R_EYE, lid=0.5, pupil=(0, 2))
        mouth(c, base_y=28, amp=-5, gap=4, inner='D')
        tears(c, (16, 23), 21, 48); tears(c, (31, 39), 20, 48)
    elif kind == 'loading':
        eye(c, L_EYE, lid=0.4, pupil=(3, -2)); eye(c, R_EYE, lid=0.4, pupil=(3, -2))
        mouth(c, cx=27, half_w=11, base_y=32, amp=0.5)
        words(c, 0, 24, '. o O')
    elif kind == 'error':
        eye(c, L_EYE, lid=0.1, pupil_r=3.0); eye(c, R_EYE, lid=0.48)
        mouth(c, base_y=31, amp=-1, wavy=1.2, tilt=2, half_w=17)
        words(c, 0, 29, '?', 'A'); words(c, 2, 33, '?', 'A')
    elif kind == 'idle':
        eye(c, L_EYE, pupil=(-2, 0)); eye(c, R_EYE, pupil=(-2, 0))
        mouth(c, base_y=28, amp=4, gap=3)
        words(c, 0, 27, '.----.'); words(c, 1, 27, '( hi! )'); words(c, 2, 27, "'----'")
    else:
        raise SystemExit(f'unknown face {kind}')
    return c


DOTS = ((0x01, 0x08), (0x02, 0x10), (0x04, 0x20), (0x40, 0x80))  # [dy][dx]


def cells(c):
    """행마다 (char, colorkey|None) 셀 목록. colorkey None은 빈 칸이나 기본 글자색."""
    ink = to_ink(c)
    rows = []
    for r in range(H_CELLS):
        row = []
        for col in range(W_CELLS):
            if (r, col) in c.text:
                row.append(c.text[(r, col)])
                continue
            bits, counts = 0, collections.Counter()
            for dy in range(4):
                for dx in range(2):
                    color = ink[r * 4 + dy][col * 2 + dx]
                    if color is not None:
                        bits |= DOTS[dy][dx]
                        counts[color] += 1
            if bits == 0:
                row.append((' ', None))
                continue
            chosen = None
            for key, need in PRIORITY:
                if counts[key] >= need:
                    chosen = key
                    break
            if chosen is None:
                chosen = max(counts, key=lambda k: (counts[k], k == 'G', k))
            row.append((chr(0x2800 + bits), chosen))
        rows.append(row)
    return rows


def segments(row):
    """같은 색이 이어지는 셀을 한 세그먼트로. G와 빈 칸은 색 없는 문자열(= PEPE_GREEN)."""
    while row and row[-1][0] == ' ':
        row = row[:-1]
    segs, cur_text, cur_color = [], '', 'G'
    for ch, color in row:
        key = 'G' if (ch == ' ' or color == 'G') else ('TEXT' if color is None else color)
        if ch == ' ':
            key = cur_color  # 빈 칸은 현재 세그먼트에 붙인다
        if key != cur_color and cur_text:
            segs.append((cur_text, cur_color))
            cur_text = ''
        cur_color = key
        cur_text += ch
    if cur_text:
        segs.append((cur_text, cur_color))
    return segs


def ts_string(s):
    return "'" + s.replace('\\', '\\\\').replace("'", "\\'") + "'"


def emit(kinds):
    out = ["// 생성 파일: tools/make-faces.py가 만든다. 손으로 고치지 말고 스크립트를 바꿔 다시 생성한다.",
           "// 셀은 브라유 점자(U+2800-28FF) 또는 ASCII 한 글자: 어느 터미널에서나 한 칸이다.",
           "export type ArtSeg = string | readonly [text: string, color: string | null]",
           "export type ArtKey = " + ' | '.join(f"'{k}'" for k in kinds),
           "export const ART: Readonly<Record<ArtKey, readonly (readonly ArtSeg[])[]>> = {"]
    for kind in kinds:
        rows = cells(face(kind))
        out.append(f"  {kind}: [")
        for row in rows:
            parts = []
            for text, color in segments(row):
                if color == 'G':
                    parts.append(ts_string(text))
                elif color == 'TEXT':
                    parts.append(f"[{ts_string(text)}, null]")
                else:
                    parts.append(f"[{ts_string(text)}, '{COLORS[color]}']")
            out.append("    [" + ", ".join(parts) + "],")
        out.append("  ],")
    out.append("}")
    return "\n".join(out) + "\n"


KINDS = ['euphoric', 'happy', 'smug', 'neutral', 'worried', 'sad', 'crying', 'loading', 'error', 'idle']

if __name__ == '__main__':
    target = pathlib.Path(__file__).resolve().parent.parent / 'hooks' / 'faces-art.ts'
    target.write_text(emit(KINDS), encoding='utf-8')
    print(f'wrote {target}')
    for kind in KINDS:
        print(f'[{kind}]')
        for row in cells(face(kind)):
            print(''.join(ch for ch, _ in row).rstrip())
