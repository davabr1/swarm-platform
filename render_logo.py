"""Render the full navbar logo — gold ❯ chevron + white SWARM figlet —
to a 600x600 PNG. Same tight row-pitch technique as render_swarm.py so
the box-drawing connectors tile flush (no font-metric gaps).

Sources:
  swarm/src/components/BootSplash.tsx:22-29  (CHEVRON_MASCOT)
  swarm/src/components/BootSplash.tsx:36-43  (SWARM_ART)
  swarm/src/components/Header.tsx:133-156    (navbar layout: flex row,
    chevron text-amber, SWARM text-foreground, gap-1, Courier New,
    leading == font-size)
  swarm/src/app/globals.css:11,15            (--foreground, --amber)
"""
from PIL import Image, ImageDraw, ImageFont

CHEVRON = [
    "████          ",
    "  ████        ",
    "    ████      ",
    "    ████      ",
    "  ████        ",
    "████          ",
]
# Strip trailing padding — it exists in the source only to line up with
# the SWARM figlet in the layout; the flex gap between the two <pre>s
# handles the real spacing.
CHEVRON = [row.rstrip() for row in CHEVRON]

SWARM_ART = [
    "███████╗██╗    ██╗ █████╗ ██████╗ ███╗   ███╗",
    "██╔════╝██║    ██║██╔══██╗██╔══██╗████╗ ████║",
    "███████╗██║ █╗ ██║███████║██████╔╝██╔████╔██║",
    "╚════██║██║███╗██║██╔══██║██╔══██╗██║╚██╔╝██║",
    "███████║╚███╔███╔╝██║  ██║██║  ██║██║ ╚═╝ ██║",
    "╚══════╝ ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝",
]

SIZE = 600
BG = (0x08, 0x08, 0x0A)          # --background
AMBER = (0xF5, 0x9E, 0x0B)       # --amber
FG = (0xE6, 0xE4, 0xDD)          # --foreground

FONT_PATH = "/System/Library/Fonts/Menlo.ttc"
MARGIN = 8

# --- size hunt -------------------------------------------------------------
# Same binary search as the SWARM-only render: we want the largest font
# size where the combined (chevron + gap + SWARM) strip fits inside the
# square. Row pitch = '█' bbox height so rows tile with no gap.
rows = 6

def measure(font):
    chev_w = max(font.getlength(r) for r in CHEVRON)
    swarm_w = max(font.getlength(r) for r in SWARM_ART)
    bb = font.getbbox("█")
    line_h = bb[3] - bb[1]
    return chev_w, swarm_w, line_h, bb

best = None
lo, hi = 4, 400
while lo <= hi:
    mid = (lo + hi) // 2
    font = ImageFont.truetype(FONT_PATH, mid)
    chev_w, swarm_w, line_h, bb = measure(font)
    gap = max(4, line_h // 3)   # scale gap with font so it stays proportional
    total_w = chev_w + gap + swarm_w
    total_h = line_h * rows
    if total_w <= SIZE - 2 * MARGIN and total_h <= SIZE - 2 * MARGIN:
        best = (mid, chev_w, swarm_w, gap, line_h, bb)
        lo = mid + 1
    else:
        hi = mid - 1

size, chev_w, swarm_w, gap, line_h, bb = best
font = ImageFont.truetype(FONT_PATH, size)

total_w = chev_w + gap + swarm_w
total_h = line_h * rows

img = Image.new("RGB", (SIZE, SIZE), BG)
draw = ImageDraw.Draw(img)

x_chev = (SIZE - total_w) // 2
x_swarm = x_chev + chev_w + gap
y0 = (SIZE - total_h) // 2 - bb[1]

for i, row in enumerate(CHEVRON):
    draw.text((x_chev, y0 + i * line_h), row, font=font, fill=AMBER)
for i, row in enumerate(SWARM_ART):
    draw.text((x_swarm, y0 + i * line_h), row, font=font, fill=FG)

out = "/Users/davidabrahamyan/Desktop/swarm_logo_600.png"
img.save(out, "PNG")
print(f"wrote {out} · font {size} · strip {int(total_w)}x{total_h}")
