"""
Gera todos os vetores da marca EXPRESSION SESSION.

    python3 brand/tools/build_brand.py      (precisa de shapely e fonttools)
    node brand/tools/render.cjs brand/tools/jobs.json   (exporta os PNG)

Saidas: brand/logos/svg, brand/logos/proposals, brand/icons/svg,
brand/textures, brand/patterns, brand/promotional/stickers, brand/mockups,
public/ (favicon e icones do app) e o bloco de icones de src/ui/icons.ts.
Os arquivos gerados nao devem ser editados a mao: edite este script.
"""

from __future__ import annotations

import json
import math
import os
import random
import re
import sys

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from shapely import affinity
from shapely.geometry import Polygon, box
from shapely.ops import unary_union

sys.path.insert(0, os.path.dirname(__file__))
from letters import GLYPHS, H, distress, stencil, to_path, word  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BRAND = os.path.join(ROOT, "brand")
FONTS = os.path.join(ROOT, "src", "ui", "fonts")

BLACK = "#0A0A0A"
RED = "#E30613"
WHITE = "#FFFFFF"
CONCRETE = "#808080"
ASPHALT = "#242424"

JOBS: list[dict] = []


def out(rel: str, content: str):
    p = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        f.write(content)
    return rel


def svg(w, h, body, title="EXPRESSION SESSION", bg=None):
    rect = f'<rect width="{w}" height="{h}" fill="{bg}"/>' if bg else ""
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {round(w, 2)} {round(h, 2)}" '
        f'width="{round(w, 2)}" height="{round(h, 2)}" role="img" aria-label="{title}">'
        f"<title>{title}</title>{rect}{body}</svg>\n"
    )


def P(d, fill, extra=""):
    return f'<path fill="{fill}" fill-rule="evenodd" d="{d}"{extra}/>'


# ---------------------------------------------------------------- texto em curvas

_font_cache: dict[str, TTFont] = {}


def text_path(text, font_file, size, x=0.0, y=0.0, tracking=0.0, anchor="start"):
    """Texto convertido em contornos (o logotipo nao depende de fonte instalada)."""
    f = _font_cache.setdefault(font_file, TTFont(os.path.join(FONTS, font_file)))
    gs = f.getGlyphSet()
    cmap = f.getBestCmap()
    upm = f["head"].unitsPerEm
    s = size / upm
    hmtx = f["hmtx"]
    names = [cmap.get(ord(c)) for c in text]
    adv = sum(hmtx[n][0] * s + tracking for n in names if n) - tracking
    cx = x - (adv if anchor == "end" else adv / 2 if anchor == "middle" else 0)
    ds = []
    for n in names:
        if not n:
            continue
        pen = SVGPathPen(gs)
        gs[n].draw(TransformPen(pen, (s, 0, 0, -s, cx, y)))
        ds.append(pen.getCommands())
        cx += hmtx[n][0] * s + tracking
    return "".join(ds), adv


def cap_height(font_file):
    f = _font_cache.setdefault(font_file, TTFont(os.path.join(FONTS, font_file)))
    return f["OS/2"].sCapHeight / f["head"].unitsPerEm


BC = "barlow-condensed-latin-700-normal.woff2"
BC8 = "barlow-condensed-latin-800-normal.woff2"
ANTON = "anton-latin-400-normal.woff2"

# ---------------------------------------------------------------- elementos de marca

K = math.tan(math.radians(11))


def stripes(x, y, h=H, widths=(30, 20, 12), gap=9):
    """'///' — tres faixas de velocidade inclinadas no mesmo eixo do lettering."""
    geoms = []
    cx = x
    for w in widths:
        geoms.append(Polygon([(cx + K * h, y), (cx + K * h + w, y), (cx + w, y + h), (cx, y + h)]))
        cx += w + gap
    return unary_union(geoms), cx - gap - x + K * h


TAG = "UNDERGROUND SURF CULTURE"


def wordmark_geoms(textured=False):
    """Linha 1: EXPRESSION. Linha 2: /// SESSION, alinhada pela direita."""
    g1, w1 = word("EXPRESSION")
    g2, w2 = word("SESSION")
    gap = 22
    y2 = H + gap
    g2 = affinity.translate(g2, w1 - w2, y2)
    st, sw = stripes(w1 - w2 - 16 - 150 + 0, y2, widths=(64, 42, 24), gap=10)
    # encaixa as faixas no espaco a esquerda de SESSION
    stx = st.bounds
    st = affinity.translate(st, (w1 - w2 - 18) - stx[2], 0)
    if textured:
        g1 = distress(g1, seed=11)
        g2 = distress(g2, seed=23)
    return g1, g2, st, w1, y2 + H


def primary_logo(fg=WHITE, accent=RED, textured=False, tagline=True, pad=24):
    g1, g2, st, w, h = wordmark_geoms(textured)
    body = P(to_path(g1, pad, pad), fg) + P(to_path(g2, pad, pad), fg) + P(to_path(st, pad, pad), accent)
    total_h = h + pad * 2
    if tagline:
        size = 30
        d, adv = text_path(TAG, BC, size, pad + w, pad + h + 22 + size * cap_height(BC), tracking=7.2, anchor="end")
        body += P(d, fg)
        # fio vermelho antes da assinatura
        ln = pad + w - adv - 18
        body += f'<rect x="{pad}" y="{pad + h + 22 + 3}" width="{ln - pad}" height="5" fill="{accent}"/>'
        total_h = h + 22 + size * cap_height(BC) + pad * 2
    return svg(w + pad * 2, total_h, body)


def horizontal_logo(fg=WHITE, accent=RED, textured=False, pad=24):
    g1, w1 = word("EXPRESSION")
    g2, w2 = word("SESSION")
    st, sw = stripes(0, 0, widths=(30, 20, 12), gap=8)
    gap = 22
    st = affinity.translate(st, w1 + gap, 0)
    g2 = affinity.translate(g2, w1 + gap + sw + gap, 0)
    if textured:
        g1, g2 = distress(g1, 3), distress(g2, 5)
    W = w1 + gap + sw + gap + w2
    body = P(to_path(g1, pad, pad), fg) + P(to_path(st, pad, pad), accent) + P(to_path(g2, pad, pad), fg)
    return svg(W + pad * 2, H + pad * 2, body)


def monogram_geom(clean=True):
    """ES: E e S colados, com o corte vermelho do Lip atravessando o vao."""
    gE, wE = GLYPHS["E"]()
    gS, wS = GLYPHS["S"]()
    gap = 26
    gS = affinity.translate(gS, wE + gap, 0)
    g = unary_union([gE, gS])
    g = affinity.affine_transform(g, [1, -K, 0, 1, K * H, 0])
    W = wE + gap + wS + K * H
    # faixa diagonal (o Lip): atravessa o vao entre as letras no mesmo eixo
    sx = wE + 4
    slash = Polygon([(sx + K * H + 6, -14), (sx + K * H + 6 + 15, -14), (sx + 15 - 4, H + 14), (sx - 4, H + 14)])
    # recorte (respiro) em volta da faixa
    halo = slash.buffer(4.5, join_style=2)
    g = g.difference(halo)
    return g, slash, W


