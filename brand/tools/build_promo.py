"""
Materiais promocionais: cada peca e um HTML editavel em brand/promotional/src,
exportado em PNG no tamanho final por brand/tools/render.cjs.

    python3 brand/tools/build_promo.py && node brand/tools/render.cjs brand/tools/jobs-promo.json

As "fotos" sao quadros do proprio jogo (brand/photography/game), tratados em
preto e branco de alto contraste por CSS. Os numeros citados (22 aereos,
3 picos, 5 ondas por bateria) sao os do jogo.
"""

import json
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = "brand/promotional/src"
JOBS = []

PHOTO = "../../photography/game/crops/"
LOGO = "../../logos/svg/"
STICK = "../stickers/"

FACTS = "22 AÉREOS · 3 PICOS · 5 ONDAS POR BATERIA"


def page(name, w, h, body, extra_css=""):
    html = f"""<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>{name}</title>
<link rel="stylesheet" href="promo.css">
<style>html,body{{width:{w}px;height:{h}px}}{extra_css}</style></head>
<body class="piece">{body}<div class="grain"></div></body></html>
"""
    p = os.path.join(ROOT, SRC, f"{name}.html")
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, "w", encoding="utf-8").write(html)
    JOBS.append({"type": "html", "src": f"{SRC}/{name}.html", "out": f"brand/promotional/{name}.jpg", "width": w, "height": h, "wait": 400})


CSS = """/* Base das pecas promocionais EXPRESSION SESSION. Edite aqui o que vale para todas. */
@font-face { font-family: 'Anton'; src: url('../../../src/ui/fonts/anton-latin-400-normal.woff2'); }
@font-face { font-family: 'Barlow'; font-weight: 500; src: url('../../../src/ui/fonts/barlow-latin-500-normal.woff2'); }
@font-face { font-family: 'Barlow'; font-weight: 700; src: url('../../../src/ui/fonts/barlow-latin-700-normal.woff2'); }
@font-face { font-family: 'Barlow Condensed'; font-weight: 700; src: url('../../../src/ui/fonts/barlow-condensed-latin-700-normal.woff2'); }
@font-face { font-family: 'Barlow Condensed'; font-weight: 800; src: url('../../../src/ui/fonts/barlow-condensed-latin-800-normal.woff2'); }
:root { --black:#0A0A0A; --red:#E30613; --white:#FFFFFF; --concrete:#808080; --asphalt:#242424; --slant:-11deg; }
* { box-sizing: border-box; }
html, body { margin: 0; overflow: hidden; background: var(--black); color: var(--white); font-family: 'Barlow', sans-serif; }
.piece { position: relative; }
.abs { position: absolute; }
/* Foto do jogo em P&B de alto contraste (direcao fotografica) */
.photo { position: absolute; background-size: cover; background-position: center; filter: grayscale(1) contrast(1.45) brightness(0.92); }
.photo.color { filter: contrast(1.1) saturate(1.05); }
.photo::after { content: ''; position: absolute; inset: 0; background: radial-gradient(circle at 50% 45%, transparent 40%, rgba(10,10,10,0.55)); }
/* Reticula de serigrafia sobre a foto */
.halftone { position: absolute; inset: 0; background-image: radial-gradient(rgba(10,10,10,0.55) 28%, transparent 30%); background-size: 6px 6px; mix-blend-mode: multiply; opacity: 0.55; }
.grain { position: absolute; inset: 0; pointer-events: none; opacity: 0.09; mix-blend-mode: screen;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1.4 -0.55'/></filter><rect width='220' height='220' filter='url(%23n)'/></svg>"); }
.slash { position: absolute; background: var(--red); transform: skewX(var(--slant)); }
.band { position: absolute; background: var(--black); transform: skewX(var(--slant)); }
.logo { position: absolute; display: block; }
.anton { font-family: 'Anton', sans-serif; text-transform: uppercase; line-height: 0.92; letter-spacing: 0.01em; }
.cond { font-family: 'Barlow Condensed', sans-serif; font-weight: 800; text-transform: uppercase; letter-spacing: 0.22em; }
.red { color: var(--red); }
.print { text-shadow: 0.06em 0.06em 0 var(--red); }
.tape { position: absolute; background: rgba(255,255,255,0.9); height: 44px; }
.frame { position: absolute; border: 16px solid var(--white); }
.rule { position: absolute; height: 6px; background: var(--red); }
.cta { position: absolute; font-family: 'Barlow Condensed', sans-serif; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; background: var(--red); color: #fff; clip-path: polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px); display: flex; align-items: center; }
.stamp { position: absolute; font-family: 'Anton'; text-transform: uppercase; color: var(--red); border: 8px solid var(--red); padding: 4px 22px; transform: rotate(-5deg); }
"""


def write_css():
    p = os.path.join(ROOT, SRC, "promo.css")
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, "w", encoding="utf-8").write(CSS)


def photo(file, x, y, w, h, color=False, pos="center"):
    return f'<div class="photo{" color" if color else ""}" style="left:{x}px;top:{y}px;width:{w}px;height:{h}px;background-image:url({PHOTO}{file}.jpg);background-position:{pos}"><div class="halftone"></div></div>'


