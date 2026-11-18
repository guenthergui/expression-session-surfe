"""
EXPRESSION SESSION — lettering proprietario.

Cada letra e desenhada em uma grade de 100 unidades de altura (caixa alta),
com hastes verticais de SV e barras horizontais de SH. As formas sao
angulares: cantos chanfrados e terminais cortados em diagonal, como fita
recortada ou estencil de serigrafia. A inclinacao (italico) e aplicada
depois, na palavra inteira, para todas as letras partilharem o mesmo eixo.

Nenhuma fonte e usada no desenho das letras: tudo e geometria (shapely).
"""

from __future__ import annotations

import math
import random

from shapely import affinity
from shapely.geometry import MultiPolygon, Polygon, box
from shapely.ops import unary_union

H = 100.0  # altura da caixa alta
SV = 22.0  # haste vertical
SH = 19.0  # barra horizontal
CUT = 9.0  # corte diagonal dos terminais (sensacao de movimento)


def chamfer(geom, x0, y0, x1, y1, corners: dict[str, float]):
    """Remove triangulos nos cantos do retangulo de referencia (y para baixo)."""
    cuts = []
    for name, c in corners.items():
        if c <= 0:
            continue
        if name == "tl":
            cuts.append(Polygon([(x0 - 1, y0 - 1), (x0 + c, y0 - 1), (x0 - 1, y0 + c)]))
            cuts.append(Polygon([(x0 - 1, y0 - 1), (x0 + c, y0), (x0, y0 + c)]))
        if name == "tr":
            cuts.append(Polygon([(x1 + 1, y0 - 1), (x1 - c, y0 - 1), (x1 + 1, y0 + c)]))
            cuts.append(Polygon([(x1 + 1, y0 - 1), (x1 - c, y0), (x1, y0 + c)]))
        if name == "bl":
            cuts.append(Polygon([(x0 - 1, y1 + 1), (x0 + c, y1 + 1), (x0 - 1, y1 - c)]))
            cuts.append(Polygon([(x0 - 1, y1 + 1), (x0 + c, y1), (x0, y1 - c)]))
        if name == "br":
            cuts.append(Polygon([(x1 + 1, y1 + 1), (x1 - c, y1 + 1), (x1 + 1, y1 - c)]))
            cuts.append(Polygon([(x1 + 1, y1 + 1), (x1 - c, y1), (x1, y1 - c)]))
    if not cuts:
        return geom
    return geom.difference(unary_union(cuts))


def slash_end(x_end, y_top, y_bot, cut=CUT):
    """Triangulo que corta a ponta direita de uma barra: canto de baixo recua."""
    return Polygon([(x_end + 1, y_bot + 1), (x_end - cut, y_bot + 1), (x_end + 1, y_top - 0.01)])


def slash_start(x_start, y_top, y_bot, cut=CUT):
    """Corta a ponta esquerda de uma barra: canto de cima recua."""
    return Polygon([(x_start - 1, y_top - 1), (x_start + cut, y_top - 1), (x_start - 1, y_bot + 0.01)])


def L_E(w=52):
    mid = (H - SH) / 2
    g = unary_union([
        box(0, 0, SV, H),
        box(0, 0, w, SH),
        box(0, mid, w * 0.84, mid + SH),
        box(0, H - SH, w, H),
    ])
    g = g.difference(unary_union([
        slash_end(w, 0, SH),
        slash_end(w * 0.84, mid, mid + SH),
        slash_end(w, H - SH, H),
    ]))
    return chamfer(g, 0, 0, w, H, {"tl": 8, "bl": 8}), w


def L_X(w=60):
    d = 25.0
    g = unary_union([
        Polygon([(0, 0), (d, 0), (w, H), (w - d, H)]),
        Polygon([(w - d, 0), (w, 0), (d, H), (0, H)]),
    ]).intersection(box(0, 0, w, H))
    return g, w


def _bowl(w, bh):
    outer = chamfer(box(0, 0, w, bh), 0, 0, w, bh, {"tr": 15, "br": 15})
    counter = chamfer(box(SV, SH, w - SV, bh - SH), SV, SH, w - SV, bh - SH, {"tr": 4, "br": 4})
    return outer.difference(counter)


def L_P(w=56):
    bh = 62.0
    g = unary_union([_bowl(w, bh), box(0, 0, SV, H)])
    g = g.difference(slash_start(0, H - 0.01, H, 0))  # sem efeito, mantem a assinatura
    return chamfer(g, 0, 0, w, H, {"tl": 8}), w


def L_R(w=58):
    bh = 60.0
    leg = Polygon([(w - 38, bh - SH), (w - 16, bh - SH), (w, H), (w - 22, H)])
    g = unary_union([_bowl(w, bh), box(0, 0, SV, H), leg]).intersection(box(0, 0, w, H))
    return chamfer(g, 0, 0, w, H, {"tl": 8}), w


