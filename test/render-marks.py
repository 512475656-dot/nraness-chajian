# -*- coding: utf-8 -*-
"""
Rasterise the five tile marks (monoline SVG paths) with Pillow so the geometry can actually be
looked at — there is no browser or SVG renderer on this machine.

Supports the subset the marks use: M / L / H / V / C / A / Z, absolute and relative.
Arcs are converted to centre parameterisation and sampled, which is faithful enough to judge
the shape of a hairline glyph.
"""
import math
import os
from PIL import Image, ImageDraw

SS = 4                      # supersample factor
SIZE = 96                   # output px per glyph
MARKS = {
    'game': [
        'M4.4 4.8h15.2a2.1 2.1 0 0 1 2.1 2.1v8a2.1 2.1 0 0 1-2.1 2.1H4.4a2.1 2.1 0 0 1-2.1-2.1v-8a2.1 2.1 0 0 1 2.1-2.1z',
        'M6.6 9.2l2.6 2.4-2.6 2.4',
        'M12.4 13.9h4.4',
        'M12 17v2.6M8.7 19.6h6.6',
    ],
    'notebook': [
        'M5 3.2h11.4a2.4 2.4 0 0 1 2.4 2.4v12.8a2.4 2.4 0 0 1-2.4 2.4H5z',
        'M5 3.2v17.6',
        'M8.4 8.2h6.6',
        'M8.4 11.6h4.4',
        'M15.4 20.8l4.2-4.2-1.6-1.6-4.2 4.2z',
    ],
    'research': [
        'M10.6 3.6a7 7 0 1 0 0 14 7 7 0 0 0 0-14z',
        'M15.6 15.6l4.8 4.8',
        'M7.6 13.2V9.8M10.6 13.2v-5M13.6 13.2v-2.6',
    ],
    'news': [
        'M3.4 12a8.6 8.6 0 1 0 17.2 0 8.6 8.6 0 0 0-17.2 0z',
        'M12 3.4c3.4 3.7 3.4 13.5 0 17.2c-3.4-3.7-3.4-13.5 0-17.2z',
        'M3.4 12h17.2',
        'M5.1 7.6h13.8',
    ],
    'blank': [
        'M4.4 4.4h15.2v15.2H4.4z',
        'M12 8.4v7.2M8.4 12h7.2',
    ],
}


def tokenize(d):
    out, num = [], ''
    for ch in d:
        if ch.isalpha():
            if num:
                out.append(float(num)); num = ''
            out.append(ch)
        elif ch in ' ,':
            if num:
                out.append(float(num)); num = ''
        elif ch == '-' and num:
            # A negative number may follow another digit directly: "1-2.1".
            out.append(float(num)); num = '-'
        else:
            num += ch
    if num:
        out.append(float(num))
    return out


def cubic(p0, p1, p2, p3, steps=28):
    pts = []
    for i in range(steps + 1):
        t = i / steps
        mt = 1 - t
        x = mt**3 * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t**3 * p3[0]
        y = mt**3 * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t**3 * p3[1]
        pts.append((x, y))
    return pts