def symbol_svg(fg=WHITE, accent=RED, bg=None, pad=18, badge=False):
    g, slash, W = monogram_geom()
    hh = H + 28
    body = ""
    if badge:
        # selo chanfrado em volta
        bw, bh = W + pad * 2 + 24, hh + pad * 2
        c = 22
        poly = f"M{c} 0 L{bw} 0 L{bw} {bh - c} L{bw - c} {bh} L0 {bh} L0 {c}Z"
        body += f'<path d="{poly}" fill="{bg or BLACK}"/>'
        ox, oy = pad + 12, pad + 14
        body += P(to_path(g, ox, oy), fg) + P(to_path(slash, ox, oy), accent)
        return svg(bw, bh, body)
    ox, oy = pad, pad + 14
    body += P(to_path(g, ox, oy), fg) + P(to_path(slash, ox, oy), accent)
    return svg(W + pad * 2, hh + pad * 2, body, bg=bg)


def app_icon_svg(size=1024, clean=True):
    g, slash, W = monogram_geom()
    s = size * 0.62 / W
    gh = (H + 28) * s
    ox = (size - W * s) / 2
    oy = (size - gh) / 2 + 14 * s
    g2 = affinity.scale(g, s, s, origin=(0, 0))
    sl2 = affinity.scale(slash, s, s, origin=(0, 0))
    r = size * 0.18
    body = f'<rect width="{size}" height="{size}" rx="{r}" fill="{BLACK}"/>'
    # faixa vermelha de fundo, em diagonal, saindo do canto (energia)
    body += f'<path d="M{size*0.70} 0 L{size*0.86} 0 L{size*0.38} {size} L{size*0.22} {size}Z" fill="{ASPHALT}"/>'
    body += P(to_path(g2, ox, oy), WHITE) + P(to_path(sl2, ox, oy), RED)
    body += f'<rect x="{size*0.19}" y="{size*0.83}" width="{size*0.62}" height="{size*0.018}" fill="{RED}"/>'
    return svg(size, size, body)


def favicon_svg():
    # Em 16-32 px o monograma completo vira mancha: so o S, preto sobre o vermelho
    # da marca, com a faixa do Lip embaixo. Reconhecivel na aba do navegador.
    gS, wS = GLYPHS["S"]()
    gS = affinity.affine_transform(gS, [1, -K, 0, 1, K * H, 0])
    W = wS + K * H
    s = 46 / 100
    g2 = affinity.scale(gS, s, s, origin=(0, 0))
    ox = (64 - W * s) / 2
    oy = 6
    body = f'<rect width="64" height="64" rx="10" fill="{RED}"/>'
    body += P(to_path(g2, ox, oy), BLACK)
    body += f'<path d="M10 56 L56 56 L54 61 L8 61Z" fill="{BLACK}"/>'
    return svg(64, 64, body)


def vertical_logo(fg=WHITE, accent=RED, pad=28):
    g, slash, W = monogram_geom()
    g1, w1 = word("EXPRESSION")
    g2, w2 = word("SESSION")
    s_sym = 1.35
    sym_w = W * s_sym
    total_w = w1
    body = ""
    gs = affinity.scale(g, s_sym, s_sym, origin=(0, 0))
    ss = affinity.scale(slash, s_sym, s_sym, origin=(0, 0))
    sx = pad + (total_w - sym_w) / 2
    body += P(to_path(gs, sx, pad + 14 * s_sym), fg) + P(to_path(ss, sx, pad + 14 * s_sym), accent)
    y = pad + (H + 28) * s_sym + 40
    body += P(to_path(g1, pad, y), fg)
    y2 = y + H + 18
    body += P(to_path(g2, pad + (w1 - w2) / 2, y2), fg)
    size = 30
    ty = y2 + H + 26 + size * cap_height(BC)
    d, adv = text_path(TAG, BC, size, pad + w1 / 2, ty, tracking=7.2, anchor="middle")
    body += P(d, fg)
    body += f'<rect x="{pad + w1/2 - 40}" y="{ty + 18}" width="80" height="6" fill="{accent}"/>'
    return svg(w1 + pad * 2, ty + 24 + pad, body)


def compact_logo(fg=WHITE, accent=RED, pad=16):
    """Simbolo + nome em duas linhas curtas: para cabecalhos e espacos estreitos."""
    g, slash, W = monogram_geom()
    g1, w1 = word("EXPRESSION", tracking=5)
    g2, w2 = word("SESSION", tracking=5)
    s = 0.46
    a = affinity.scale(g1, s, s, origin=(0, 0))
    b = affinity.scale(g2, s, s, origin=(0, 0))
    hh = H + 28
    body = P(to_path(g, pad, pad + 14), fg) + P(to_path(slash, pad, pad + 14), accent)
    x = pad + W + 26
    body += P(to_path(a, x, pad + 14 + 2), fg)
    body += P(to_path(b, x, pad + 14 + H * s + 10), fg)
    body += f'<rect x="{x + w2 * s + 10}" y="{pad + 14 + H*s + 10}" width="{w1*s - w2*s - 10}" height="{H*s}" fill="none"/>'
    st, sw = stripes(0, 0, h=H * s, widths=(16, 11, 7), gap=5)
    body += P(to_path(st, x + w2 * s + 12, pad + 14 + H * s + 10), accent)
    return svg(x + w1 * s + pad, hh + pad * 2, body)


def splash_svg(w=1920, h=1080):
    g1, g2, st, lw, lh = wordmark_geoms(textured=True)
    s = w * 0.5 / lw
    ox = (w - lw * s) / 2
    oy = h * 0.36
    body = f'<rect width="{w}" height="{h}" fill="{BLACK}"/>'
    # diagonais de fundo em asfalto
    body += f'<path d="M{w*0.62} 0 L{w*0.80} 0 L{w*0.38} {h} L{w*0.20} {h}Z" fill="{ASPHALT}" opacity="0.65"/>'
    for gg, c in ((g1, WHITE), (g2, WHITE), (st, RED)):
        body += P(to_path(affinity.scale(gg, s, s, origin=(0, 0)), ox, oy), c)
    d, _ = text_path("AIR IS EXPRESSION.", BC8, 40, w / 2, oy + lh * s + 90, tracking=10, anchor="middle")
    body += P(d, RED)
    d, _ = text_path(TAG, BC, 22, w / 2, h - 70, tracking=8, anchor="middle")
    body += P(d, CONCRETE)
    return svg(w, h, body)


# ---------------------------------------------------------------- propostas

def proposal_a():
    return primary_logo(textured=True)