def build():
    write_css()
    # Capa oficial / key art 1920x1080
    page("key-art-1920x1080", 1920, 1080,
         photo("air-reverse-pico", 640, 0, 1280, 1080)
         + '<div class="abs" style="inset:0;background:linear-gradient(90deg,#0A0A0A 34%,rgba(10,10,10,0.6) 52%,rgba(10,10,10,0) 72%)"></div>'
         + '<div class="slash" style="left:1560px;top:-40px;width:58px;height:1200px;opacity:.95"></div>'
         + '<div class="slash" style="left:1642px;top:-40px;width:22px;height:1200px;background:#fff"></div>'
         + f'<img class="logo" src="{LOGO}es-logo-primary-textured.svg" style="left:110px;top:330px;width:760px">'
         + '<div class="anton red" style="position:absolute;left:118px;top:690px;font-size:64px">Air is expression.</div>'
         + f'<div class="cond" style="position:absolute;left:120px;top:960px;font-size:22px;color:#B3B3B3">{FACTS}</div>')
    # Poster de lancamento 1600x2400
    page("poster-launch-1600x2400", 1600, 2400,
         '<div class="anton" style="position:absolute;left:90px;top:110px;font-size:300px;transform:skewX(-8deg)">Own<br>the <span class="red">air.</span></div>'
         + photo("indy-rampa", 90, 900, 1420, 900)
         + '<div class="frame" style="left:90px;top:900px;width:1420px;height:900px"></div>'
         + '<div class="tape" style="left:40px;top:880px;width:260px;transform:rotate(-24deg)"></div>'
         + '<div class="tape" style="left:1330px;top:1770px;width:260px;transform:rotate(-24deg)"></div>'
         + '<div class="stamp" style="left:1060px;top:820px;font-size:64px;background:#0A0A0A">Lançamento</div>'
         + f'<img class="logo" src="{LOGO}es-logo-primary.svg" style="left:90px;top:1860px;width:820px">'
         + f'<div class="cond" style="position:absolute;left:96px;top:2300px;font-size:28px;color:#B3B3B3">{FACTS}</div>'
         + '<div class="slash" style="left:1240px;top:1880px;width:70px;height:420px"></div><div class="slash" style="left:1340px;top:1880px;width:40px;height:420px"></div><div class="slash" style="left:1410px;top:1880px;width:20px;height:420px"></div>')
    # Banner horizontal 1920x600
    page("banner-1920x600", 1920, 600,
         photo("360-pico", 760, 0, 1160, 600, pos="50% 40%")
         + '<div class="abs" style="inset:0;background:linear-gradient(90deg,#0A0A0A 42%,rgba(10,10,10,0) 70%)"></div>'
         + '<div class="slash" style="left:820px;top:-20px;width:40px;height:700px"></div>'
         + f'<img class="logo" src="{LOGO}es-logo-horizontal.svg" style="left:90px;top:200px;width:700px">'
         + '<div class="anton red" style="position:absolute;left:96px;top:340px;font-size:44px">Air is expression.</div>')
    # Imagem de apresentacao para site 1920x1080
    page("site-hero-1920x1080", 1920, 1080,
         photo("superman-rampa", 0, 0, 1920, 1080, pos="50% 45%")
         + '<div class="abs" style="inset:0;background:linear-gradient(0deg,#0A0A0A 8%,rgba(10,10,10,0.2) 55%,rgba(10,10,10,0.7))"></div>'
         + f'<img class="logo" src="{LOGO}es-logo-compact.svg" style="left:80px;top:46px;width:300px">'
         + '<div class="cond" style="position:absolute;right:80px;top:76px;font-size:20px;display:flex;gap:44px"><span>O jogo</span><span>Aéreos</span><span>Picos</span><span class="red">Jogar</span></div>'
         + '<div class="anton print" style="position:absolute;left:80px;top:560px;font-size:170px">Beyond<br>the lip.</div>'
         + '<div style="position:absolute;left:84px;top:900px;font-size:24px;max-width:700px;color:#ddd">Surfe aéreo em 3D direto no navegador. Leia a onda, comprima, solte no Lip e invente o seu aéreo.</div>'
         + '<div class="cta" style="left:1440px;top:900px;height:76px;padding:0 44px;font-size:30px">Jogar agora</div>')
    # Avatar para redes 1000x1000
    page("social-avatar-1000", 1000, 1000,
         '<div class="slash" style="left:600px;top:-100px;width:120px;height:1200px;background:#242424"></div>'
         + f'<img class="logo" src="{LOGO}es-symbol.svg" style="left:170px;top:280px;width:660px">'
         + '<div class="rule" style="left:300px;top:820px;width:400px;height:12px"></div>')
    # Capa para redes sociais 1500x500
    page("social-cover-1500x500", 1500, 500,
         photo("method-pico", 500, 0, 1000, 500, pos="50% 40%")
         + '<div class="abs" style="inset:0;background:linear-gradient(90deg,#0A0A0A 30%,rgba(10,10,10,0) 65%)"></div>'
         + f'<img class="logo" src="{LOGO}es-logo-primary.svg" style="left:330px;top:100px;width:520px">'
         + '<div class="slash" style="left:1240px;top:-20px;width:30px;height:600px"></div>')
    # Instagram post 1080x1350
    page("instagram-post-1080x1350", 1080, 1350,
         photo("backflip-lagoa", 0, 0, 1080, 1000, pos="50% 40%")
         + '<div class="abs" style="left:0;top:780px;width:1080px;height:570px;background:linear-gradient(0deg,#0A0A0A 60%,rgba(10,10,10,0))"></div>'
         + '<div class="cond red" style="position:absolute;left:70px;top:900px;font-size:26px">Aéreo da semana</div>'
         + '<div class="anton print" style="position:absolute;left:66px;top:950px;font-size:150px">Backflip</div>'
         + '<div class="cond" style="position:absolute;left:72px;top:1110px;font-size:22px;color:#B3B3B3">Espaço · ↑ · ↓ — solte no Lip, jogue o corpo, pouse</div>'
         + f'<img class="logo" src="{LOGO}es-symbol.svg" style="left:860px;top:1180px;width:150px">')
    # Instagram stories 1080x1920
    page("instagram-story-1080x1920", 1080, 1920,
         photo("stalefish-lagoa", 0, 0, 1080, 1920, pos="45% 50%")
         + '<div class="abs" style="inset:0;background:linear-gradient(0deg,#0A0A0A 18%,rgba(10,10,10,0) 55%,rgba(10,10,10,0.75))"></div>'
         + f'<img class="logo" src="{LOGO}es-logo-primary.svg" style="left:90px;top:150px;width:620px">'
         + '<div class="anton" style="position:absolute;left:90px;top:1380px;font-size:150px">No rules.<br><span class="red">Just style.</span></div>'
         + '<div class="cta" style="left:90px;top:1720px;height:84px;padding:0 50px;font-size:34px">Jogue agora</div>')
    # Thumbnail YouTube 1280x720
    page("youtube-thumb-1280x720", 1280, 720,
         photo("360-pico", 380, 0, 900, 720)
         + '<div class="band" style="left:-120px;top:0;width:760px;height:720px"></div>'
         + '<div class="anton print" style="position:absolute;left:50px;top:110px;font-size:210px;transform:skewX(-8deg)">360</div>'
         + '<div class="anton" style="position:absolute;left:56px;top:330px;font-size:120px">Air</div>'
         + '<div class="cta" style="left:56px;top:500px;height:70px;padding:0 30px;font-size:34px">Como fazer</div>'
         + f'<img class="logo" src="{LOGO}es-logo-compact.svg" style="left:56px;top:610px;width:250px">')
    # Capsula para lojas/plataformas 920x430 e 600x900
    page("store-capsule-920x430", 920, 430,
         photo("air-reverse-pico", 300, 0, 620, 430)
         + '<div class="abs" style="inset:0;background:linear-gradient(90deg,#0A0A0A 38%,rgba(10,10,10,0) 70%)"></div>'
         + f'<img class="logo" src="{LOGO}es-logo-primary.svg" style="left:40px;top:110px;width:440px">')
    page("store-library-600x900", 600, 900,
         photo("indy-rampa", 0, 0, 600, 900, pos="50% 40%")
         + '<div class="abs" style="inset:0;background:linear-gradient(0deg,#0A0A0A 30%,rgba(10,10,10,0) 70%)"></div>'
         + f'<img class="logo" src="{LOGO}es-logo-primary.svg" style="left:50px;top:620px;width:500px">')
    # Wallpapers
    page("wallpaper-desktop-2560x1440", 2560, 1440,
         photo("superman-rampa", 0, 0, 2560, 1440, pos="50% 45%")
         + '<div class="abs" style="inset:0;background:linear-gradient(90deg,rgba(10,10,10,0.85),rgba(10,10,10,0) 45%)"></div>'
         + '<div class="slash" style="left:2240px;top:-40px;width:60px;height:1600px"></div><div class="slash" style="left:2330px;top:-40px;width:26px;height:1600px;background:#fff"></div>'
         + f'<img class="logo" src="{LOGO}es-logo-primary.svg" style="left:140px;top:1080px;width:620px">')
    page("wallpaper-mobile-1170x2532", 1170, 2532,
         photo("backflip-lagoa", 0, 0, 1170, 2532, pos="50% 50%")
         + '<div class="abs" style="inset:0;background:linear-gradient(0deg,#0A0A0A 10%,rgba(10,10,10,0) 40%)"></div>'
         + f'<img class="logo" src="{LOGO}es-logo-primary.svg" style="left:135px;top:2150px;width:900px">')
    json.dump(JOBS, open(os.path.join(ROOT, "brand/tools/jobs-promo.json"), "w"), indent=1)
    print(len(JOBS), "pecas")


if __name__ == "__main__":
    build()
