"""Generate AppHub's deterministic geometric app mark; standard library only."""
from pathlib import Path
import struct
import zlib

ROOT = Path(__file__).resolve().parents[1] / 'assets'
ROOT.mkdir(exist_ok=True)

def rounded(x, y, left, top, width, radius):
    if not (left <= x < left + width and top <= y < top + width):
        return False
    cx = max(left + radius, min(x, left + width - radius))
    cy = max(top + radius, min(y, top + width - radius))
    return (x-cx)**2 + (y-cy)**2 <= radius**2

def png(name, n, background, margin, tile, gap, radius):
    rows = []
    colors = ([(255,255,255), (208,199,255), (208,199,255), (255,255,255)] if background == (99,88,215) else [(99,88,215), (180,167,244), (180,167,244), (99,88,215)])
    for y in range(n):
        row = bytearray([0])
        for x in range(n):
            rgb = background
            for i, color in enumerate(colors):
                if rounded(x+.5,y+.5,margin+(i%2)*(tile+gap),margin+(i//2)*(tile+gap),tile,radius):
                    rgb = color
                    break
            row.extend(rgb)
        rows.append(row)
    def chunk(tag, data):
        return struct.pack('>I',len(data))+tag+data+struct.pack('>I',zlib.crc32(tag+data)&0xffffffff)
    data=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',n,n,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(rows),9))+chunk(b'IEND',b'')
    (ROOT/name).write_bytes(data)

png('icon.png',1024,(99,88,215),210,274,56,72)
png('splash.png',512,(247,246,250),128,110,36,30)
print('AppHub icon and splash generated.')
