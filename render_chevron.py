"""Render the pixel ❯ mascot as literal filled squares.

Source: swarm/src/components/BootSplash.tsx:22-29 (CHEVRON_MASCOT).
Each character in a row is one pixel cell; `█` is filled, anything else
is empty. A block in the source is 4 chars wide — this is what aligns the
mascot with the SWARM figlet. We keep that 1:1 so the spacing and step of
the chevron matches the site exactly.
"""
from PIL import Image, ImageDraw

CHEVRON = [
    "████          ",
    "  ████        ",
    "    ████      ",
    "    ████      ",
    "  ████        ",
    "████          ",
]
# Strip trailing padding — only exists for inline alignment with SWARM.
CHEVRON = [row.rstrip() for row in CHEVRON]

SIZE = 600
BG = (0, 0, 0)
FG = (0xF5, 0x9E, 0x0B)  # --amber, globals.css:15
MARGIN = 16

cols = max(len(r) for r in CHEVRON)
rows = len(CHEVRON)

# Largest integer cell size that fits within (SIZE - 2*MARGIN) on both axes.
cell = min((SIZE - 2 * MARGIN) // cols, (SIZE - 2 * MARGIN) // rows)

art_w = cell * cols
art_h = cell * rows
x0 = (SIZE - art_w) // 2
y0 = (SIZE - art_h) // 2

img = Image.new("RGB", (SIZE, SIZE), BG)
draw = ImageDraw.Draw(img)

for ry, row in enumerate(CHEVRON):
    for cx, ch in enumerate(row):
        if ch == "█":
            px = x0 + cx * cell
            py = y0 + ry * cell
            draw.rectangle((px, py, px + cell - 1, py + cell - 1), fill=FG)

out = "/Users/davidabrahamyan/Desktop/swarm_chevron_600.png"
img.save(out, "PNG")
print(f"wrote {out} · cell {cell}px · art {art_w}x{art_h}")
