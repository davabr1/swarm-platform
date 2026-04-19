from PIL import Image, ImageDraw, ImageFont

SWARM_ART = [
    "███████╗██╗    ██╗ █████╗ ██████╗ ███╗   ███╗",
    "██╔════╝██║    ██║██╔══██╗██╔══██╗████╗ ████║",
    "███████╗██║ █╗ ██║███████║██████╔╝██╔████╔██║",
    "╚════██║██║███╗██║██╔══██║██╔══██╗██║╚██╔╝██║",
    "███████║╚███╔███╔╝██║  ██║██║  ██║██║ ╚═╝ ██║",
    "╚══════╝ ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝",
]

SIZE = 600
BG = (0, 0, 0)
FG = (255, 255, 255)

FONT_PATH = "/System/Library/Fonts/Menlo.ttc"

cols = max(len(line) for line in SWARM_ART)
rows = len(SWARM_ART)

# Binary-search the largest font size that fits both width and height
# with a small margin.
MARGIN = 4
max_w = SIZE - 2 * MARGIN
max_h = SIZE - 2 * MARGIN

# For ANSI Shadow art the blocks are designed to tile row-on-row with
# line-height == font size (1em). PIL's default line-height (ascent+descent)
# leaves gaps, so we measure the actual '█' glyph height and use that.
best = None
lo, hi = 4, 400
while lo <= hi:
    mid = (lo + hi) // 2
    font = ImageFont.truetype(FONT_PATH, mid)
    sample = SWARM_ART[0]
    w = font.getlength(sample)
    # Use the full-block glyph height as the row pitch — this is what tiles.
    bb = font.getbbox("█")
    block_h = bb[3] - bb[1]
    h = block_h * rows
    if w <= max_w and h <= max_h:
        best = (mid, w, h, block_h, bb)
        lo = mid + 1
    else:
        hi = mid - 1

size, text_w, text_h, line_h, block_bb = best
font = ImageFont.truetype(FONT_PATH, size)

img = Image.new("RGB", (SIZE, SIZE), BG)
draw = ImageDraw.Draw(img)

# Draw each line at a row pitch equal to the block glyph height so the
# box-drawing connectors tile seamlessly. Offset each draw by -block_bb[1]
# so the top of '█' lands exactly at the integer row top.
y0 = (SIZE - text_h) // 2 - block_bb[1]

for i, line in enumerate(SWARM_ART):
    line_w = font.getlength(line)
    line_x = (SIZE - line_w) // 2
    draw.text((line_x, y0 + i * line_h), line, font=font, fill=FG)

out = "/Users/davidabrahamyan/vibes/cryptathon/swarm_ascii_600.png"
img.save(out, "PNG")
print(f"wrote {out} · font size {size} · text {text_w}x{text_h}")