def L_S(w=56):
    mid = (H - SH) / 2
    g = unary_union([
        box(0, 0, w, SH),
        box(0, 0, SV, mid + SH),
        box(0, mid, w, mid + SH),
        box(w - SV, mid, w, H),
        box(0, H - SH, w, H),
    ])
    # esporas: a ponta de cima desce e a de baixo sobe (distingue do numero 5)
    g = unary_union([g, box(w - SV, 0, w, SH + 10), box(0, H - SH - 10, SV, H)])
    g = chamfer(g, 0, 0, w, H, {"tl": 14, "br": 14, "tr": 0, "bl": 0})
    # terminais cortados em diagonal, no mesmo angulo do corte do E
    g = g.difference(unary_union([
        Polygon([(w + 1, SH + 10 + 1), (w - SV - 1, SH + 10 + 1), (w + 1, SH + 3)]),
        Polygon([(-1, H - SH - 10 - 1), (SV + 1, H - SH - 10 - 1), (-1, H - SH - 3)]),
    ]))
    # cantos internos do miolo ligeiramente chanfrados
    g = chamfer(g, 0, mid, w, mid + SH, {"tr": 6, "bl": 6})
    return g, w


def L_I(w=SV):
    return chamfer(box(0, 0, w, H), 0, 0, w, H, {"tl": 6, "br": 6}), w


def L_O(w=60):
    outer = chamfer(box(0, 0, w, H), 0, 0, w, H, {"tl": 16, "tr": 16, "bl": 16, "br": 16})
    counter = chamfer(box(SV, SH, w - SV, H - SH), SV, SH, w - SV, H - SH, {"tl": 4, "tr": 4, "bl": 4, "br": 4})
    return outer.difference(counter), w


def L_N(w=60):
    d = 24.0
    g = unary_union([
        box(0, 0, SV, H),
        box(w - SV, 0, w, H),
        Polygon([(0, 0), (d, 0), (w, H), (w - d, H)]),
    ]).intersection(box(0, 0, w, H))
    return chamfer(g, 0, 0, w, H, {"tl": 6, "br": 6}), w


GLYPHS = {"E": L_E, "X": L_X, "P": L_P, "R": L_R, "S": L_S, "I": L_I, "O": L_O, "N": L_N}

# Espacos opticos: letras diagonais (X, N) pedem menos espaco ao lado.
KERN = {("E", "X"): -3, ("X", "P"): -3, ("O", "N"): 0, ("S", "S"): 0, ("R", "E"): 0}


def word(text: str, tracking=6.0, slant_deg=11.0):
    """Monta a palavra e aplica a inclinacao comum. Retorna (geom, largura)."""
    x = 0.0
    parts = []
    prev = None
    for ch in text:
        if ch == " ":
            x += 26
            prev = None
            continue
        if prev:
            x += KERN.get((prev, ch), 0)
        g, w = GLYPHS[ch]()
        parts.append(affinity.translate(g, x, 0))
        x += w + tracking
        prev = ch
    geom = unary_union(parts)
    k = math.tan(math.radians(slant_deg))
    # y para baixo: o topo (y=0) vai mais para a direita que a base.
    geom = affinity.affine_transform(geom, [1, -k, 0, 1, k * H, 0])
    return geom, x - tracking + k * H


def distress(geom, seed=7, amount=1.0):
    """Desgaste controlado: arranhoes finos e falhas de tinta, sem tocar a leitura."""
    rnd = random.Random(seed)
    minx, miny, maxx, maxy = geom.bounds
    holes = []
    n = int((maxx - minx) * 0.22 * amount)
    for _ in range(n):
        cx = rnd.uniform(minx, maxx)
        cy = rnd.uniform(miny, maxy)
        kind = rnd.random()
        if kind < 0.55:  # risco diagonal fino (arranhao de serigrafia)
            L = rnd.uniform(4, 14)
            t = rnd.uniform(0.4, 0.9)
            a = math.radians(rnd.uniform(-35, -18))
            dx, dy = math.cos(a) * L / 2, math.sin(a) * L / 2
            nx, ny = -math.sin(a) * t / 2, math.cos(a) * t / 2
            holes.append(Polygon([(cx - dx - nx, cy - dy - ny), (cx + dx - nx, cy + dy - ny), (cx + dx + nx, cy + dy + ny), (cx - dx + nx, cy - dy + ny)]))
        else:  # falha de tinta (poligono irregular pequeno)
            r = rnd.uniform(0.5, 1.5)
            pts = []
            for i in range(6):
                ang = i / 6 * math.tau + rnd.uniform(-0.3, 0.3)
                rr = r * rnd.uniform(0.6, 1.2)
                pts.append((cx + math.cos(ang) * rr, cy + math.sin(ang) * rr))
            holes.append(Polygon(pts))
    return geom.difference(unary_union(holes))


def stencil(geom, xs, slant_deg=11.0, gap=3.2):
    """Pontes de estencil: cortes verticais inclinados nas posicoes xs."""
    k = math.tan(math.radians(slant_deg))
    cuts = []
    for x in xs:
        cuts.append(Polygon([(x + k * H, 0), (x + k * H + gap, 0), (x + gap, H), (x, H)]))
    return geom.difference(unary_union(cuts))


def to_path(geom, dx=0.0, dy=0.0, s=1.0, nd=2) -> str:
    """Converte poligonos (com furos) em um 'd' de SVG para fill-rule evenodd."""
    if geom.is_empty:
        return ""
    polys = geom.geoms if isinstance(geom, MultiPolygon) else [geom]
    out = []
    for p in polys:
        if not isinstance(p, Polygon):
            continue
        for ring in [p.exterior, *p.interiors]:
            coords = list(ring.coords)[:-1]
            if len(coords) < 3:
                continue
            seg = "M" + " L".join(f"{round(dx + x * s, nd)} {round(dy + y * s, nd)}" for x, y in coords) + "Z"
            out.append(seg)
    return "".join(out)
