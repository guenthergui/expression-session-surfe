"""
Brand showcase: uma pagina unica com toda a identidade e os componentes REAIS
do jogo (usa src/ui/style.css e tokens.css, sem copia).

    python3 brand/tools/build_showcase.py
    abrir brand/showcase/index.html  (ou npm run dev e http://localhost:5180/brand/showcase/)
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from build_brand import ALIASES, ICON_LABELS, ICONS  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

icons = {k: v for k, v in ICONS.items() if k not in ALIASES}
tokens = json.load(open(os.path.join(ROOT, "brand/design-system/tokens.json"), encoding="utf-8"))


def ic(name):
    return f'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">{ICONS[name]}</svg>'


LOGOS = [
    ("es-logo-primary", "Principal", "dark"), ("es-logo-primary-textured", "Principal com textura", "dark"),
    ("es-logo-primary-black", "Principal preto", "light"), ("es-logo-primary-white", "Branco", "red"),
    ("es-logo-primary-red", "Vermelho", "light"), ("es-logo-mono-black", "Monocromático", "light"),
    ("es-logo-horizontal", "Horizontal", "dark"), ("es-logo-vertical", "Vertical", "dark"),
    ("es-logo-compact", "Compacto", "dark"), ("es-symbol", "Símbolo ES", "dark"),
    ("es-monogram-badge", "Monograma em selo", "light"), ("es-app-icon", "Ícone de app", "concrete"),
    ("es-favicon", "Favicon", "concrete"), ("es-logo-wordmark", "Sem textura / sem assinatura", "dark"),
]

PROMOS = ["key-art-1920x1080", "poster-launch-1600x2400", "banner-1920x600", "site-hero-1920x1080", "social-avatar-1000",
          "social-cover-1500x500", "instagram-post-1080x1350", "instagram-story-1080x1920", "youtube-thumb-1280x720",
          "store-capsule-920x430", "store-library-600x900", "wallpaper-desktop-2560x1440", "wallpaper-mobile-1170x2532"]

UI = [("01-menu", "Menu principal"), ("02-setup", "Preparação: pranchas, quilhas e praias"), ("09-challenge", "Ficha da manobra"),
      ("08-wheel", "Roleta do desafio"), ("10-ride", "HUD durante a onda"), ("11-air", "HUD no ar"), ("12-wave-result", "Resultado da onda"),
      ("13-heat-result", "Resultado da bateria"), ("05-locker", "Vestiário"), ("03-skills", "Evolução"), ("04-settings", "Configurações"), ("06-help", "Como jogar")]


def swatches():
    out = []
    for k, v in tokens["color"]["brand"].items():
        dark = k in ("pure-white",)
        out.append(f'<div class="sw" style="background:{v["value"]};color:{"#0A0A0A" if dark else "#fff"}"><b>{k.replace("-", " ").upper()}</b>'
                   f'<span>{v["value"]}</span><span>RGB {v["rgb"]}</span><span>CMYK {v["cmyk"]}</span><small>{v["use"]}</small></div>')
    return "".join(out)


def support():
    out = []
    for grp in ("support", "functional"):
        for k, v in tokens["color"][grp].items():
            if k.startswith("$"):
                continue
            out.append(f'<div class="sw-s"><i style="background:{v["value"]}"></i><b>{k}</b><code>{v["value"]}</code><small>{v["use"]}</small></div>')
    return "".join(out)


HTML = f"""<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>EXPRESSION SESSION — Brand Showcase</title>
<link rel="icon" href="../logos/svg/es-favicon.svg">
<link rel="stylesheet" href="../../src/ui/style.css">
<style>
html, body {{ height: auto; overflow: auto; }}
body {{ background: #0A0A0A; }}
.wrap {{ max-width: 1280px; margin: 0 auto; padding: 0 32px 120px; }}
nav.top {{ position: sticky; top: 0; z-index: 30; background: rgba(10,10,10,0.94); border-bottom: 1px solid var(--line); }}
nav.top .wrap {{ display: flex; align-items: center; gap: 22px; padding: 12px 32px; flex-wrap: wrap; }}
nav.top img {{ height: 38px; }}
nav.top a {{ color: var(--muted); text-decoration: none; font-family: var(--font-num); font-weight: 700; letter-spacing: .12em; text-transform: uppercase; font-size: 13px; }}
nav.top a:hover {{ color: #fff; }}
section {{ padding: 72px 0 0; }}
section > h2 {{ font-size: 44px; margin-bottom: 8px; }}
section > p.lead {{ color: var(--muted); max-width: 760px; margin: 0 0 28px; font-size: 17px; }}
.hero {{ min-height: 78vh; display: grid; align-content: center; gap: 24px; position: relative; }}
.hero img.logo-big {{ width: min(820px, 100%); }}
.hero .slogan {{ font-size: 44px; }}
.grid {{ display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }}
.logo-cell {{ padding: 28px; min-height: 200px; display: grid; place-items: center; position: relative; }}
.logo-cell img {{ max-width: 100%; max-height: 150px; }}
.logo-cell figcaption {{ position: absolute; left: 12px; bottom: 8px; font-family: var(--font-num); font-weight: 700; letter-spacing: .12em; text-transform: uppercase; font-size: 12.5px; opacity: .7; }}
.dark {{ background: #0A0A0A; border: 1px solid var(--line); }} .light {{ background: #fff; color: #0A0A0A; }} .red {{ background: #E30613; }} .concrete {{ background: #808080; }}
.sws {{ display: grid; grid-template-columns: 6fr 2.5fr 1fr .5fr 1.2fr; min-height: 260px; }}
.sw {{ padding: 18px; display: grid; align-content: end; gap: 2px; font-family: var(--font-num); font-weight: 600; letter-spacing: .04em; border: 1px solid var(--line); }}
.sw b {{ font-family: var(--font-display); font-weight: 400; font-size: 22px; letter-spacing: .02em; }}
.sw small {{ font-family: var(--font); font-size: 12.5px; opacity: .8; }}
.sw-s {{ display: grid; grid-template-columns: 34px 160px 190px 1fr; gap: 12px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--line); font-size: 14px; }}
.sw-s i {{ width: 34px; height: 34px; border: 1px solid var(--line-strong); }}
.sw-s code {{ font-family: var(--font-num); font-size: 15px; }}
.type-row {{ display: grid; grid-template-columns: 220px 1fr; gap: 24px; padding: 22px 0; border-bottom: 1px solid var(--line); align-items: baseline; }}
.type-row .meta {{ font-family: var(--font-num); font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); font-size: 13px; }}
.icons {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 8px; }}
.icons div {{ border: 1px solid var(--line); padding: 18px 8px 10px; display: grid; justify-items: center; gap: 10px; font-family: var(--font-num); font-weight: 700; letter-spacing: .08em; text-transform: uppercase; font-size: 12px; color: var(--muted); }}
.icons svg.icon {{ width: 34px; height: 34px; color: #fff; }}
.icons div:hover svg.icon {{ color: var(--accent-text); }}
.row {{ display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin: 12px 0; }}
.demo {{ border: 1px solid var(--line); padding: 24px; display: grid; gap: 16px; background: rgba(36,36,36,0.35); position: relative; }}
.demo > .label {{ font-family: var(--font-num); font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--muted); font-size: 12.5px; }}
.two {{ display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }}
.three {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }}
.tex {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }}
.tex figure {{ margin: 0; border: 1px solid var(--line); }}
.tex img {{ width: 100%; height: 160px; object-fit: cover; display: block; background: #0A0A0A; }}
.tex figcaption, .gal figcaption {{ padding: 8px 10px; font-family: var(--font-num); font-weight: 700; letter-spacing: .1em; text-transform: uppercase; font-size: 12.5px; color: var(--muted); }}
.gal {{ columns: 3 300px; column-gap: 12px; }}
.gal figure {{ margin: 0 0 12px; break-inside: avoid; border: 1px solid var(--line); }}
.gal img {{ width: 100%; display: block; }}
.ui-shots {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 12px; }}
.ui-shots figure {{ margin: 0; border: 1px solid var(--line); }} .ui-shots img {{ width: 100%; display: block; }}
.motion-box {{ height: 150px; border: 1px solid var(--line); position: relative; overflow: hidden; display: grid; place-items: center; }}
.static-popup {{ position: relative; animation: none; transform: none; display: inline-block; }}
.replay {{ animation: none !important; }}
.hud-demo {{ position: relative; height: 340px; overflow: hidden; background: url(../photography/game/360-pico.jpg) center/cover; }}
.hud-demo .ride-hud, .hud-demo .hud-top {{ position: absolute; }}
footer {{ margin-top: 100px; padding: 40px 0; border-top: 1px solid var(--line); color: var(--muted); font-size: 13px; }}
@media (max-width: 760px) {{ .two, .three {{ grid-template-columns: 1fr; }} .sws {{ grid-template-columns: 1fr; }} .type-row {{ grid-template-columns: 1fr; }} .sw-s {{ grid-template-columns: 34px 1fr; }} .sw-s small {{ grid-column: 1/-1; }} }}
</style></head>
<body class="grain">
<nav class="top"><div class="wrap">
  <img src="../logos/svg/es-logo-compact.svg" alt="Expression Session">
  <a href="#logos">Logos</a><a href="#cores">Cores</a><a href="#tipo">Tipografia</a><a href="#icones">Ícones</a><a href="#grafismos">Grafismos</a>
  <a href="#componentes">Componentes</a><a href="#hud">HUD</a><a href="#motion">Motion</a><a href="#interface">Interface</a><a href="#promo">Promo</a>
</div></nav>
<div class="wrap">
<section class="hero">
  <div class="eyebrow">Official brand showcase · v1.0</div>
  <img class="logo-big" src="../logos/svg/es-logo-primary-textured.svg" alt="Expression Session">
  <div class="slogan">Air is expression.</div>
  <p class="lead">Identidade <b>Underground Surf Punk</b>: lettering angular próprio, eixo inclinado de 11°, o corte vermelho do Lip e as faixas de velocidade ///. Tudo nesta página usa os mesmos arquivos e o mesmo CSS do jogo.</p>
  <div class="row"><a class="btn" href="../guidelines/expression-session-brand-guidelines.pdf">{ic('play')} Manual em PDF</a><a class="btn secondary" href="../README.md">{ic('help')} README da marca</a></div>
</section>

<section id="logos"><h2>Logotipos</h2><p class="lead">Vetores SVG editáveis em <code>brand/logos/svg</code> e PNG transparente em <code>brand/logos/png</code>. Use a versão sem textura abaixo de 240 px de largura.</p>
<div class="grid">{"".join(f'<figure class="logo-cell {bg}"><img src="../logos/svg/{f}.svg" alt="{n}"><figcaption>{n}</figcaption></figure>' for f, n, bg in LOGOS)}</div>
<h3 class="eyebrow" style="margin:36px 0 12px">Propostas iniciais</h3>
<div class="three">{"".join(f'<figure class="logo-cell dark" style="margin:0"><img src="../logos/proposals/{p}.png" alt="{n}"><figcaption>{n}</figcaption></figure>' for p, n in (("proposal-a-lip-slash", "A · Lip Slash (escolhida)"), ("proposal-b-air-loop", "B · Air Loop"), ("proposal-c-stencil-tape", "C · Stencil Tape")))}</div>
</section>

<section id="cores"><h2>Paleta</h2><p class="lead">Proporção 60 preto · 25 branco · 10 vermelho · 5 cinza. O vermelho é impacto e ação, nunca fundo de leitura longa.</p>
<div class="sws">{swatches()}</div>
<div style="margin-top:24px">{support()}</div>
</section>

<section id="tipo"><h2>Tipografia</h2><p class="lead">Três famílias, todas SIL Open Font License, embutidas no jogo (<code>src/ui/fonts</code>).</p>
<div class="type-row"><div class="meta">Anton 400<br>Display</div><div style="font-family:var(--font-display);font-size:72px;line-height:1;text-transform:uppercase">Above the lip 360°</div></div>
<div class="type-row"><div class="meta">Barlow Condensed<br>500–800 · tnum</div><div style="font-family:var(--font-num);font-weight:800;font-size:64px;font-variant-numeric:tabular-nums;letter-spacing:.02em">12.480 · x4 · 38 KM/H · 0:42</div></div>
<div class="type-row"><div class="meta">Barlow<br>400–700 · Interface</div><div style="font-size:20px;max-width:720px">Segure Espaço subindo a face e solte perto do Lip. Carregue o giro na compressão e pouse com a prancha alinhada.</div></div>
<div class="type-row"><div class="meta">Hierarquia</div><div style="display:grid;gap:10px"><h1 style="animation:none">Título de tela · H1</h1><h2>Título de modal · H2</h2><div class="section"><h3 style="padding:0">Título de seção · H3</h3></div><div class="tag">Rótulo / eyebrow</div><div>Corpo de texto Barlow 15 px</div><div class="sub">Texto secundário 13 px</div></div></div>
</section>

<section id="icones"><h2>Iconografia</h2><p class="lead">Grade 24, traço 2, pontas retas, quinas em vez de curvas. Herdam a cor do texto. SVG em <code>brand/icons/svg</code>.</p>
<div class="icons">{"".join(f'<div>{ic(n)}<span>{ICON_LABELS[n]}</span></div>' for n in icons)}</div>
</section>

<section id="grafismos"><h2>Grafismos, texturas e padrões</h2><p class="lead">Faixas ///, o corte do Lip, chevrons, trajetórias, reticula, spray, pincel e grão. Sempre em camadas leves: a leitura vem antes da textura.</p>
<div class="tex">{"".join(f'<figure><img src="../textures/png/{t}.png" alt="{t}"><figcaption>{t}</figcaption></figure>' for t in ("brush", "spray", "impact", "halftone", "asphalt", "concrete", "paper", "grain"))}
{"".join(f'<figure><img src="../patterns/png/{t}.png" alt="{t}" style="object-fit:none;background:url(../patterns/png/{t}.png)"><figcaption>padrão · {t}</figcaption></figure>' for t in ("speed-lines", "diagonal-hazard", "monogram-repeat", "trajectory", "chevron-lip", "halftone-tile"))}</div>
<h3 class="eyebrow" style="margin:36px 0 12px">Adesivos, selos e carimbos</h3>
<div class="tex">{"".join(f'<figure><img src="../promotional/stickers/png/{t}.png" alt="{t}" style="object-fit:contain;padding:12px"><figcaption>{t}</figcaption></figure>' for t in ("sticker-monogram", "sticker-slogan", "sticker-above-the-lip", "sticker-underground", "stamp-official", "stamp-new-record", "frame-tape"))}</div>
</section>

<section id="componentes"><h2>Componentes</h2><p class="lead">Os mesmos componentes da interface do jogo, com todos os estados. Passe o mouse, clique e navegue com Tab.</p>
<div class="two">
<div class="demo"><div class="label">Botões</div>
  <div class="row"><button class="btn">{ic('play')} Começar bateria <span class="kbd">Enter</span></button><button class="btn secondary">{ic('stats')} Evolução</button></div>
  <div class="row"><button class="btn outline">{ic('stats')} Evoluir atributos</button><button class="btn danger">Reiniciar progressão</button><button class="btn" disabled>Desabilitado</button></div>
  <div class="row"><button class="btn small secondary selected" aria-pressed="true">Ultra</button><button class="btn small secondary">Alta</button><button class="btn small secondary">Média</button><button class="btn small secondary locked">Bloqueado</button></div>
</div>
<div class="demo"><div class="label">Chips, teclas e etiquetas</div>
  <div class="row"><span class="chip">Pico Leste</span><span class="chip">Onda 1,51 m</span><span class="chip">Vento maral 12 km/h</span><span class="chip red">vale ×1,5</span></div>
  <div class="row"><span class="kbd">Espaço</span><span class="kbd">D</span><span class="kbd">W</span><span class="kbd">← →</span><span class="kbd">Esc</span></div>
  <div class="tag">Desafio da onda · Intermediário</div>
  <div class="row"><span class="good">✓ Positivo</span><span class="warn">Aviso funcional</span><span class="bad">✗ Negativo</span><span class="accent">Destaque de marca</span></div>
</div>
<div class="demo"><div class="label">Cards</div>
  <div class="card selected"><div class="title">Session Standard <span class="muted">· Equilibrada</span></div><div class="sub">5'10" × 18 1/2" × 2 1/4"</div><div class="mods"><span>Impulsão <b class="good">+1</b></span><span>Rotação <b class="good">+1</b></span><span>Pouso <b class="bad">-1</b></span></div></div>
  <div class="card"><div class="title">Razor <span class="muted">· Rotação e agilidade</span></div><div class="sub">Curta e fina: gira rápido, mas é nervosa no pouso.</div></div>
  <div class="card locked"><div class="title">Wildcard</div><div class="sub">{ic('lock')} Libera no nível 6</div></div>
</div>
<div class="demo"><div class="label">Card de praia</div>
  <div class="card spot selected"><div class="spot-art" style="--spot-bg:linear-gradient(180deg,#bfdcec 0 42%,#23b5c4 42% 70%,#05496b 100%)"><span>Pico Leste</span></div><div class="spot-info"><div class="spot-stats"><span>Beach break tropical</span><span>Onda <b>0,8–2,0 m</b></span><span>Potência <b>35–70</b></span></div><div class="sub">Água turquesa e ondas irregulares.</div></div></div>
  <div class="card spot locked"><div class="spot-art" style="--spot-bg:linear-gradient(180deg,#f0b98a 0 42%,#2f8fa0 42% 70%,#0b3a52 100%)"><span>Ponta da Rampa</span></div><div class="spot-info"><div class="sub">{ic('lock')} Bloqueado: libera no nível 3</div></div></div>
</div>
<div class="demo"><div class="label">Entradas, barras e abas</div>
  <div class="slider-row"><span class="muted">Altura da onda</span><input type="range" min="0" max="100" value="60" style="--fill:60%"><b>1,50 m</b></div>
  <div class="slider-row"><span class="muted">Direção do vento</span><select><option>Maral</option><option>Terral</option></select><span></span></div>
  <div class="attr-row"><span class="name">Impulsão<small>Impulsion</small></span><div class="bar"><span style="width:62%"></span></div><b>62</b><button class="btn small">+</button></div>
  <div class="tabs"><button class="tab active">{ic('equipment')} Roupa</button><button class="tab">{ic('board')} Prancha</button><button class="tab">{ic('fin')} Quilhas</button></div>
  <div class="filters"><button class="tab active">Todas</button><button class="tab">Liberados</button><button class="tab">Bloqueados</button></div>
</div>
<div class="demo"><div class="label">Tiles e amostras (personalização preservada)</div>
  <div class="tiles"><button class="tile selected"><span class="tile-name">Neoprene 3/2</span></button><button class="tile"><span class="tile-name">Springsuit</span></button><button class="tile" disabled><span class="tile-name">Short john</span><span class="tile-req">{ic('lock')} Nível 3</span></button></div>
  <div class="swatches"><button class="swatch-btn selected" style="background:#1b1b1b"></button><button class="swatch-btn" style="background:#2b5f8a"></button><button class="swatch-btn" style="background:#e8c547"></button><button class="swatch-btn" style="background:#c2410c"></button><button class="swatch-btn" style="background:#f5f5f5"></button><button class="swatch-btn" disabled style="background:#7c3aed"></button></div>
  <p class="sub">As cores de roupa, prancha e quilhas continuam livres: a paleta da marca vale para a interface, não para o surfista.</p>
</div>
</div>
<div class="two" style="margin-top:16px">
<div class="demo"><div class="label">Modal e alerta</div>
  <div class="panel modal" style="position:relative;width:auto;animation:none"><h2>Reiniciar progressão?</h2><div class="muted">Isso apaga todo o seu progresso salvo neste navegador.</div><div class="actions"><button class="btn secondary">Cancelar</button><button class="btn danger">Apagar tudo</button></div></div>
  <div class="toast" style="position:relative;animation:none;margin:0">{ic('check')} Visual salvo</div>
</div>
<div class="demo"><div class="label">Ficha técnica e sequência de comandos</div>
  <div class="spec-strip"><div><span class="label">{ic('height')} Altura</span><b>1,6 m</b></div><div><span class="label">{ic('rotation')} Rotação</span><b>360°</b></div><div><span class="label">{ic('speed')} Aproximação</span><b>27+ km/h</b></div><div><span class="label">{ic('score')} Dificuldade</span><b>58</b><div class="difficulty"><i class="on"></i><i class="on"></i><i class="on"></i><i class="on"></i><i class="on"></i><i class="on"></i><i></i><i></i><i></i><i></i></div></div></div>
  <div class="seq"><div class="seq-step"><span class="key k-impulsao">Espaço</span><small>Segure e solte no Lip</small></div><span class="seq-arrow">›</span><div class="seq-step"><span class="key k-rotacao">→</span><small>Giro 360°</small></div><span class="seq-arrow">›</span><div class="seq-step"><span class="key k-grab">Z</span><small>Indy</small></div><span class="seq-arrow">›</span><div class="seq-step"><span class="key k-aterrissagem">↓</span><small>Pouso</small></div></div>
  <div class="wave-total"><span>Total da onda</span><b>1.284</b></div>
</div>
</div>
</section>

<section id="hud"><h2>HUD</h2><p class="lead">Nas bordas, translúcido, números tabulares. O centro da tela é do surfista e da onda.</p>
<div class="hud-demo">
  <div class="hud-top"><div class="panel score-box"><div><div class="label">Onda</div><div class="big">2/5</div></div><div><div class="label">Total</div><div class="big">2.140</div></div><div><div class="label">Combo</div><div class="big accent">x3</div></div></div>
  <div class="panel cond-box"><span class="chip">Pico Leste</span><span class="chip">Onda 1,51 m</span><span class="chip">Potência 53</span></div></div>
  <div class="ride-hud"><div class="panel ride-meters"><div class="meter"><span class="label">Velocidade</span><div class="bar"><span style="width:72%"></span></div><b>31 km/h</b></div><div class="meter"><span class="label">Zona crítica</span><div class="bar crit"><span style="width:40%"></span></div><b>4,2 m</b></div><div class="meter"><span class="label">Compressão</span><div class="bar comp"><span style="width:85%"></span></div><b>pronto</b></div></div>
  <div class="panel ride-msg">No lip: segure e solte o espaço para voar</div></div>
</div>
</section>

<section id="motion"><h2>Motion</h2><p class="lead">Entradas em diagonal, revelação de títulos por corte, pontuação com "soco" e carimbo de recorde. Tudo some com <code>prefers-reduced-motion</code>. Clique para repetir.</p>
<div class="three">
  <div class="motion-box" data-replay><div class="popup good big static-popup" style="animation:pop 0.9s var(--es-ease-out) infinite;left:50%;position:absolute;top:40%">Air Reverse</div></div>
  <div class="motion-box" data-replay><div class="final-score">12.480</div></div>
  <div class="motion-box" data-replay><span class="record-stamp">NOVO RECORDE PESSOAL</span></div>
  <div class="motion-box" data-replay><h1 class="reveal" style="font-size:54px">Fim da bateria</h1></div>
  <div class="motion-box" data-replay><img src="../logos/svg/es-logo-primary.svg" style="width:80%;animation:logo-in .7s var(--es-ease-out) both"></div>
  <div class="motion-box" data-replay><div class="popup bad static-popup" style="animation:pop 0.9s var(--es-ease-out) infinite;left:50%;position:absolute;top:40%">Queda!</div></div>
</div>
</section>

<section id="interface"><h2>Interface do jogo</h2><p class="lead">Capturas reais, com uma bateria completa jogada pelo piloto automático do próprio jogo.</p>
<div class="ui-shots">{"".join(f'<figure><img src="../photography/ui/{f}.jpg" alt="{n}" loading="lazy"><figcaption>{n}</figcaption></figure>' for f, n in UI)}</div>
<h3 class="eyebrow" style="margin:28px 0 12px">Celular (390 × 844)</h3>
<div class="ui-shots" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr))">{"".join(f'<figure><img src="../photography/ui-mobile/{f}.jpg" alt="{n}" loading="lazy"><figcaption>{n}</figcaption></figure>' for f, n in UI[:3] + UI[6:8])}</div>
</section>

<section id="promo"><h2>Promocional e aplicações</h2><p class="lead">Fontes HTML editáveis em <code>brand/promotional/src</code>; PNG no tamanho final em <code>brand/promotional</code>.</p>
<div class="gal">{"".join(f'<figure><img src="../promotional/{p}.jpg" alt="{p}" loading="lazy"><figcaption>{p}</figcaption></figure>' for p in PROMOS)}
<figure><img src="../mockups/boards/png/board-lineup.png" loading="lazy"><figcaption>Estampas de prancha</figcaption></figure>
<figure><img src="../mockups/apparel/png/tee-lineup.png" loading="lazy"><figcaption>Camisetas conceituais</figcaption></figure></div>
</section>
<footer>EXPRESSION SESSION — Official Brand Showcase · Gerado por <code>brand/tools/build_showcase.py</code> · Fontes: Anton, Barlow e Barlow Condensed (SIL OFL 1.1).</footer>
</div>
<script>
document.querySelectorAll('[data-replay]').forEach(box => box.addEventListener('click', () => {{
  box.querySelectorAll('*').forEach(n => {{ const a = n.style.animation; n.style.animation = 'none'; void n.offsetWidth; n.style.animation = a; n.getAnimations && n.getAnimations().forEach(x => {{ x.cancel(); x.play(); }}); }});
}}));
</script>
</body></html>
"""

if __name__ == "__main__":
    p = os.path.join(ROOT, "brand/showcase/index.html")
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, "w", encoding="utf-8").write(HTML)
    print("ok", p)