def proposal_b():
    """Air Loop: base Anton inclinada, Os viram aneis de rotacao, arco de trajetoria."""
    size = 150
    txt = "EXPRESSI SESSI N"
    d1, a1 = text_path("EXPRESSI", ANTON, size, 0, 0)
    body = ""
    pad = 30
    ch = cap_height(ANTON) * size
    y = pad + ch + 90
    skew = f'transform="translate({pad},{y}) skewX(-10)"'
    x = 0
    parts = []
    d, a = text_path("EXPRESSI", ANTON, size, x, 0)
    parts.append(d)
    x += a + 8
    r = ch / 2
    ring_cx = [x + r * 0.95]
    x += r * 1.9 + 8
    d, a = text_path("N SESSI", ANTON, size, x, 0)
    parts.append(d)
    x += a + 8
    ring_cx.append(x + r * 0.95)
    x += r * 1.9 + 8
    d, a = text_path("N", ANTON, size, x, 0)
    parts.append(d)
    x += a
    body += f'<g {skew}><path fill="{WHITE}" d="{"".join(parts)}"/>'
    for cx in ring_cx:
        # anel aberto com seta: a rotacao
        r2 = r * 0.95
        body += (f'<path d="M{cx + r2 * math.cos(math.radians(-60))} {-r + r2 * math.sin(math.radians(-60))} '
                 f'A{r2} {r2} 0 1 1 {cx + r2 * math.cos(math.radians(-110))} {-r + r2 * math.sin(math.radians(-110))}" '
                 f'fill="none" stroke="{WHITE}" stroke-width="{r*0.42}"/>')
        ax, ay = cx + r2 * math.cos(math.radians(-60)), -r + r2 * math.sin(math.radians(-60))
        body += f'<path d="M{ax - 26} {ay - 30} L{ax + 34} {ay - 10} L{ax - 6} {ay + 34}Z" fill="{RED}"/>'
    body += "</g>"
    # arco da trajetoria por cima do nome
    W = x + pad * 2 + 40
    body += f'<path d="M{pad + 40} {pad + 96} Q {W/2} {-40} {W - pad - 60} {pad + 80}" fill="none" stroke="{RED}" stroke-width="12" stroke-linecap="butt"/>'
    body += f'<path d="M{W - pad - 60 - 22} {pad + 80 - 30} L{W - pad - 40} {pad + 92} L{W - pad - 92} {pad + 92}Z" fill="{RED}"/>'
    return svg(W, y + pad + 10, body, bg=BLACK)


def proposal_c():
    """Stencil Tape: lettering reto em estencil, preto sobre fita vermelha."""
    g1, w1 = word("EXPRESSION", slant_deg=0)
    g2, w2 = word("SESSION", slant_deg=0)
    g1 = stencil(g1, [30, 150, 300, 420, 560], slant_deg=0, gap=4)
    g2 = stencil(g2, [40, 190, 330], slant_deg=0, gap=4)
    pad = 60
    tape_h = H + 50
    W = w1 + pad * 2
    rnd = random.Random(4)

    def tape(y, w, x0=0):
        # fita com bordas rasgadas
        top = [(x0 + i * w / 24, y + rnd.uniform(-3, 3)) for i in range(25)]
        bot = [(x0 + w - i * w / 24, y + tape_h + rnd.uniform(-3, 3)) for i in range(25)]
        return Polygon(top + [(x0 + w + 6, y + tape_h / 2)] + bot + [(x0 - 6, y + tape_h / 2)])

    t1 = affinity.rotate(tape(0, W), -3, origin=(W / 2, tape_h / 2))
    t2 = affinity.rotate(tape(tape_h + 12, w2 + pad * 2, x0=(W - w2 - pad * 2) / 2), 2, origin=(W / 2, tape_h * 1.5))
    body = P(to_path(t1, 0, 30), RED) + P(to_path(t2, 0, 30), WHITE)
    body += f'<g transform="rotate(-3 {W/2} {30 + tape_h/2})">{P(to_path(g1, pad, 30 + 25), BLACK)}</g>'
    body += f'<g transform="rotate(2 {W/2} {30 + tape_h*1.5})">{P(to_path(g2, (W - w2) / 2, 30 + tape_h + 12 + 25), BLACK)}</g>'
    return svg(W, tape_h * 2 + 12 + 60, body, bg=BLACK)


# ---------------------------------------------------------------- icones (grade 24)