def arc(p0, rx, ry, rot, large, sweep, p1, steps=48):
    if rx == 0 or ry == 0:
        return [p0, p1]
    phi = math.radians(rot)
    dx2, dy2 = (p0[0] - p1[0]) / 2.0, (p0[1] - p1[1]) / 2.0
    x1 = math.cos(phi) * dx2 + math.sin(phi) * dy2
    y1 = -math.sin(phi) * dx2 + math.cos(phi) * dy2
    rx, ry = abs(rx), abs(ry)
    lam = x1 * x1 / (rx * rx) + y1 * y1 / (ry * ry)
    if lam > 1:
        s = math.sqrt(lam)
        rx *= s
        ry *= s
    sign = -1 if large == sweep else 1
    num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1
    den = rx * rx * y1 * y1 + ry * ry * x1 * x1
    co = sign * math.sqrt(max(0.0, num / den)) if den else 0.0
    cx1 = co * rx * y1 / ry
    cy1 = -co * ry * x1 / rx
    cx = math.cos(phi) * cx1 - math.sin(phi) * cy1 + (p0[0] + p1[0]) / 2
    cy = math.sin(phi) * cx1 + math.cos(phi) * cy1 + (p0[1] + p1[1]) / 2
    def angle(ux, uy, vx, vy):
        dot = ux * vx + uy * vy
        n = math.hypot(ux, uy) * math.hypot(vx, vy)
        a = math.acos(max(-1.0, min(1.0, dot / n))) if n else 0.0
        return -a if (ux * vy - uy * vx) < 0 else a
    theta1 = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry)
    dtheta = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry)
    if not sweep and dtheta > 0:
        dtheta -= 2 * math.pi
    elif sweep and dtheta < 0:
        dtheta += 2 * math.pi
    pts = []
    for i in range(steps + 1):
        t = theta1 + dtheta * i / steps
        x = cx + rx * math.cos(t) * math.cos(phi) - ry * math.sin(t) * math.sin(phi)
        y = cy + rx * math.cos(t) * math.sin(phi) + ry * math.sin(t) * math.cos(phi)
        pts.append((x, y))
    return pts


def render_path(d, scale, stroke=3):
    """Return a list of polylines in output pixels."""
    toks = tokenize(d)
    i, cur, start = 0, (0.0, 0.0), (0.0, 0.0)
    cmd = None
    lines = []
    while i < len(toks):
        if isinstance(toks[i], str):
            cmd = toks[i]; i += 1
        rel = cmd.islower()
        c = cmd.upper()
        if c == 'M':
            x, y = toks[i], toks[i + 1]; i += 2
            cur = (cur[0] + x, cur[1] + y) if rel else (x, y)
            start = cur
            cmd = 'l' if rel else 'L'          # subsequent pairs are implicit lineto
        elif c == 'L':
            x, y = toks[i], toks[i + 1]; i += 2
            nxt = (cur[0] + x, cur[1] + y) if rel else (x, y)
            lines.append([cur, nxt]); cur = nxt
        elif c == 'H':
            x = toks[i]; i += 1
            nxt = (cur[0] + x, cur[1]) if rel else (x, cur[1])
            lines.append([cur, nxt]); cur = nxt
        elif c == 'V':
            y = toks[i]; i += 1
            nxt = (cur[0], cur[1] + y) if rel else (cur[0], y)
            lines.append([cur, nxt]); cur = nxt
        elif c == 'C':
            x1, y1, x2, y2, x, y = toks[i:i + 6]; i += 6
            if rel:
                p1 = (cur[0] + x1, cur[1] + y1); p2 = (cur[0] + x2, cur[1] + y2); p3 = (cur[0] + x, cur[1] + y)
            else:
                p1, p2, p3 = (x1, y1), (x2, y2), (x, y)
            pts = cubic(cur, p1, p2, p3)
            lines.append(pts); cur = p3
        elif c == 'A':
            rx, ry, rot, large, sweep, x, y = toks[i:i + 7]; i += 7
            nxt = (cur[0] + x, cur[1] + y) if rel else (x, y)
            lines.append(arc(cur, rx, ry, rot, int(large), int(sweep), nxt)); cur = nxt
        elif c == 'Z':
            lines.append([cur, start]); cur = start
        else:
            i += 1
    return [[(px * scale, py * scale) for px, py in line] for line in lines]


