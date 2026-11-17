#!/usr/bin/env python3
"""make-faces.py의 픽셀 캔버스를 PNG로 그려 눈으로 확인한다(순수 파이썬, zlib만). 사용: render-png.py <face> <out.png> [scale]"""
import struct
import sys
import zlib
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import importlib
mf = importlib.import_module('make-faces')


def png(width, height, rows_rgb, path):
    raw = b''.join(b'\x00' + bytes(row) for row in rows_rgb)
    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))
    data += chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    pathlib.Path(path).write_bytes(data)


def hex_rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


BG = (30, 30, 30)

def pixels(c):
    return [[BG if col is None else hex_rgb(mf.COLORS[col]) for col in row] for row in mf.to_ink(c)]


def render(grid, out, scale):
    """grid: 2차원 픽셀 색 배열 → scale배 확대 PNG"""
    rows = []
    for prow in grid:
        row = []
        for rgb in prow:
            row.extend(rgb * scale)
        for _ in range(scale):
            rows.append(row)
    png(len(grid[0]) * scale, len(grid) * scale, rows, out)
    print(f'wrote {out} ({len(grid[0]) * scale}x{len(grid) * scale})')


if __name__ == '__main__':
    kind, out = sys.argv[1], sys.argv[2]
    scale = int(sys.argv[3]) if len(sys.argv) > 3 else 6
    if kind == 'grid':                                   # 10개 표정을 5x2로 한 장에
        faces = [pixels(mf.face(k)) for k in mf.KINDS]
        gap = [BG] * 4
        grid = []
        for r in range(2):
            for y in range(mf.H):
                row = []
                for i in range(5):
                    row.extend(faces[r * 5 + i][y] + gap)
                grid.append(row)
            grid.extend([[BG] * len(grid[0])] * 4)
        render(grid, out, scale)
    else:
        render(pixels(mf.face(kind)), out, scale)