ICONS = {
    # navegacao e acoes
    "play": '<path d="M7 4l13 8-13 8z"/>',
    "pause": '<path d="M8 5v14M16 5v14"/>',
    "back": '<path d="M15 4l-8 8 8 8"/>',
    "close": '<path d="M5 5l14 14M19 5L5 19"/>',
    "check": '<path d="M4 13l5 5L20 6"/>',
    "lock": '<path d="M5 11h14v10H5z"/><path d="M8 11V7l2-3h4l2 3v4"/>',
    "help": '<path d="M8 2h8l6 6v8l-6 6H8l-6-6V8z"/><path d="M9 9l1.5-2h3L15 9v1.5L12 13v1.5M12 17.5v.5"/>',
    "settings": '<path d="M10 2h4l.8 3 2.6 1.5 3-.9 2 3.5-2.2 2.1v3l2.2 2.1-2 3.5-3-.9-2.6 1.5-.8 3h-4l-.8-3-2.6-1.5-3 .9-2-3.5 2.2-2.1v-3L1.6 9.1l2-3.5 3 .9L9.2 5z"/><path d="M12 9l3 3-3 3-3-3z"/>',
    "profile": '<path d="M12 2l4.5 2.6v5.2L12 12.4 7.5 9.8V4.6z"/><path d="M3 22l2.5-6.5h13L21 22"/>',
    "surfer": '<path d="M13.5 2.5h3v3h-3z"/><path d="M5 9l5-1.5L14.5 8l4.5-2.5"/><path d="M10 7.5l-1 6.5 4 1.5 1 3.5"/><path d="M9 14l-3 4.5"/><path d="M2 21l20-3"/>',
    "board": '<path d="M12 2l4 5.5V17l-4 5-4-5V7.5z"/><path d="M12 5.5v13"/>',
    "fin": '<path d="M4 21h16l-2.5-8.5L9 3l.5 8z"/><path d="M9 21v-4"/>',
    "equipment": '<path d="M9 3h6l1.2 2.5L21 8l-2 6-2.5-1.2V21h-9v-8.2L5 14 3 8l4.8-2.5z"/><path d="M12 6v15"/>',
    "beach": '<path d="M2 21h20"/><path d="M2 17l3.3-2.5 3.4 2.5 3.3-2.5 3.3 2.5 3.4-2.5L22 17"/><path d="M17 3l3 3-3 3-3-3z"/><path d="M6 13V5l5 2.5"/>',
    "wave": '<path d="M2 20l4.5-8 5-5 6 .5-3.5 3 4 2.5L20 20z"/><path d="M2 20h20"/>',
    "championship": '<path d="M5 22V2"/><path d="M5 3h14l-3.5 4.5L19 12H5"/>',
    "trophy": '<path d="M7 3h10v6l-2.5 4h-5L7 9z"/><path d="M7 5H3v3l4 3M17 5h4v3l-4 3"/><path d="M12 13v4M7.5 21l1-4h7l1 4z"/>',
    "ranking": '<path d="M2 21h20"/><path d="M9 21V9h6v12"/><path d="M3 21v-7h6M15 14h6v7"/><path d="M12 3l1.2 2.4L12 6.5l-1.2-1.1z"/>',
    "stats": '<path d="M2 21h20"/><path d="M4.5 21v-6h3v6M10.5 21V10h3v11M16.5 21V4h3v17"/>',
    "training": '<path d="M12 2l10 10-10 10L2 12z"/><path d="M12 7l5 5-5 5-5-5z"/><path d="M12 11.2l.8.8-.8.8-.8-.8z"/>',
    "maneuvers": '<path d="M2 21L7 9l5-5 5 5 5 12"/><path d="M9.5 2.5l5 3"/><path d="M18 17l4 4 0-5"/>',
    "replay": '<path d="M4 3v6h6"/><path d="M4 9l4.5-5h7L20 9v6l-4.5 5h-7L5 17"/><path d="M10.5 9.5l4 2.5-4 2.5z"/>',
    "audio": '<path d="M3 9h4l5-5v16l-5-5H3z"/><path d="M16 8.5l1.8 3.5L16 15.5M19 5.5l3 6.5-3 6.5"/>',
    "music": '<path d="M9 18V5l12-2.5V16"/><path d="M5 16h4v4H5zM17 14h4v4h-4z"/>',
    "controls": '<path d="M6 6h12l4 5v5l-3 3-4-3H9l-4 3-3-3v-5z"/><path d="M8 9.5v4M6 11.5h4M15.5 10.5h1M17.5 13h1"/>',
    "achievements": '<path d="M8 2h8l-2 6h-4z"/><path d="M12 9.5l1.9 3.6 4 .6-2.9 2.8.7 4L12 18.6l-3.7 1.9.7-4-2.9-2.8 4-.6z"/>',
    "speed": '<path d="M2 18l2.5-6.5L12 7l7.5 4.5L22 18"/><path d="M12 18l5-7"/><path d="M2 21h20"/>',
    "height": '<path d="M2 21h20"/><path d="M10 18V4"/><path d="M5.5 8.5L10 4l4.5 4.5"/><path d="M16 12h6M16 16h6"/>',
    "rotation": '<path d="M19 9l-3-4.5H8L5 9v6l3 4.5h8l3-4.5"/><path d="M14.5 9.5H19V5"/>',
    "landing": '<path d="M12 2v9"/><path d="M8 7.5l4 4 4-4"/><path d="M3 15h18"/><path d="M2 20l3.3-2 3.4 2 3.3-2 3.3 2 3.4-2L22 20"/>',
    "score": '<path d="M9.5 3L7.5 21M16.5 3l-2 18M3.5 8.5h18M2.5 15.5h18"/>',
    "camera": '<path d="M2 7h5l2-3h6l2 3h5v13H2z"/><path d="M12 9.5l4 3.5-4 3.5-4-3.5z"/>',
    "rotateLeft": '<path d="M4 3v6h6"/><path d="M4 9l4.5-5h7L20 9v6l-4.5 5h-7L5 17"/>',
    "rotateRight": '<path d="M20 3v6h-6"/><path d="M20 9l-4.5-5h-7L4 9v6l4.5 5h7l3.5-3"/>',
    "zoomIn": '<path d="M3 3h12v12H3z"/><path d="M15 15l6 6M9 6v6M6 9h6"/>',
    "zoomOut": '<path d="M3 3h12v12H3z"/><path d="M15 15l6 6M6 9h6"/>',
    "undo": '<path d="M9 14l-5-5 5-5"/><path d="M4 9h12l4 4v3l-3 3h-5"/>',
    "shirt": '<path d="M9 3h6l1.2 2.5L21 8l-2 6-2.5-1.2V21h-9v-8.2L5 14 3 8l4.8-2.5z"/>',
    "chart": '<path d="M2 21h20"/><path d="M4.5 21v-6h3v6M10.5 21V10h3v11M16.5 21V4h3v17"/>',
    "gear": '<path d="M10 2h4l.8 3 2.6 1.5 3-.9 2 3.5-2.2 2.1v3l2.2 2.1-2 3.5-3-.9-2.6 1.5-.8 3h-4l-.8-3-2.6-1.5-3 .9-2-3.5 2.2-2.1v-3L1.6 9.1l2-3.5 3 .9L9.2 5z"/><path d="M12 9l3 3-3 3-3-3z"/>',
    "user": '<path d="M12 2l4.5 2.6v5.2L12 12.4 7.5 9.8V4.6z"/><path d="M3 22l2.5-6.5h13L21 22"/>',
}

ICON_LABELS = {
    "play": "Jogar", "settings": "Configuracoes", "profile": "Perfil", "surfer": "Surfista", "board": "Pranchas",
    "fin": "Quilhas", "equipment": "Equipamentos", "beach": "Praias", "championship": "Campeonatos",
    "trophy": "Trofeus", "ranking": "Rankings", "stats": "Estatisticas", "training": "Treinamento",
    "maneuvers": "Manobras", "replay": "Replay", "audio": "Audio", "controls": "Controles",
    "achievements": "Conquistas", "speed": "Velocidade", "height": "Altura", "rotation": "Rotacao",
    "landing": "Aterrissagem", "score": "Pontuacao", "wave": "Onda", "music": "Musica", "camera": "Camera",
    "pause": "Pausa", "back": "Voltar", "close": "Fechar", "check": "Confirmar", "lock": "Bloqueado",
    "help": "Ajuda", "rotateLeft": "Girar a esquerda", "rotateRight": "Girar a direita", "zoomIn": "Aproximar",
    "zoomOut": "Afastar", "undo": "Desfazer",
}

ALIASES = {"shirt", "chart", "gear", "user"}  # nomes antigos mantidos para o codigo existente


def icon_file(name, color="currentColor"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" '
            f'stroke="{color}" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" stroke-miterlimit="4">'
            f"<title>{ICON_LABELS.get(name, name)}</title>{ICONS[name]}</svg>\n")