def tile_sheet():
    """Compose mock tiles at the real size, so the mark's share of the tile can be measured."""
    out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'mark-preview')
    os.makedirs(out_dir, exist_ok=True)
    TILE = 258 * SS          # desktop tile: aspect 1, --wsb-card-min is 258px
    PAD_X, PAD_TOP, PAD_BOT = 10 * SS, 13 * SS, 11 * SS
    GAP, NAME_H = 9 * SS, 18 * SS
    cell_h = TILE - PAD_TOP - PAD_BOT - GAP - NAME_H
    cell_w = TILE - 2 * PAD_X
    box = min(cell_w, cell_h)                    # svg is 100%/100% with preserveAspectRatio=meet
    scale = box / 24.0
    names = {'game': '开发控制台', 'news': '每日新闻', 'notebook': '框架笔记', 'research': '研究台'}
    sheet = Image.new('RGB', (TILE * len(names), TILE), (14, 17, 26))
    font_path = r'C:\Windows\Fonts\msyh.ttc'
    font = None
    try:
        from PIL import ImageFont
        font = ImageFont.truetype(font_path, int(12.5 * SS))
    except Exception:
        pass
    for index, (kind, label) in enumerate(names.items()):
        img = Image.new('RGB', (TILE, TILE), (14, 17, 26))
        draw = ImageDraw.Draw(img)
        # glass tile
        draw.rounded_rectangle([0, 0, TILE - 1, TILE - 1], radius=20 * SS,
                               fill=(44, 52, 68), outline=(96, 108, 128), width=max(1, SS))
        ink = (238, 242, 252)
        stroke = max(2, int(1.5 * SS))
        min_x = min_y = 10 ** 6
        max_x = max_y = -10 ** 6
        for d in MARKS[kind]:
            for line in render_path(d, scale):
                if len(line) > 1:
                    draw.line(line, fill=ink, width=stroke, joint='curve')
                for px, py in line:
                    min_x, min_y = min(min_x, px), min(min_y, py)
                    max_x, max_y = max(max_x, px), max(max_y, py)
        # centre the artwork inside its cell
        art_w, art_h = max_x - min_x, max_y - min_y
        off_x = PAD_X + (cell_w - art_w) / 2 - min_x
        off_y = PAD_TOP + (cell_h - art_h) / 2 - min_y
        img = Image.new('RGB', (TILE, TILE), (14, 17, 26))
        draw = ImageDraw.Draw(img)
        draw.rounded_rectangle([0, 0, TILE - 1, TILE - 1], radius=20 * SS,
                               fill=(44, 52, 68), outline=(96, 108, 128), width=max(1, SS))
        for d in MARKS[kind]:
            for line in render_path(d, scale):
                moved = [(px + off_x, py + off_y) for px, py in line]
                if len(moved) > 1:
                    draw.line(moved, fill=ink, width=stroke, joint='curve')
        if font:
            tw = draw.textlength(label, font=font)
            draw.text((TILE / 2 - tw / 2, PAD_TOP + cell_h + GAP), label, fill=ink, font=font)
        print('tile %-9s artwork %.0f×%.0f of %d px = %.0f%% wide, %.0f%% tall'
              % (kind, art_w / SS, art_h / SS, TILE / SS, 100 * art_w / TILE, 100 * art_h / TILE))
        sheet.paste(img.resize((258, 258), Image.LANCZOS), (index * 258, 0))
    sheet = sheet.resize((258 * len(names), 258), Image.LANCZOS)
    sheet.save(os.path.join(out_dir, 'tile-mockup.png'))
    print('tiles: ' + os.path.join(out_dir, 'tile-mockup.png'))


def main():
    out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'mark-preview')
    os.makedirs(out_dir, exist_ok=True)
    scale = SIZE * SS / 24.0
    sheet = Image.new('RGB', (SIZE * SS * 5, SIZE * SS), (12, 14, 24))
    for index, (kind, paths) in enumerate(MARKS.items()):
        img = Image.new('RGB', (SIZE * SS, SIZE * SS), (12, 14, 24))
        draw = ImageDraw.Draw(img)
        for d in paths:
            for line in render_path(d, scale):
                if len(line) > 1:
                    draw.line(line, fill=(238, 242, 252), width=4 * SS, joint='curve')
        img = img.resize((SIZE, SIZE), Image.LANCZOS)
        img.save(os.path.join(out_dir, kind + '.png'))
        sheet.paste(img, (index * SIZE, 0))
        print('rendered ' + kind)
    sheet.save(os.path.join(out_dir, 'all-marks.png'))
    print('sheet: ' + os.path.join(out_dir, 'all-marks.png'))
    tile_sheet()


if __name__ == '__main__':
    main()