def write_icons():
    for n in ICONS:
        if n in ALIASES:
            continue
        out(f"brand/icons/svg/{n}.svg", icon_file(n))
    # folha de contato (para o manual e o showcase)
    names = [n for n in ICONS if n not in ALIASES]
    cols = 8
    cell = 120
    rows = math.ceil(len(names) / cols)
    body = ""
    for i, n in enumerate(names):
        x, y = (i % cols) * cell, (i // cols) * cell
        body += (f'<g transform="translate({x + 36},{y + 18}) scale(2)" fill="none" stroke="{WHITE}" stroke-width="2" '
                 f'stroke-linecap="square" stroke-linejoin="miter">{ICONS[n]}</g>')
        d, _ = text_path(ICON_LABELS[n].upper(), BC, 13, x + cell / 2, y + 96, tracking=1.2, anchor="middle")
        body += P(d, CONCRETE)
    out("brand/icons/icon-sheet.svg", svg(cols * cell, rows * cell, body, "Iconografia", bg=BLACK))
    JOBS.append({"type": "svg", "src": "brand/icons/icon-sheet.svg", "out": "brand/icons/icon-sheet.png", "width": 1920})
    # bloco gerado dentro de src/ui/icons.ts
    p = os.path.join(ROOT, "src/ui/icons.ts")
    src = open(p, encoding="utf-8").read()
    block = "\n".join(f"  {n}: '{ICONS[n]}'," for n in ICONS)
    new = re.sub(r"// <brand-icons>.*?// </brand-icons>", lambda m: "// <brand-icons>\n" + block + "\n  // </brand-icons>", src, flags=re.S)
    if new != src:
        open(p, "w", encoding="utf-8").write(new)


# ---------------------------------------------------------------- texturas e padroes

def textures():
    T = {}
    T["grain"] = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1.4 -0.55"/></filter>
<rect width="512" height="512" filter="url(#n)"/></svg>'''
    T["paper"] = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
<filter id="p"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="5" seed="3"/><feDiffuseLighting lighting-color="#fff" surfaceScale="1.6"><feDistantLight azimuth="45" elevation="55"/></feDiffuseLighting></filter>
<rect width="1024" height="1024" fill="#e9e6df"/><rect width="1024" height="1024" filter="url(#p)" opacity="0.45" style="mix-blend-mode:multiply"/></svg>'''
    T["asphalt"] = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
<filter id="a"><feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="3" seed="9"/><feColorMatrix values="0 0 0 0 0.16  0 0 0 0 0.16  0 0 0 0 0.16  0 0 0 2.2 -0.9"/></filter>
<filter id="b"><feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="3" seed="2"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.9 -0.3"/></filter>
<rect width="1024" height="1024" fill="{ASPHALT}"/><rect width="1024" height="1024" filter="url(#b)"/><rect width="1024" height="1024" filter="url(#a)"/></svg>'''
    T["concrete"] = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
<filter id="c"><feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="6" seed="5"/><feColorMatrix values="0.3 0.3 0.3 0 0.25  0.3 0.3 0.3 0 0.25  0.3 0.3 0.3 0 0.25  0 0 0 0 1"/></filter>
<rect width="1024" height="1024" filter="url(#c)"/></svg>'''
    T["spray"] = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 400" width="1200" height="400">
<filter id="s" x="-10%" y="-40%" width="120%" height="180%"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="1" seed="4" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="38" xChannelSelector="R" yChannelSelector="G" result="d"/><feGaussianBlur in="d" stdDeviation="1.2"/></filter>
<path d="M60 250 C 300 120, 640 110, 1140 170" stroke="{RED}" stroke-width="46" fill="none" filter="url(#s)" stroke-linecap="round"/></svg>'''
    T["halftone"] = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 600" width="1200" height="600">
<defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>
<pattern id="d" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><circle cx="6" cy="6" r="5" fill="#fff"/></pattern>
<mask id="m"><rect width="1200" height="600" fill="url(#g)"/></mask></defs>
<rect width="1200" height="600" fill="{BLACK}"/><rect width="1200" height="600" fill="url(#d)" mask="url(#m)"/></svg>'''
    # pinceladas e marcas de impacto (vetor puro)
    rnd = random.Random(12)
    strokes = ""
    for i in range(3):
        y = 80 + i * 120
        pts = []
        for j in range(40):
            x = 40 + j * 28
            pts.append((x, y + math.sin(j / 4 + i) * 6 + rnd.uniform(-2, 2)))
        top = [(x, yy - 26 + rnd.uniform(-4, 3) + (j < 4) * 10 * (4 - j) / 4) for j, (x, yy) in enumerate(pts)]
        bot = [(x, yy + 26 + rnd.uniform(-3, 4)) for x, yy in reversed(pts)]
        poly = Polygon(top + bot).buffer(0)
        # cerdas: sulcos finos
        for k in range(9):
            yy = y - 20 + k * 5 + rnd.uniform(-1, 1)
            x0 = rnd.uniform(500, 1000)
            poly = poly.difference(box(x0, yy, 1200, yy + rnd.uniform(0.6, 1.6)))
        strokes += P(to_path(poly), [WHITE, RED, WHITE][i])
    T["brush"] = svg(1200, 400, strokes, "Pinceladas", bg=BLACK).replace("\n", "")
    # marca de impacto: estrela irregular
    pts = []
    for i in range(28):
        a = i / 28 * math.tau
        r = 180 if i % 2 == 0 else rnd.uniform(60, 100)
        pts.append((250 + math.cos(a) * r * rnd.uniform(0.8, 1.15), 250 + math.sin(a) * r * rnd.uniform(0.8, 1.15)))
    impact = Polygon(pts).buffer(0)
    T["impact"] = svg(500, 500, P(to_path(impact), RED) + P(to_path(impact.buffer(-34, join_style=2)), BLACK), "Impacto")
    for n, c in T.items():
        out(f"brand/textures/{n}.svg", c)
        w = int(re.search(r'width="(\d+)', c).group(1))
        JOBS.append({"type": "svg", "src": f"brand/textures/{n}.svg", "out": f"brand/textures/png/{n}.png", "width": w * (2 if w <= 600 else 1)})


def patterns():
    Pt = {}
    Pt["speed-lines"] = svg(240, 240, "".join(
        f'<path d="M{x} 0 L{x + 14} 0 L{x - 32} 240 L{x - 46} 240Z" fill="{RED if i % 4 == 0 else ASPHALT}"/>' for i, x in enumerate(range(0, 320, 40))), "Linhas de velocidade", bg=BLACK)
    Pt["diagonal-hazard"] = svg(80, 80, f'<path d="M0 80 L80 0 L80 20 L20 80Z M0 40 L40 0 L60 0 L0 60Z" fill="{RED}"/>', "Faixa diagonal", bg=BLACK)
    g, slash, W = monogram_geom()
    s = 0.3
    gm = affinity.scale(g, s, s, origin=(0, 0))
    sm = affinity.scale(slash, s, s, origin=(0, 0))
    tile = 160
    body = ""
    for (x, y) in ((20, 24), (100, 104)):
        body += P(to_path(gm, x - 10, y), ASPHALT) + P(to_path(sm, x - 10, y), "#3a0a0d")
    Pt["monogram-repeat"] = svg(tile, tile, body, "Monograma repetido", bg=BLACK)
    arcs = "".join(f'<path d="M{-40 + i*60} 200 Q {20 + i*60} {40} {80 + i*60} 200" fill="none" stroke="{WHITE if i%3 else RED}" stroke-width="3"/>' for i in range(6))
    Pt["trajectory"] = svg(360, 200, arcs, "Trajetorias", bg=BLACK)
    chev = "".join(f'<path d="M{x} 0 L{x+20} 0 L{x+40} 30 L{x+20} 60 L{x} 60 L{x+20} 30Z" fill="{WHITE if x % 80 else RED}"/>' for x in range(0, 160, 40))
    Pt["chevron-lip"] = svg(160, 60, chev, "Chevron Lip", bg=BLACK)
    dots = "".join(f'<circle cx="{x}" cy="{y}" r="{1 + (x + y) % 5 * 0.7}" fill="{WHITE}"/>' for x in range(5, 120, 10) for y in range(5, 120, 10))
    Pt["halftone-tile"] = svg(120, 120, dots, "Retícula", bg=BLACK)
    for n, c in Pt.items():
        out(f"brand/patterns/{n}.svg", c)
        JOBS.append({"type": "svg", "src": f"brand/patterns/{n}.svg", "out": f"brand/patterns/png/{n}.png", "width": 512})


# ---------------------------------------------------------------- adesivos, selos e carimbos

def badge_text(text, size, cx, y, font=BC8, tracking=3, fill=WHITE):
    d, adv = text_path(text, font, size, cx, y, tracking=tracking, anchor="middle")
    return P(d, fill), adv


def stickers():
    S = {}
    # 1. selo do monograma com contorno branco (adesivo recortado)
    sym = symbol_svg(badge=True)
    S["sticker-monogram"] = sym
    # 2. fita "AIR IS EXPRESSION."
    w, h = 900, 180
    body = f'<path d="M14 10 L{w-4} 0 L{w-14} {h-6} L4 {h}Z" fill="{RED}"/>'
    t, _ = badge_text("AIR IS EXPRESSION.", 96, w / 2, 128, tracking=4, fill=WHITE)
    S["sticker-slogan"] = svg(w, h, body + t, "AIR IS EXPRESSION")
    # 3. carimbo circular "OFFICIAL SESSION"
    r = 220
    body = f'<circle cx="250" cy="250" r="{r}" fill="none" stroke="{RED}" stroke-width="14"/><circle cx="250" cy="250" r="{r-30}" fill="none" stroke="{RED}" stroke-width="4"/>'
    body += f'<defs><path id="arc" d="M250 250 m-{r-62} 0 a{r-62} {r-62} 0 1 1 {2*(r-62)} 0"/></defs>'
    g, slash, W = monogram_geom()
    s = 1.3
    body += P(to_path(affinity.scale(g, s, s, origin=(0, 0)), 250 - W * s / 2, 250 - 64 * s), RED) + P(to_path(affinity.scale(slash, s, s, origin=(0, 0)), 250 - W * s / 2, 250 - 64 * s), RED)
    t, _ = badge_text("OFFICIAL", 54, 250, 120, tracking=10, fill=RED)
    t2, _ = badge_text("SESSION", 54, 250, 420, tracking=10, fill=RED)
    t3, _ = badge_text("EST. 2026", 30, 250, 352, font=BC, tracking=6, fill=RED)
    stamp = body + t + t2 + t3
    S["stamp-official"] = svg(500, 500, f'<g opacity="0.92">{stamp}</g>', "Carimbo Official Session")
    # 4. carimbo retangular "NEW RECORD" (usado na tela de resultados)
    w, h = 640, 200
    body = f'<rect x="8" y="8" width="{w-16}" height="{h-16}" fill="none" stroke="{RED}" stroke-width="12"/>'
    t, _ = badge_text("NEW RECORD", 120, w / 2, 150, font=ANTON, tracking=6, fill=RED)
    S["stamp-new-record"] = svg(w, h, f'<g transform="rotate(-4 {w/2} {h/2})">{body}{t}</g>', "New Record")
    # 5. "ABOVE THE LIP" adesivo chanfrado
    w, h = 700, 240
    body = f'<path d="M30 0 L{w} 0 L{w} {h-30} L{w-30} {h} L0 {h} L0 30Z" fill="{WHITE}"/><path d="M50 22 L{w-22} 22 L{w-22} {h-50} L{w-50} {h-22} L22 {h-22} L22 50Z" fill="{BLACK}"/>'
    t, _ = badge_text("ABOVE THE LIP", 104, w / 2, 160, font=ANTON, tracking=4, fill=WHITE)
    st, _ = stripes(0, 0, h=40, widths=(20, 14, 8), gap=6)
    S["sticker-above-the-lip"] = svg(w, h, body + t + P(to_path(st, w - 110, 176), RED), "Above the Lip")
    # 6. "UNDERGROUND SURF CULTURE" faixa
    w, h = 1000, 120
    body = f'<rect width="{w}" height="{h}" fill="{BLACK}"/><rect x="0" y="0" width="{w}" height="10" fill="{RED}"/><rect x="0" y="{h-10}" width="{w}" height="10" fill="{RED}"/>'
    t, _ = badge_text(TAG, 64, w / 2, 84, tracking=8, fill=WHITE)
    S["sticker-underground"] = svg(w, h, body + t, "Underground Surf Culture")
    # 7. moldura / tape frame (para fotos)
    w, h = 1000, 700
    rnd = random.Random(8)
    def tape(x, y, ang, L=220):
        return f'<rect x="{-L/2}" y="-22" width="{L}" height="44" fill="{WHITE}" opacity="0.88" transform="translate({x},{y}) rotate({ang})"/>'
    body = f'<rect x="40" y="40" width="{w-80}" height="{h-80}" fill="none" stroke="{WHITE}" stroke-width="18"/>'
    body += tape(110, 60, -30) + tape(w - 110, h - 60, -30) + tape(w - 100, 70, 28, 160)
    S["frame-tape"] = svg(w, h, body, "Moldura com fita")
    for n, c in S.items():
        out(f"brand/promotional/stickers/{n}.svg", c)
        JOBS.append({"type": "svg", "src": f"brand/promotional/stickers/{n}.svg", "out": f"brand/promotional/stickers/png/{n}.png", "width": 1200})


# ---------------------------------------------------------------- pranchas e camisetas

def board_outline(L=600, Wd=170):
    # outline de shortboard: bico mais fino, rabeta squash
    pts = []
    for i in range(41):
        t = i / 40
        y = t * L
        w = Wd / 2 * (math.sin(math.pi * (t ** 0.85)) ** 0.75)
        if t > 0.92:
            w = max(w, Wd * 0.17)
        pts.append((w, y))
    right = [(Wd / 2 + x, y) for x, y in pts]
    left = [(Wd / 2 - x, y) for x, y in reversed(pts)]
    return Polygon(right + left).buffer(0)


def board_prints():
    designs = {}
    L, Wd = 600, 170
    out_poly = board_outline(L, Wd)
    d_out = to_path(out_poly, 20, 20)
    clip = f'<clipPath id="b"><path d="{d_out}"/></clipPath>'
    g, slash, W = monogram_geom()
    sm = 0.75
    mono = P(to_path(affinity.scale(g, sm, sm, origin=(0, 0)), 20 + Wd / 2 - W * sm / 2, 20 + 250), WHITE) + P(to_path(affinity.scale(slash, sm, sm, origin=(0, 0)), 20 + Wd / 2 - W * sm / 2, 20 + 250), RED)
    # 1. Lip Slash: fundo branco, faixa vermelha diagonal, monograma preto
    body = f'<defs>{clip}</defs><g clip-path="url(#b)"><rect width="300" height="700" fill="{WHITE}"/>'
    body += f'<path d="M0 300 L260 180 L260 260 L0 380Z" fill="{RED}"/><path d="M0 400 L260 280 L260 300 L0 420Z" fill="{BLACK}"/>'
    body += mono.replace(f'fill="{WHITE}"', f'fill="{BLACK}"') + "</g>"
    body += f'<path d="{d_out}" fill="none" stroke="{BLACK}" stroke-width="3"/><path d="M{20+Wd/2} 26 L{20+Wd/2} {L+14}" stroke="{CONCRETE}" stroke-width="1.5" opacity="0.6"/>'
    designs["board-lip-slash"] = body
    # 2. Underground: preto, faixas de velocidade, nome vertical
    gv, wv = word("EXPRESSION")
    s = 0.40
    gv = affinity.rotate(affinity.scale(gv, s, s, origin=(0, 0)), -90, origin=(0, 0))
    b = gv.bounds
    body = f'<defs>{clip}</defs><g clip-path="url(#b)"><rect width="300" height="700" fill="{BLACK}"/>'
    body += "".join(f'<path d="M0 {y} L300 {y-90} L300 {y-78} L0 {y+12}Z" fill="{RED if i==1 else ASPHALT}"/>' for i, y in enumerate((160, 210, 520, 560)))
    body += P(to_path(gv, 20 + Wd / 2 - (b[0] + b[2]) / 2, 20 + 430 - b[1]), WHITE) + "</g>"
    body += f'<path d="{d_out}" fill="none" stroke="{ASPHALT}" stroke-width="3"/>'
    designs["board-underground"] = body
    # 3. Halftone Rebel: vermelho com reticula preta degradê
    body = f'<defs>{clip}<pattern id="h" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="5" cy="5" r="3.6" fill="{BLACK}"/></pattern><linearGradient id="fg" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fff"/><stop offset="0.7" stop-color="#000"/></linearGradient><mask id="hm"><rect width="300" height="700" fill="url(#fg)"/></mask></defs>'
    body += f'<g clip-path="url(#b)"><rect width="300" height="700" fill="{RED}"/><rect width="300" height="700" fill="url(#h)" mask="url(#hm)"/>{mono.replace(f'fill="{RED}"', f'fill="{BLACK}"')}</g>'
    body += f'<path d="{d_out}" fill="none" stroke="{BLACK}" stroke-width="3"/>'
    designs["board-halftone-rebel"] = body
    # 4. Concrete: cinza concreto, chevrons do Lip
    body = f'<defs>{clip}</defs><g clip-path="url(#b)"><rect width="300" height="700" fill="#9a9a9a"/>'
    body += "".join(f'<path d="M0 {y} L105 {y-40} L210 {y} L210 {y+22} L105 {y-18} L0 {y+22}Z" fill="{BLACK if i%3 else RED}"/>' for i, y in enumerate(range(120, 620, 70)))
    body += "</g>" + f'<path d="{d_out}" fill="none" stroke="{BLACK}" stroke-width="3"/>'
    designs["board-concrete-chevron"] = body
    allb = ""
    for i, (n, body) in enumerate(designs.items()):
        c = svg(Wd + 40, L + 40, body, n)
        out(f"brand/mockups/boards/{n}.svg", c)
        JOBS.append({"type": "svg", "src": f"brand/mockups/boards/{n}.svg", "out": f"brand/mockups/boards/png/{n}.png", "width": 600})
        allb += f'<g transform="translate({40 + i * 240},40)">{body.replace("id=\"b\"", f"id=\"b{i}\"").replace("url(#b)", f"url(#b{i})").replace("id=\"h\"", f"id=\"h{i}\"").replace("url(#h)", f"url(#h{i})").replace("id=\"hm\"", f"id=\"hm{i}\"").replace("url(#hm)", f"url(#hm{i})").replace("id=\"fg\"", f"id=\"fg{i}\"").replace("url(#fg)", f"url(#fg{i})")}</g>'
    out("brand/mockups/boards/board-lineup.svg", svg(40 + 4 * 240, L + 120, allb, "Estampas de prancha", bg=ASPHALT))
    JOBS.append({"type": "svg", "src": "brand/mockups/boards/board-lineup.svg", "out": "brand/mockups/boards/png/board-lineup.png", "width": 2000})


def tees():
    tee = "M120 40 L200 20 Q250 60 300 20 L380 40 L470 120 L420 190 L380 165 L380 520 L120 520 L120 165 L80 190 L30 120Z"
    g1, g2, st, lw, lh = wordmark_geoms(textured=True)
    designs = {}
    s = 200 / lw
    logo = lambda fg: "".join(P(to_path(affinity.scale(gg, s, s, origin=(0, 0)), 150, 170), c) for gg, c in ((g1, fg), (g2, fg), (st, RED)))
    designs["tee-black-wordmark"] = f'<path d="{tee}" fill="{BLACK}" stroke="#333" stroke-width="3"/>' + logo(WHITE)
    g, slash, W = monogram_geom()
    sm = 1.1
    t, _ = badge_text("AIR IS EXPRESSION.", 26, 250, 360, tracking=4, fill=BLACK)
    designs["tee-white-monogram"] = (f'<path d="{tee}" fill="#f2f2f2" stroke="#bbb" stroke-width="3"/>'
        + P(to_path(affinity.scale(g, sm, sm, origin=(0, 0)), 250 - W * sm / 2, 170), BLACK) + P(to_path(affinity.scale(slash, sm, sm, origin=(0, 0)), 250 - W * sm / 2, 170), RED) + t)
    t, _ = badge_text("UNDERGROUND", 44, 250, 230, font=ANTON, tracking=3, fill=BLACK)
    t2, _ = badge_text("SURF CULTURE", 44, 250, 280, font=ANTON, tracking=3, fill=WHITE)
    designs["tee-red-underground"] = f'<path d="{tee}" fill="{RED}" stroke="#a0040e" stroke-width="3"/>' + t + t2 + f'<rect x="170" y="296" width="160" height="6" fill="{BLACK}"/>'
    allt = ""
    for i, (n, body) in enumerate(designs.items()):
        out(f"brand/mockups/apparel/{n}.svg", svg(500, 540, body, n))
        JOBS.append({"type": "svg", "src": f"brand/mockups/apparel/{n}.svg", "out": f"brand/mockups/apparel/png/{n}.png", "width": 1000})
        allt += f'<g transform="translate({i*520 + 20},20)">{body}</g>'
    out("brand/mockups/apparel/tee-lineup.svg", svg(1580, 580, allt, "Camisetas conceituais", bg=ASPHALT))
    JOBS.append({"type": "svg", "src": "brand/mockups/apparel/tee-lineup.svg", "out": "brand/mockups/apparel/png/tee-lineup.png", "width": 2000})


# ---------------------------------------------------------------- execucao

def logos():
    L = {
        "es-logo-primary": primary_logo(),
        "es-logo-primary-textured": primary_logo(textured=True),
        "es-logo-primary-black": primary_logo(fg=BLACK),
        "es-logo-primary-white": primary_logo(fg=WHITE, accent=WHITE),
        "es-logo-primary-red": primary_logo(fg=RED, accent=RED),
        "es-logo-mono-black": primary_logo(fg=BLACK, accent=BLACK),
        "es-logo-wordmark": primary_logo(tagline=False),
        "es-logo-horizontal": horizontal_logo(),
        "es-logo-horizontal-black": horizontal_logo(fg=BLACK),
        "es-logo-horizontal-textured": horizontal_logo(textured=True),
        "es-logo-vertical": vertical_logo(),
        "es-logo-vertical-black": vertical_logo(fg=BLACK),
        "es-logo-compact": compact_logo(),
        "es-logo-compact-black": compact_logo(fg=BLACK),
        "es-symbol": symbol_svg(),
        "es-symbol-black": symbol_svg(fg=BLACK),
        "es-symbol-white": symbol_svg(fg=WHITE, accent=WHITE),
        "es-symbol-red": symbol_svg(fg=RED, accent=RED),
        "es-monogram-badge": symbol_svg(badge=True),
        "es-app-icon": app_icon_svg(),
        "es-favicon": favicon_svg(),
        "es-splash": splash_svg(),
    }
    for n, c in L.items():
        out(f"brand/logos/svg/{n}.svg", c)
        w = 512 if n == "es-favicon" else 1920 if n == "es-splash" else 1024 if n == "es-app-icon" else 2400
        JOBS.append({"type": "svg", "src": f"brand/logos/svg/{n}.svg", "out": f"brand/logos/png/{n}.png", "width": w})
    for size in (16, 32, 48, 180, 192, 512):
        src = "brand/logos/svg/es-favicon.svg" if size <= 48 else "brand/logos/svg/es-app-icon.svg"
        JOBS.append({"type": "svg", "src": src, "out": f"brand/logos/png/sizes/es-icon-{size}.png", "width": size})
    # icones publicos do jogo
    out("public/favicon.svg", L["es-favicon"])
    JOBS.append({"type": "svg", "src": "brand/logos/svg/es-favicon.svg", "out": "public/favicon-32.png", "width": 32})
    JOBS.append({"type": "svg", "src": "brand/logos/svg/es-app-icon.svg", "out": "public/apple-touch-icon.png", "width": 180})
    JOBS.append({"type": "svg", "src": "brand/logos/svg/es-app-icon.svg", "out": "public/icon-512.png", "width": 512})
    # propostas
    for n, f in (("proposal-a-lip-slash", proposal_a), ("proposal-b-air-loop", proposal_b), ("proposal-c-stencil-tape", proposal_c)):
        out(f"brand/logos/proposals/{n}.svg", f())
        JOBS.append({"type": "svg", "src": f"brand/logos/proposals/{n}.svg", "out": f"brand/logos/proposals/{n}.png", "width": 1600})
    # versao usada pela interface (sem titulo, para inline)
    ui = re.sub(r"<title>.*?</title>", "", primary_logo(tagline=False, pad=0))
    out("src/ui/brand/logo.svg", ui)
    out("src/ui/brand/symbol.svg", re.sub(r"<title>.*?</title>", "", symbol_svg(pad=0)))
    return L


def inject_splash(L):
    """Coloca o logotipo vetorial direto no index.html (aparece antes do JS)."""
    p = os.path.join(ROOT, "index.html")
    src = open(p, encoding="utf-8").read()
    logo = re.sub(r"<title>.*?</title>", "", primary_logo(tagline=True, pad=0)).strip()
    logo = logo.replace('role="img"', 'class="loading-logo" role="img"', 1)
    new = re.sub(r"(<!-- <brand-splash> -->).*?(<!-- </brand-splash> -->)", lambda m: m.group(1) + logo + m.group(2), src, flags=re.S)
    if new != src:
        open(p, "w", encoding="utf-8").write(new)


def tokens_css():
    """src/ui/tokens.css a partir de brand/design-system/tokens.json (fonte unica)."""
    t = json.load(open(os.path.join(BRAND, "design-system", "tokens.json"), encoding="utf-8"))
    L = ["/* GERADO por brand/tools/build_brand.py a partir de brand/design-system/tokens.json. Nao edite. */", ""]
    faces = [("Anton", "anton-latin-400-normal", 400)]
    faces += [("Barlow", f"barlow-latin-{w}-normal", w) for w in (400, 500, 600, 700)]
    faces += [("Barlow Condensed", f"barlow-condensed-latin-{w}-normal", w) for w in (500, 600, 700, 800)]
    for fam, f, w in faces:
        L.append(f"@font-face {{ font-family: '{fam}'; src: url('./fonts/{f}.woff2') format('woff2'); font-weight: {w}; font-style: normal; font-display: swap; }}")
    L += ["", ":root {"]
    for group in ("brand", "support", "functional"):
        for k, v in t["color"][group].items():
            if k.startswith("$"):
                continue
            L.append(f"  --es-{k}: {v['value']};")
    for k, v in t["font"].items():
        L.append(f"  --es-font-{k}: '{v['family']}', {v['fallback']};")
    for k, v in t["fontSize"].items():
        L.append(f"  --es-fs-{k}: {v};")
    for k, v in t["space"].items():
        L.append(f"  --es-sp-{k}: {v};")
    for k, v in t["radius"].items():
        L.append(f"  --es-radius-{k}: {v};")
    for k, v in t["cut"].items():
        L.append(f"  --es-cut-{k}: {v};")
    for k, v in t["shadow"].items():
        L.append(f"  --es-shadow-{k}: {v};")
    for k, v in t["motion"].items():
        L.append(f"  --es-{k if k.startswith('ease') or k == 'slant' else 'dur-' + k}: {v};")
    for k, v in t["z"].items():
        L.append(f"  --es-z-{k}: {v};")
    L.append("}")
    out("src/ui/tokens.css", "\n".join(L) + "\n")


if __name__ == "__main__":
    tokens_css()
    L = logos()
    inject_splash(L)
    write_icons()
    textures()
    patterns()
    stickers()
    board_prints()
    tees()
    json.dump(JOBS, open(os.path.join(BRAND, "tools", "jobs.json"), "w"), indent=1)
    print(f"{len(JOBS)} exportacoes em brand/tools/jobs.json")
