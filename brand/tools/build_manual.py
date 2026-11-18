"""
EXPRESSION SESSION — OFFICIAL BRAND GUIDELINES.

Fonte editavel do manual: este script gera brand/guidelines/source/brand-guidelines.html
(A4 paisagem, uma <section class="page"> por pagina). O PDF sai do mesmo HTML:

    python3 brand/tools/build_manual.py
    node brand/tools/render.cjs brand/tools/jobs-manual.json
"""

import json
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "brand/guidelines/source/brand-guidelines.html")
A = "../../"  # de brand/guidelines/source ate brand/

tokens = json.load(open(os.path.join(ROOT, "brand/design-system/tokens.json"), encoding="utf-8"))


def lum(hexv):
    hexv = hexv.lstrip("#")
    r, g, b = (int(hexv[i:i + 2], 16) / 255 for i in (0, 2, 4))
    f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)


def contrast(a, b):
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def verdict(c):
    return "AAA" if c >= 7 else "AA" if c >= 4.5 else "AA grande" if c >= 3 else "Reprovado"


PAGES = []


def page(section, title, body, cls=""):
    PAGES.append((section, title, body, cls))


def img(path, style=""):
    return f'<img src="{A}{path}" style="{style}">'


# ------------------------------------------------------------------ conteudo

page("", "", f"""
<div class="cover">
  <div class="cover-photo" style="background-image:url({A}photography/game/air-reverse-pico.jpg)"></div>
  <div class="cover-shade"></div>
  <div class="cover-slash"></div>
  {img('logos/svg/es-logo-primary-textured.svg', 'position:absolute;left:22mm;top:58mm;width:150mm')}
  <div class="cover-title">Official Brand Guidelines</div>
  <div class="cover-meta">Versão 1.0 · Novembro de 2026 · Underground Surf Culture</div>
</div>""", "bleed")

TOC = [
    ("01", "Marca", "Apresentação, história, propósito, posicionamento, personalidade, público, território, moodboard"),
    ("02", "Logotipo", "Propostas, logotipo oficial, construção, proteção, redução, variações, símbolo, usos incorretos"),
    ("03", "Cor", "Paleta, proporção, conversões, contraste e cores funcionais"),
    ("04", "Tipografia", "Famílias, pesos, hierarquia e exemplos"),
    ("05", "Universo gráfico", "Iconografia, grafismos, texturas, padrões e fotografia"),
    ("06", "Voz", "Tom de voz em português e inglês, slogans"),
    ("07", "Sistema", "Motion, design system, componentes e interface do jogo"),
    ("08", "Aplicações", "Digital, redes sociais, promocional, roupas e pranchas"),
    ("09", "Regras", "Acessibilidade, governança e manutenção"),
]
page("", "Sumário", '<div class="toc">' + "".join(
    f'<div><b>{n}</b><h3>{t}</h3><p>{d}</p></div>' for n, t, d in TOC) + "</div>")

page("01 · Marca", "Apresentação da marca", f"""
<div class="cols">
<div>
<p class="big">EXPRESSION SESSION é um jogo de surfe feito para o ar. Não é sobre ficar em pé na onda: é sobre usar a onda como rampa e escrever, lá em cima, um aéreo que só você faria daquele jeito.</p>
<p>A identidade nasce da cultura que inventou o aéreo: os vídeos caseiros de surfe e skate, os fanzines xerocados, os adesivos colados na rabeta, os flyers de show de garagem. Ela pega essa atitude e a organiza com o rigor de uma marca esportiva premium.</p>
<p>Este manual define como a marca aparece em todo lugar: no jogo, nas redes, nas lojas de jogos, numa camiseta ou no deck de uma prancha.</p>
</div>
<div class="panel-img dark">{img('logos/svg/es-logo-primary.svg', 'width:100%')}<div class="slogan-xl">Air is expression.</div></div>
</div>""")

page("01 · Marca", "História e conceito", """
<div class="cols">
<div>
<h3>Expression session</h3>
<p>No surfe, "expression session" é a bateria sem regras de julgamento tradicional: os melhores surfistas entram na água para mostrar estilo, criatividade e risco. Nada de ondas protocolares. É ali que manobras novas aparecem.</p>
<p>O jogo leva esse espírito para cada onda: a roleta sorteia um desafio, mas a onda é sua. Desça, bombeie, leia a seção, comprima, solte no <b>Lip</b> e invente.</p>
</div>
<div>
<h3>Conceito: Underground Surf Punk</h3>
<p>Punk é fazer com o que se tem, do seu jeito, alto. Surfe aéreo é a mesma coisa sobre a água. O conceito junta:</p>
<ul><li>a energia gráfica do punk e da serigrafia;</li><li>a geometria do aéreo: decolagem, trajetória, rotação, pouso;</li><li>a precisão de uma interface esportiva contemporânea.</li></ul>
<p class="quote">Agressiva, mas organizada. Suja na borda, limpa no centro.</p>
</div>
</div>""")

page("01 · Marca", "Propósito e posicionamento", """
<div class="cols">
<div><h3>Propósito</h3><p class="big">Dar ao jogador a liberdade de se expressar no ar e o caminho técnico para evoluir até lá.</p></div>
<div><h3>Posicionamento</h3>
<p>Para jogadores que gostam de esportes radicais e de dominar uma técnica, EXPRESSION SESSION é o jogo de surfe especializado em manobras aéreas que trata o estilo como pontuação e a progressão como cultura, com a autenticidade do surfe underground em vez da estética genérica de jogo esportivo.</p>
<table class="t"><tr><th>Somos</th><th>Não somos</th></tr>
<tr><td>Especialistas em aéreos</td><td>Um simulador genérico de surfe</td></tr>
<tr><td>Independentes e autênticos</td><td>Corporativos ou "fofos"</td></tr>
<tr><td>Técnicos e precisos</td><td>Arcade sem regras</td></tr>
<tr><td>Contemporâneos com raiz nos anos 90/00</td><td>Retrô pixelado ou nostálgico</td></tr></table>
</div></div>""")

TRAITS = [("Livre", "Escolhe a própria linha. A onda é dele."), ("Rebelde", "Desconfia do óbvio e quebra a regra com critério."),
          ("Intenso", "Fala curto, alto e com energia."), ("Criativo", "Combina giro, grab e extensão como ninguém."),
          ("Autêntico", "Usa os termos reais do surfe e não força gíria."), ("Competitivo", "Quer o recorde e mostra o número."),
          ("Progressivo", "Respeita a técnica: cada aéreo se aprende."), ("Independente", "Faz do próprio jeito, com acabamento profissional.")]
page("01 · Marca", "Personalidade", '<div class="traits">' + "".join(f'<div><h3>{t}</h3><p>{d}</p></div>' for t, d in TRAITS) + """</div>
<div class="scale"><span>Sério</span><i style="left:62%"></i><span>Debochado</span></div>
<div class="scale"><span>Limpo</span><i style="left:40%"></i><span>Sujo</span></div>
<div class="scale"><span>Clássico</span><i style="left:70%"></i><span>Moderno</span></div>
<div class="scale"><span>Calmo</span><i style="left:82%"></i><span>Explosivo</span></div>""")

page("01 · Marca", "Público-alvo", """
<div class="three">
<div class="persona"><h3>O surfista que joga</h3><p>18 a 35 anos. Surfa ou já surfou, conhece os nomes das manobras e quer ver física e nomenclatura respeitadas.</p><p class="tag">Valoriza: autenticidade, termos certos, Lip, frontside, backside.</p></div>
<div class="persona"><h3>O jogador de esportes radicais</h3><p>15 a 30 anos. Cresceu com jogos de skate e snowboard. Gosta de combos, recordes e de dominar um sistema de comandos.</p><p class="tag">Valoriza: precisão, progressão, pontuação clara.</p></div>
<div class="persona"><h3>A cena alternativa</h3><p>Público de música independente, skate de rua e cultura de fanzine. Chega pela estética e fica pela atitude.</p><p class="tag">Valoriza: estilo, identidade forte, produtos (camiseta, adesivo).</p></div>
</div>
<p class="note">Comunicação internacional em inglês nas peças de marca; interface e instruções em português, com os termos técnicos do surfe preservados.</p>""")

page("01 · Marca", "Território criativo", """
<div class="cols">
<div>
<h3>Referências de linguagem (nunca de propriedade)</h3>
<ul class="two-col">
<li>Capas de discos e cartazes de shows punk</li><li>Fanzines xerocados e lambe-lambe</li><li>Serigrafia e impressão desgastada</li><li>Revistas independentes de skate e surfe</li><li>Adesivos de prancha e fita isolante</li><li>Fotografia analógica em P&amp;B</li><li>Vídeos de surfe dos anos 90 e 2000</li><li>Asfalto, concreto e pista de skate</li>
</ul>
<p>Reinterpretadas com acabamento atual: vetores precisos, grade, tipografia controlada e muito respiro.</p>
</div>
<div>
<h3>As quatro regras do território</h3>
<ol class="rules"><li><b>Eixo de 11°.</b> Tudo que corre (lettering, faixas, cortes) inclina para a frente no mesmo ângulo.</li>
<li><b>Corte, não curva.</b> Cantos chanfrados e terminais em diagonal. Curva só na trajetória do aéreo.</li>
<li><b>Vermelho é impacto.</b> Um ponto de vermelho por composição manda mais que dez.</li>
<li><b>Textura na borda.</b> Desgaste e grão nunca ficam sobre texto pequeno ou números.</li></ol>
</div></div>""")

page("01 · Marca", "Moodboard", f"""
<div class="mood">
  <div class="m1" style="background-image:url({A}photography/game/indy-rampa.jpg)"></div>
  <div class="m2">{img('textures/png/brush.png', 'width:100%;height:100%;object-fit:cover')}</div>
  <div class="m3">{img('promotional/stickers/png/stamp-official.png', 'width:90%')}</div>
  <div class="m4" style="background-image:url({A}photography/game/backflip-lagoa.jpg)"></div>
  <div class="m5">{img('textures/png/halftone.png', 'width:100%;height:100%;object-fit:cover')}</div>
  <div class="m6">{img('promotional/stickers/png/sticker-above-the-lip.png', 'width:92%')}</div>
  <div class="m7">{img('textures/png/asphalt.png', 'width:100%;height:100%;object-fit:cover')}</div>
  <div class="m8">{img('patterns/png/speed-lines.png', 'width:100%;height:100%;object-fit:cover')}</div>
</div>
<p class="note">Moodboard montado só com material próprio: quadros do jogo, texturas e adesivos da marca. Nenhuma imagem de terceiros.</p>""")

page("02 · Logotipo", "Três propostas iniciais", f"""
<div class="three props">
<div>{img('logos/proposals/proposal-a-lip-slash.png', 'width:100%')}<h3>A · Lip Slash</h3><p>Lettering angular próprio, inclinado a 11°, com faixas de velocidade /// e monograma E/S cortado pelo Lip.</p></div>
<div>{img('logos/proposals/proposal-b-air-loop.png', 'width:100%')}<h3>B · Air Loop</h3><p>Base tipográfica condensada inclinada; os Os viram anéis de rotação e um arco de trajetória passa por cima.</p></div>
<div>{img('logos/proposals/proposal-c-stencil-tape.png', 'width:100%')}<h3>C · Stencil Tape</h3><p>Lettering reto em estêncil sobre fita rasgada, como lambe-lambe e adesivo de rabeta.</p></div>
</div>
<table class="t score"><tr><th>Critério (1 a 5)</th><th>A</th><th>B</th><th>C</th></tr>
<tr><td>Originalidade</td><td>5</td><td>3</td><td>4</td></tr><tr><td>Legibilidade</td><td>5</td><td>3</td><td>3</td></tr>
<tr><td>Personalidade punk</td><td>4</td><td>3</td><td>5</td></tr><tr><td>Aplicação digital (UI, HUD)</td><td>5</td><td>3</td><td>2</td></tr>
<tr><td>Escalabilidade (16 px a outdoor)</td><td>5</td><td>2</td><td>3</td></tr><tr><td>Reconhecimento</td><td>5</td><td>4</td><td>3</td></tr>
<tr class="tot"><td>Total</td><td>29</td><td>18</td><td>20</td></tr></table>""")

page("02 · Logotipo", "Logotipo oficial: Lip Slash", f"""
<div class="cols">
<div class="panel-img dark">{img('logos/svg/es-logo-primary.svg', 'width:100%')}</div>
<div>
<h3>Por que A</h3>
<p>É a única proposta que funciona igual no menu, no HUD, num favicon de 16 px e num outdoor. O desenho das letras é exclusivo (não é uma fonte), então ninguém reproduz a marca digitando.</p>
<ul><li><b>Lettering próprio</b>: hastes de 22, barras de 19, cortes diagonais nos terminais.</li>
<li><b>/// faixas de velocidade</b>: o movimento antes da decolagem. Ocupam o espaço que SESSION deixa livre.</li>
<li><b>Assinatura</b>: UNDERGROUND SURF CULTURE em Barlow Condensed, com fio vermelho.</li>
<li><b>Corte do Lip</b>: no símbolo E/S, a faixa vermelha é a borda da onda que separa a água do ar.</li></ul>
</div></div>""")

page("02 · Logotipo", "Construção", f"""
<div class="cols">
<div class="construct">{img('logos/svg/es-logo-wordmark.svg', 'width:100%')}<div class="grid-over"></div></div>
<div>
<table class="t"><tr><th>Medida</th><th>Valor (altura da letra = 100)</th></tr>
<tr><td>Altura da caixa alta</td><td>100</td></tr><tr><td>Haste vertical</td><td>22</td></tr><tr><td>Barra horizontal</td><td>19</td></tr>
<tr><td>Inclinação</td><td>11°</td></tr><tr><td>Corte dos terminais</td><td>9 (diagonal)</td></tr><tr><td>Chanfro dos cantos</td><td>6 a 16</td></tr>
<tr><td>Espaço entre letras</td><td>6</td></tr><tr><td>Entrelinha EXPRESSION / SESSION</td><td>22</td></tr><tr><td>Faixas ///</td><td>64 · 42 · 24, espaço 10</td></tr></table>
<p class="note">O desenho é gerado por <code>brand/tools/letters.py</code>: mudar uma medida ali atualiza todos os arquivos de uma vez.</p>
</div></div>""")

page("02 · Logotipo", "Área de proteção e redução mínima", f"""
<div class="cols">
<div><div class="protect">{img('logos/svg/es-logo-wordmark.svg', 'width:100%')}</div>
<p>Área de proteção = <b>altura de uma letra (X)</b> em volta de todo o logotipo. Nada entra nesse espaço: texto, borda, outro logo ou elemento gráfico forte.</p></div>
<div>
<h3>Redução mínima</h3>
<div class="mins">
<div>{img('logos/svg/es-logo-primary.svg', 'width:40mm')}<span>Principal: 40 mm / 240 px</span></div>
<div>{img('logos/svg/es-logo-horizontal.svg', 'width:50mm')}<span>Horizontal: 50 mm / 280 px</span></div>
<div>{img('logos/svg/es-symbol.svg', 'width:9mm')}<span>Símbolo: 9 mm / 32 px</span></div>
<div>{img('logos/png/sizes/es-icon-16.png', 'width:16px;image-rendering:pixelated')} {img('logos/png/sizes/es-icon-32.png', 'width:32px')}<span>Favicon: 16 e 32 px</span></div>
</div>
<p class="note">Abaixo de 240 px use a versão sem textura e sem assinatura (<code>es-logo-wordmark</code>). Abaixo de 120 px use o símbolo.</p>
</div></div>""")

VAR = [("es-logo-primary", "Principal", "dark"), ("es-logo-primary-textured", "Com textura (peças grandes)", "dark"), ("es-logo-primary-black", "Fundo claro", "light"),
       ("es-logo-primary-white", "Branco (sobre vermelho ou foto)", "red"), ("es-logo-primary-red", "Vermelho (sobre branco)", "light"), ("es-logo-mono-black", "Monocromático (carimbo, gravação)", "light"),
       ("es-logo-horizontal", "Horizontal", "dark"), ("es-logo-vertical", "Vertical", "dark"), ("es-logo-compact", "Compacto", "dark")]
page("02 · Logotipo", "Variações permitidas", '<div class="vars">' + "".join(
    f'<div class="{bg}">{img(f"logos/svg/{f}.svg", "max-width:90%;max-height:28mm")}<span>{n}</span></div>' for f, n, bg in VAR) + "</div>")

page("02 · Logotipo", "Símbolo, monograma, ícone e favicon", '<div class="vars four">' + "".join(
    f'<div class="{bg}">{img(f"logos/svg/{f}.svg", "max-width:80%;max-height:40mm")}<span>{n}</span></div>' for f, n, bg in [
        ("es-symbol", "Símbolo E/S", "dark"), ("es-monogram-badge", "Monograma em selo", "light"), ("es-app-icon", "Ícone de aplicativo", "concrete"),
        ("es-favicon", "Favicon (S + faixa)", "concrete"), ("es-symbol-black", "Símbolo preto", "light"), ("es-symbol-red", "Símbolo vermelho", "light"),
        ("es-symbol-white", "Símbolo branco", "red"), ("es-logo-compact-black", "Compacto preto", "light")]) + '</div><p class="note">Em 16 a 32 px o monograma completo vira mancha: o favicon usa só o S em preto sobre vermelho, com a faixa do Lip embaixo.</p>')

WRONG = [("transform:scaleX(1.4)", "Não distorça"), ("transform:rotate(-14deg)", "Não gire"), ("filter:hue-rotate(160deg)", "Não troque as cores"),
         ("filter:drop-shadow(0 0 6px #0ff) drop-shadow(0 0 12px #0ff)", "Não aplique brilho ou sombra"), ("opacity:.35", "Não use sem contraste"), ("", "Não use sobre fundo poluído")]
page("02 · Logotipo", "Aplicações incorretas", '<div class="vars wrong">' + "".join(
    f'<div class="{"busy" if i == 5 else "light" if i == 4 else "dark"}">{img("logos/svg/es-logo-primary.svg", f"max-width:80%;max-height:24mm;{s}")}<span>✗ {n}</span></div>' for i, (s, n) in enumerate(WRONG)) +
    '</div><p class="note">Também não: recriar o lettering com uma fonte, separar as faixas /// do nome, mudar a inclinação, contornar as letras ou colocar o logotipo dentro de formas que não sejam o selo oficial.</p>')

brand = tokens["color"]["brand"]
page("03 · Cor", "Paleta cromática", '<div class="palette">' + "".join(
    f'<div style="background:{v["value"]};color:{"#0A0A0A" if k == "pure-white" else "#fff"};flex:{ {"underground-black": 6, "pure-white": 2.5, "rebel-red": 1.2, "concrete-gray": 0.8, "asphalt-gray": 1.3}[k]}">'
    f'<b>{k.replace("-", " ")}</b><span>HEX {v["value"]}</span><span>RGB {v["rgb"]}</span><span>CMYK ≈ {v["cmyk"]}</span><small>{v["use"]}</small></div>' for k, v in brand.items()) +
    '</div><div class="ratio"><i style="flex:60;background:#0A0A0A"></i><i style="flex:25;background:#fff"></i><i style="flex:10;background:#E30613"></i><i style="flex:5;background:#808080"></i></div>'
    '<p class="note">Proporção visual: 60 preto · 25 branco · 10 vermelho · 5 cinza. CMYK aproximado para impressão em papel couché; prove sempre com a gráfica. Azul, verde, amarelo e roxo não são cores da marca: aparecem só no mar, no céu, na natureza e na personalização do surfista.</p>')

PAIRS = [("#FFFFFF", "#0A0A0A", "Texto branco sobre preto"), ("#FFFFFF", "#242424", "Texto branco sobre asfalto"), ("#FFFFFF", "#E30613", "Texto branco sobre vermelho (botões)"),
         ("#E30613", "#0A0A0A", "Rebel Red sobre preto"), ("#FF3B45", "#0A0A0A", "Signal Red (texto) sobre preto"), ("#FF3B45", "#242424", "Signal Red sobre asfalto"),
         ("#808080", "#0A0A0A", "Concrete sobre preto"), ("#808080", "#242424", "Concrete sobre asfalto"), ("#B3B3B3", "#242424", "Concrete Light sobre asfalto"),
         ("#0A0A0A", "#FFFFFF", "Preto sobre branco"), ("#E30613", "#FFFFFF", "Vermelho sobre branco"), ("#FFB020", "#0A0A0A", "Amber funcional sobre preto")]
rows = "".join(f'<tr><td><span class="pair" style="background:{bg};color:{fg}">Aa 123</span></td><td>{d}</td><td>{contrast(fg, bg):.2f}:1</td><td class="v{verdict(contrast(fg, bg)).split()[0]}">{verdict(contrast(fg, bg))}</td></tr>' for fg, bg, d in PAIRS)
sup = tokens["color"]["support"]
page("03 · Cor", "Contraste e cores funcionais", f"""
<div class="cols"><div><table class="t contrast"><tr><th>Amostra</th><th>Par</th><th>Contraste</th><th>WCAG 2.1</th></tr>{rows}</table></div>
<div><h3>Regras</h3>
<ul><li><b>Rebel Red</b> (#E30613) sobre preto dá 4,0:1: só para títulos grandes, faixas e formas.</li>
<li>Para <b>texto pequeno vermelho</b> use o <b>Signal Red</b> (#FF3B45), 5,6:1 sobre preto.</li>
<li>Texto secundário sobre asfalto usa <b>Concrete Light</b> (#B3B3B3).</li>
<li>Cores funcionais: <b>Amber</b> (#FFB020) só para aviso; positivo é branco com ✓, negativo é Signal Red com ✗. Nunca só cor: sempre ícone, sinal ou texto junto.</li></ul>
<div class="chips">{''.join(f'<span><i style="background:{v["value"]}"></i>{k} {v["value"]}</span>' for k, v in sup.items())}</div>
</div></div>""")

page("04 · Tipografia", "Sistema tipográfico", """
<div class="three type">
<div><div class="spec" style="font-family:Anton;font-size:66pt;line-height:1">Aa</div><h3>Anton · Display</h3><p>Títulos, campeonatos, publicidade, resultados. Sempre em caixa alta, peso único 400, espaço +1%.</p><p class="tag">SIL OFL 1.1 · Vernon Adams</p></div>
<div><div class="spec" style="font-family:'Barlow Condensed';font-weight:800;font-size:66pt;line-height:1">0123</div><h3>Barlow Condensed · Números e rótulos</h3><p>Pontuação, cronômetro, multiplicadores, velocidade, botões e rótulos. Pesos 500 a 800, algarismos tabulares (tnum).</p><p class="tag">SIL OFL 1.1 · Jeremy Tribby</p></div>
<div><div class="spec" style="font-family:Barlow;font-weight:600;font-size:66pt;line-height:1">Ag</div><h3>Barlow · Interface</h3><p>Menus, diálogos, instruções, configurações. Pesos 400 a 700. Mínimo de 12,5 px na tela.</p><p class="tag">SIL OFL 1.1 · Jeremy Tribby</p></div>
</div>
<p class="note">Avaliadas e descartadas: Teko (números estreitos demais em 13 px), Oswald (pouco agressiva para títulos), Archivo Black (larga demais para HUD), Inter (neutra demais para a marca; segue como fonte de sistema reserva). Licenças em <code>brand/licenses</code>.</p>""")

page("04 · Tipografia", "Hierarquia textual", """
<table class="t hier">
<tr><th>Nível</th><th>Amostra</th><th>Fonte · peso · tamanho · espaço</th></tr>
<tr><td>Hero</td><td style="font-family:Anton;font-size:40pt;line-height:1">AIR IS EXPRESSION.</td><td>Anton 400 · 48–104 px · +1%</td></tr>
<tr><td>H1 tela</td><td style="font-family:Anton;font-size:24pt">PREPARAÇÃO DA BATERIA</td><td>Anton 400 · 30–44 px · +1%</td></tr>
<tr><td>Manobra</td><td style="font-family:Anton;font-size:28pt;text-shadow:2px 2px 0 #E30613">AIR REVERSE</td><td>Anton 400 · 44–72 px · sombra de registro</td></tr>
<tr><td>Score</td><td style="font-family:'Barlow Condensed';font-weight:800;font-size:28pt">12.480 <span style="color:#FF3B45">x4</span></td><td>Barlow Condensed 800 · 30–96 px · tnum</td></tr>
<tr><td>Seção / botão</td><td style="font-family:'Barlow Condensed';font-weight:700;font-size:13pt;letter-spacing:.14em">// CONDIÇÕES DO MAR</td><td>Barlow Condensed 700 · 14–21 px · +7 a +16%</td></tr>
<tr><td>Corpo</td><td style="font-size:11pt">Segure Espaço subindo a face e solte perto do Lip.</td><td>Barlow 500 · 15 px · 1,45</td></tr>
<tr><td>Secundário</td><td style="font-size:9.5pt;color:#555">Cada onda varia um pouco em torno destes valores.</td><td>Barlow 500 · 13 px</td></tr>
</table>""")

page("05 · Universo gráfico", "Iconografia", f"""
<div style="background:#0A0A0A;display:grid;place-items:center">{img('icons/icon-sheet.png', 'max-height:128mm;max-width:100%')}</div>
<p class="note">Grade de 24 px, traço de 2 px, pontas retas (square) e junções em quina (miter). Formas a partir de losangos, octógonos e diagonais: nada de círculos perfeitos ou cantos arredondados. 38 ícones em <code>brand/icons/svg</code>, usados no jogo por <code>src/ui/icons.ts</code>.</p>""")

page("05 · Universo gráfico", "Elementos gráficos", f"""
<div class="elems">
<div class="dark">{img('logos/svg/es-symbol.svg', 'height:24mm')}<span>Corte do Lip</span></div>
<div class="dark">{img('patterns/png/speed-lines.png', 'width:100%;height:100%;object-fit:cover')}<span>Faixas de velocidade ///</span></div>
<div class="dark">{img('patterns/png/chevron-lip.png', 'width:100%;height:100%;object-fit:cover')}<span>Chevron Lip</span></div>
<div class="dark">{img('patterns/png/trajectory.png', 'width:100%;height:100%;object-fit:cover')}<span>Trajetória do aéreo</span></div>
<div class="dark">{img('textures/png/impact.png', 'height:30mm')}<span>Marca de impacto</span></div>
<div class="dark">{img('promotional/stickers/png/stamp-new-record.png', 'width:85%')}<span>Carimbo</span></div>
<div class="dark">{img('promotional/stickers/png/sticker-slogan.png', 'width:85%')}<span>Fita / adesivo</span></div>
<div class="dark">{img('promotional/stickers/png/frame-tape.png', 'width:80%')}<span>Moldura com fita</span></div>
</div>""")

page("05 · Universo gráfico", "Texturas e padrões", '<div class="elems">' + "".join(
    f'<div class="dark">{img(p, "width:100%;height:100%;object-fit:cover")}<span>{n}</span></div>' for p, n in [
        ("textures/png/brush.png", "Pincelada"), ("textures/png/spray.png", "Spray"), ("textures/png/halftone.png", "Retícula"), ("textures/png/asphalt.png", "Asfalto"),
        ("textures/png/concrete.png", "Concreto"), ("textures/png/paper.png", "Papel"), ("patterns/png/monogram-repeat.png", "Monograma repetido"), ("patterns/png/diagonal-hazard.png", "Faixa diagonal")]) +
    '</div><p class="note">Texturas são camadas de no máximo 10% de opacidade sobre fundos e fotos. Nunca sobre números, texto pequeno ou o centro do HUD.</p>')

page("05 · Universo gráfico", "Direção fotográfica", f"""
<div class="photos">
<div style="background-image:url({A}photography/game/superman-rampa.jpg)"></div>
<div style="background-image:url({A}photography/game/360-pico.jpg)"></div>
<div style="background-image:url({A}photography/game/method-pico.jpg)"></div>
<div class="color" style="background-image:url({A}photography/game/decolagem-pico.jpg)"></div>
</div>
<div class="cols"><div><ul><li><b>Sempre no ar.</b> O momento é o ápice do aéreo ou a decolagem no Lip, nunca o surfista parado.</li><li><b>P&amp;B de alto contraste</b> para peças de marca; cor natural do mar para telas do jogo.</li><li>Ângulos baixos, de dentro da onda, enquadramento cinematográfico e recorte do atleta.</li></ul></div>
<div><ul><li>Fonte: quadros do próprio jogo (<code>brand/tools/photos.cjs</code>) ou fotos com licença registrada em <code>brand/licenses</code>.</li><li>Proibido: fotos de bancos sem licença, atletas reais sem autorização, marcas de terceiros e imagens de jogos concorrentes.</li><li>O oceano nunca vira monocromático dentro do jogo.</li></ul></div></div>""")

page("06 · Voz", "Tom de voz", """
<div class="cols">
<div><h3>Como falamos</h3>
<ul><li><b>Direto.</b> Frases curtas. Verbo na frente.</li><li><b>Técnico sem pose.</b> Termos reais do surfe, explicados quando preciso.</li><li><b>Intenso, não grosseiro.</b> Atitude sem ofender ninguém.</li><li><b>Honesto.</b> Só prometemos o que o jogo faz.</li></ul>
<h3>Idiomas</h3>
<p><b>Inglês</b> nas assinaturas e campanhas internacionais. <b>Português (Brasil)</b> em toda a interface, instruções e textos longos.</p>
<p>Termos técnicos ficam em inglês como na água: <b>Lip</b>, drop, bottom turn, frontside, backside, grab, tail, air reverse, rodeo, alley-oop. Nunca "lábio" ou "borda da onda".</p>
</div>
<div><table class="t"><tr><th>Diga</th><th>Evite</th></tr>
<tr><td>Solte no Lip.</td><td>Pressione o botão de salto no momento adequado.</td></tr>
<tr><td>Pouso limpo!</td><td>Parabéns, você completou a manobra com sucesso!</td></tr>
<tr><td>A onda fechou.</td><td>Game over.</td></tr>
<tr><td>Own the air.</td><td>The best surf game ever!!!</td></tr>
<tr><td>Novo recorde pessoal.</td><td>Você é o melhor surfista do mundo.</td></tr>
<tr><td>Carregue o giro na compressão.</td><td>Faça um giro legal.</td></tr></table></div>
</div>""")

page("06 · Voz", "Slogans", """
<div class="cols">
<div><div class="slogan-main">Air is<br><span>expression.</span></div><p><b>Slogan oficial.</b> Junta o nome do jogo com o que ele tem de único: o aéreo como forma de expressão pessoal. Curto, internacional, funciona como assinatura e como frase de tela de carregamento.</p></div>
<div><h3>Linhas de campanha</h3>
<table class="t"><tr><th>Linha</th><th>Uso</th></tr>
<tr><td>Own the air.</td><td>Lançamento, pôster</td></tr><tr><td>Beyond the lip.</td><td>Site, trailer</td></tr><tr><td>No rules. Just style.</td><td>Redes sociais</td></tr>
<tr><td>Above the lip.</td><td>Adesivo, produto</td></tr><tr><td>Style is everything.</td><td>Campeonatos</td></tr><tr><td>Launch loud. <i>(original)</i></td><td>Trailer, eventos</td></tr>
<tr><td>Write your air. <i>(original)</i></td><td>Personalização</td></tr><tr><td>Every air is a signature. <i>(original)</i></td><td>Replays, compartilhamento</td></tr></table>
<p class="note">Assinatura institucional: <b>UNDERGROUND SURF CULTURE.</b></p></div></div>""")

page("07 · Sistema", "Motion design", """
<div class="three motion">
<div><h3>Entrada de tela</h3><p>Corte diagonal da esquerda para a direita, 420 ms, ease-out (0.2, 0.8, 0.2, 1).</p></div>
<div><h3>Revelação de título</h3><p>Máscara que abre na horizontal com 12 px de deslocamento, 420 ms.</p></div>
<div><h3>Logotipo</h3><p>Desliza e endireita (de -6° para 0°), 700 ms; as faixas /// entram 300 ms depois.</p></div>
<div><h3>Botões</h3><p>Entram em cascata de 40 ms; hover em 120 ms com barra vermelha lateral; pressionado desce 1 px.</p></div>
<div><h3>Pontuação</h3><p>"Soco" de escala 1 → 1,18 → 1 em 450 ms sempre que o total ou o combo mudam.</p></div>
<div><h3>Feedback de manobra</h3><p>Nome do aéreo com sombra de registro vermelha, entra inclinado a -8° e sobe 38 px em 900 ms.</p></div>
<div><h3>Recorde</h3><p>Carimbo que bate: escala 1,6 → 0,96 → 1, rotação -4°, 500 ms.</p></div>
<div><h3>Splash</h3><p>Logotipo vetorial já no HTML (aparece antes do JavaScript), barra de carregamento inclinada a 11°.</p></div>
<div><h3>Movimento reduzido</h3><p>Com <code>prefers-reduced-motion</code>, animações viram 1 ms e os pop-ups só esmaecem. Sem flashes, sem pulsar repetitivo.</p></div>
</div>""")

ds_rows = "".join(f'<tr><td><code>--es-{k}</code></td><td><i class="sq" style="background:{v["value"]}"></i>{v["value"]}</td></tr>' for k, v in list(brand.items()) + list(sup.items())[:4])
page("07 · Sistema", "Design system", f"""
<div class="cols">
<div><h3>Uma fonte, um caminho</h3>
<p><code>brand/design-system/tokens.json</code> é a fonte única. O script <code>build_brand.py</code> gera <code>src/ui/tokens.css</code> (variáveis <code>--es-*</code> e <code>@font-face</code>). <code>src/ui/style.css</code> só lê papéis (<code>--accent</code>, <code>--surface</code>, <code>--font-num</code>...) a partir desses tokens.</p>
<table class="t"><tr><th>Grupo</th><th>Tokens</th></tr><tr><td>Cor</td><td>5 de marca, 8 de apoio, 3 funcionais</td></tr><tr><td>Tipografia</td><td>3 famílias, 9 tamanhos</td></tr><tr><td>Espaço</td><td>4 · 8 · 12 · 16 · 24 · 32 · 48</td></tr><tr><td>Forma</td><td>raio 0–3 px, cortes 8 · 12 · 18 px</td></tr><tr><td>Sombra</td><td>painel, registro (3 px vermelho), elevação</td></tr><tr><td>Movimento</td><td>120 · 200 · 420 ms, ease-out, punch, 11°</td></tr></table></div>
<div><table class="t">{ds_rows}</table></div></div>""")

page("07 · Sistema", "Componentes", f"""
<div style="height:142mm;background:#0A0A0A;display:grid;place-items:center">{img('photography/showcase-components.png', 'max-height:138mm;max-width:100%')}</div>
<p class="note">Botões (primário, secundário, contorno, perigo, pequeno, selecionado, desabilitado, bloqueado), chips, teclas, cards, card de praia, controles deslizantes, abas, tiles, amostras, modal, aviso, ficha técnica, sequência de comandos e total da onda. Galeria viva em <code>brand/showcase/index.html</code>.</p>""")

page("07 · Sistema", "Interface: menu e preparação", f"""
<div class="shots2">{img('photography/ui/01-menu.jpg')}{img('photography/ui/02-setup.jpg')}</div>
<div class="cols"><p><b>Menu.</b> Logotipo vetorial, slogan, perfil do jogador e cinco ações. O preto entra pela esquerda e deixa a onda e a demonstração do surfista à direita.</p>
<p><b>Preparação.</b> Pranchas e quilhas com modificadores; praias em cards com as cores reais de cada pico e os dados do lugar (tipo, altura, potência, vento).</p></div>""")

page("07 · Sistema", "Interface: manobra e HUD", f"""
<div class="shots2">{img('photography/ui/09-challenge.jpg')}{img('photography/ui/11-air.jpg')}</div>
<div class="cols"><p><b>Ficha da manobra.</b> Nome em Anton, trajetória desenhada a partir da altura e rotação de referência, quatro números-chave, sequência de comandos tirada da legenda do jogo (Espaço no Lip → giro → grab → ↓ pouso) e a ficha técnica completa.</p>
<p><b>HUD.</b> Placar no canto superior esquerdo, condições no direito, medidores e legenda nas bordas de baixo. O centro fica livre para a onda e o corpo do surfista.</p></div>""")

page("07 · Sistema", "Interface: resultados e vestiário", f"""
<div class="shots2">{img('photography/ui/12-wave-result.jpg')}{img('photography/ui/13-heat-result.jpg')}</div>
<div class="shots2" style="margin-top:3mm">{img('photography/ui/05-locker.jpg')}{img('photography/ui/04-settings.jpg')}</div>""")

page("08 · Aplicações", "Aplicações digitais", f"""
<div class="apps">
<div class="light">{img('logos/png/es-app-icon.png', 'width:34mm')}<span>Ícone de app (1024, 512, 192, 180)</span></div>
<div class="light"><div class="tabmock">{img('logos/png/sizes/es-icon-32.png', 'width:16px')} EXPRESSION SESSION</div><span>Favicon na aba</span></div>
<div class="wide">{img('promotional/site-hero-1920x1080.jpg', 'width:100%')}<span>Imagem de apresentação do site</span></div>
<div>{img('promotional/store-capsule-920x430.jpg', 'width:100%')}<span>Cápsula para plataformas 920×430</span></div>
<div>{img('promotional/store-library-600x900.jpg', 'height:46mm')}<span>Capa de biblioteca 600×900</span></div>
</div>""")

page("08 · Aplicações", "Redes sociais", f"""
<div class="social">
<div>{img('promotional/social-avatar-1000.jpg', 'width:34mm')}<span>Avatar 1000×1000</span></div>
<div class="wide">{img('promotional/social-cover-1500x500.jpg', 'width:100%')}<span>Capa 1500×500</span></div>
<div>{img('promotional/instagram-post-1080x1350.jpg', 'height:62mm')}<span>Post 1080×1350</span></div>
<div>{img('promotional/instagram-story-1080x1920.jpg', 'height:62mm')}<span>Stories 1080×1920</span></div>
<div class="wide">{img('promotional/youtube-thumb-1280x720.jpg', 'width:100%')}<span>Thumbnail YouTube 1280×720</span></div>
</div>""")

page("08 · Aplicações", "Materiais promocionais", f"""
<div class="promo">
<div class="big">{img('promotional/key-art-1920x1080.jpg', 'width:100%')}<span>Capa oficial / key art</span></div>
<div class="tall">{img('promotional/poster-launch-1600x2400.jpg', 'height:100%')}<span>Pôster de lançamento</span></div>
<div>{img('promotional/banner-1920x600.jpg', 'width:100%')}<span>Banner horizontal</span></div>
<div>{img('promotional/wallpaper-desktop-2560x1440.jpg', 'width:100%')}<span>Wallpaper desktop</span></div>
<div class="phone">{img('promotional/wallpaper-mobile-1170x2532.jpg', 'height:100%')}<span>Wallpaper mobile</span></div>
</div>""")

page("08 · Aplicações", "Roupas e pranchas", f"""
<div style="display:grid;grid-template-columns:1.5fr 1fr;gap:3mm;height:118mm">{img('mockups/apparel/png/tee-lineup.png', 'width:100%;height:100%;object-fit:contain;background:#242424')}{img('mockups/boards/png/board-lineup.png', 'width:100%;height:100%;object-fit:contain;background:#242424')}</div>
<p class="note">Estampas opcionais de prancha (Lip Slash, Underground, Halftone Rebel, Concrete Chevron) e camisetas conceituais. Elas somam às opções de personalização do vestiário: nenhuma arte ou cor existente do jogador foi removida.</p>""")

page("09 · Regras", "Acessibilidade", """
<div class="cols">
<div><ul>
<li><b>Contraste AA</b> em todo texto da interface (tabela na seção Cor). Vermelho pequeno usa Signal Red.</li>
<li><b>Nunca só cor.</b> Positivo leva ✓ ou +, negativo leva ✗ ou −, essencial leva borda. Teclas da sequência diferem por cor e por luminância.</li>
<li><b>Tamanho mínimo</b> de 12,5 px na tela; números do HUD de 15 a 30 px com algarismos tabulares.</li>
<li><b>Foco visível</b> em todos os controles: anel branco interno nos botões cortados, contorno branco nos demais.</li>
<li><b>Áreas de toque</b> de 34 a 62 px de altura.</li>
</ul></div>
<div><ul>
<li><b>Movimento reduzido</b> respeitado (<code>prefers-reduced-motion</code>).</li>
<li><b>Sem flashes.</b> Nenhum efeito pisca mais de 3 vezes por segundo; não há brilho estroboscópico.</li>
<li><b>Textura fora da leitura.</b> O grão (7%) não passa por cima de números nem do HUD.</li>
<li><b>Fontes embutidas</b> com <code>font-display: swap</code>: o texto aparece mesmo antes da fonte carregar.</li>
<li><b>Idioma</b> marcado (<code>lang="pt-BR"</code>) e ícones decorativos com <code>aria-hidden</code>.</li>
</ul></div></div>""")

page("09 · Regras", "Governança e manutenção", """
<div class="cols">
<div><h3>Onde está cada coisa</h3>
<table class="t"><tr><td><code>brand/tools/letters.py</code></td><td>Desenho do lettering</td></tr><tr><td><code>brand/tools/build_brand.py</code></td><td>Logos, ícones, texturas, padrões, adesivos, tokens</td></tr>
<tr><td><code>brand/design-system/tokens.json</code></td><td>Fonte única de cores, tipos e tempos</td></tr><tr><td><code>brand/tools/build_promo.py</code></td><td>Peças promocionais (HTML editável)</td></tr>
<tr><td><code>brand/tools/build_manual.py</code></td><td>Este manual</td></tr><tr><td><code>brand/showcase/index.html</code></td><td>Galeria viva</td></tr><tr><td><code>brand/licenses/</code></td><td>Registro de licenças</td></tr></table></div>
<div><h3>Regras de manutenção</h3>
<ol class="rules"><li>Mudou a marca? Edite o gerador, nunca o arquivo gerado.</li><li>Cor nova só entra pelo <code>tokens.json</code>, com uso e contraste documentados.</li><li>Fonte ou imagem nova só entra com licença registrada em <code>brand/licenses/REGISTRY.md</code>.</li><li>Toda versão do manual ganha número (1.0, 1.1...) e data na capa.</li><li>Revisão a cada lançamento: capturas novas com <code>capture.cjs</code>.</li></ol></div></div>""")

page("", "", f"""
<div class="cover back">
  <div class="cover-slash"></div>
  {img('logos/svg/es-symbol.svg', 'position:absolute;left:50%;top:54mm;width:70mm;margin-left:-35mm')}
  <div class="back-slogan">Air is expression.</div>
  <div class="cover-meta" style="left:0;right:0;text-align:center">EXPRESSION SESSION — UNDERGROUND SURF CULTURE</div>
</div>""", "bleed")


CSS = """
@font-face { font-family: 'Anton'; src: url('../../../src/ui/fonts/anton-latin-400-normal.woff2'); }
@font-face { font-family: 'Barlow'; font-weight: 400; src: url('../../../src/ui/fonts/barlow-latin-400-normal.woff2'); }
@font-face { font-family: 'Barlow'; font-weight: 600; src: url('../../../src/ui/fonts/barlow-latin-600-normal.woff2'); }
@font-face { font-family: 'Barlow'; font-weight: 700; src: url('../../../src/ui/fonts/barlow-latin-700-normal.woff2'); }
@font-face { font-family: 'Barlow Condensed'; font-weight: 700; src: url('../../../src/ui/fonts/barlow-condensed-latin-700-normal.woff2'); }
@font-face { font-family: 'Barlow Condensed'; font-weight: 800; src: url('../../../src/ui/fonts/barlow-condensed-latin-800-normal.woff2'); }
@page { size: 297mm 210mm; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; background: #555; font-family: 'Barlow', sans-serif; color: #0A0A0A; font-size: 10.5pt; line-height: 1.45; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: 297mm; height: 210mm; position: relative; overflow: hidden; background: #fff; padding: 30mm 18mm 16mm; page-break-after: always; break-after: page; margin: 0 auto 6mm; }
@media print { .page { margin: 0; } html, body { background: #fff; } }
.page.bleed { padding: 0; background: #0A0A0A; }
.ph { position: absolute; left: 18mm; right: 18mm; top: 11mm; display: flex; align-items: flex-end; gap: 6mm; border-bottom: 0.4mm solid #0A0A0A; padding-bottom: 2.5mm; }
.ph .sec { font-family: 'Barlow Condensed'; font-weight: 800; letter-spacing: .18em; text-transform: uppercase; font-size: 9pt; color: #E30613; }
.ph h2 { margin: 0; font-family: 'Anton'; font-weight: 400; font-size: 26pt; line-height: 1; text-transform: uppercase; letter-spacing: .01em; }
.ph:after { content: ''; position: absolute; right: 0; bottom: -0.4mm; width: 22mm; height: 1.6mm; background: #E30613; transform: skewX(-11deg); }
.pf { position: absolute; left: 18mm; right: 18mm; bottom: 7mm; display: flex; justify-content: space-between; font-family: 'Barlow Condensed'; font-weight: 700; letter-spacing: .14em; font-size: 7.5pt; color: #808080; text-transform: uppercase; }
h3 { font-family: 'Barlow Condensed'; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; font-size: 12pt; margin: 0 0 2mm; }
p { margin: 0 0 3mm; } ul, ol { margin: 0 0 3mm; padding-left: 5mm; } li { margin-bottom: 1.4mm; }
.big { font-size: 15pt; line-height: 1.35; font-weight: 600; }
.quote { font-family: 'Anton'; font-size: 20pt; line-height: 1.1; text-transform: uppercase; border-left: 2mm solid #E30613; padding-left: 4mm; margin-top: 6mm; }
.note { font-size: 9pt; color: #555; margin-top: 4mm; }
.tag { font-family: 'Barlow Condensed'; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; font-size: 8.5pt; color: #E30613; }
code { font-family: 'Barlow Condensed'; font-weight: 700; font-size: 1em; background: #f0f0f0; padding: 0 1mm; }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 12mm; }
.three { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8mm; }
.panel-img { display: grid; align-content: center; gap: 6mm; }
.panel-img.dark { background: #0A0A0A; padding: 12mm; }
.slogan-xl { font-family: 'Anton'; font-size: 30pt; text-transform: uppercase; color: #E30613; }
.cover { position: absolute; inset: 0; background: #0A0A0A; color: #fff; }
.cover-photo { position: absolute; left: 120mm; top: 0; right: 0; bottom: 0; background-size: cover; background-position: center; filter: grayscale(1) contrast(1.45); }
.cover-shade { position: absolute; inset: 0; background: linear-gradient(90deg, #0A0A0A 42%, rgba(10,10,10,.55) 62%, rgba(10,10,10,0) 85%); }
.cover-slash { position: absolute; left: 200mm; top: -10mm; width: 14mm; height: 240mm; background: #E30613; transform: skewX(-11deg); }
.cover-title { position: absolute; left: 22mm; top: 136mm; font-family: 'Anton'; font-size: 30pt; text-transform: uppercase; letter-spacing: .02em; }
.cover-meta { position: absolute; left: 22mm; bottom: 14mm; font-family: 'Barlow Condensed'; font-weight: 700; letter-spacing: .2em; text-transform: uppercase; font-size: 9pt; color: #B3B3B3; }
.back .cover-slash { left: 40mm; background: #242424; width: 30mm; }
.back-slogan { position: absolute; left: 0; right: 0; top: 140mm; text-align: center; font-family: 'Anton'; font-size: 34pt; text-transform: uppercase; color: #E30613; }
.toc { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7mm 10mm; }
.toc div { border-top: 0.4mm solid #0A0A0A; padding-top: 3mm; }
.toc b { font-family: 'Anton'; font-size: 28pt; color: #E30613; line-height: 1; }
.toc h3 { margin-top: 2mm; } .toc p { font-size: 9pt; color: #555; }
.t { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin: 2mm 0 3mm; }
.t th { text-align: left; font-family: 'Barlow Condensed'; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; font-size: 8.5pt; border-bottom: 0.5mm solid #0A0A0A; padding: 1.5mm 2mm; }
.t td { border-bottom: 0.2mm solid #ddd; padding: 1.6mm 2mm; vertical-align: middle; }
.t.score td:not(:first-child), .t.score th:not(:first-child) { text-align: center; width: 18mm; font-family: 'Barlow Condensed'; font-weight: 800; font-size: 11pt; }
.t.score tr.tot td { border-top: 0.5mm solid #0A0A0A; background: #0A0A0A; color: #fff; }
.t.score tr.tot td:nth-child(2) { background: #E30613; }
.traits { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5mm; margin-bottom: 6mm; }
.traits div { border-left: 1.4mm solid #E30613; padding-left: 3mm; } .traits h3 { font-family: 'Anton'; font-weight: 400; font-size: 17pt; letter-spacing: .01em; }
.scale { position: relative; display: flex; justify-content: space-between; font-family: 'Barlow Condensed'; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; font-size: 9pt; border-bottom: 0.5mm solid #0A0A0A; margin: 0 0 5mm; padding-bottom: 1mm; }
.scale i { position: absolute; bottom: -2.2mm; width: 4mm; height: 4mm; background: #E30613; transform: rotate(45deg); }
.persona { background: #0A0A0A; color: #fff; padding: 7mm; min-height: 80mm; } .persona .tag { color: #FF3B45; }
.two-col { columns: 2; } .rules li { margin-bottom: 3mm; }
.mood { display: grid; grid-template-columns: 2fr 1fr 1fr 1.4fr; grid-template-rows: 62mm 62mm; gap: 3mm; }
.mood > div { background-color: #0A0A0A; background-size: cover; background-position: center; display: grid; place-items: center; overflow: hidden; }
.mood .m1, .mood .m4 { filter: grayscale(1) contrast(1.4); } .mood .m1 { grid-row: span 2; }
.props img { background: #0A0A0A; height: 38mm; object-fit: contain; } .props h3 { margin-top: 3mm; } .props p { font-size: 9pt; }
.construct { position: relative; background: #0A0A0A; padding: 8mm; }
.construct .grid-over { position: absolute; inset: 8mm; background-image: linear-gradient(rgba(227,6,19,.45) 0.25mm, transparent 0.25mm), linear-gradient(90deg, rgba(227,6,19,.25) 0.25mm, transparent 0.25mm); background-size: 100% 22.7%, 4.1% 100%; }
.protect { background: #0A0A0A; padding: 16mm; outline: 0.5mm dashed #E30613; outline-offset: -8mm; margin-bottom: 4mm; }
.mins { display: grid; gap: 5mm; } .mins div { display: flex; align-items: center; gap: 6mm; background: #0A0A0A; padding: 4mm; color: #fff; font-family: 'Barlow Condensed'; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; font-size: 9pt; }
.vars { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; } .vars.four { grid-template-columns: repeat(4, 1fr); }
.vars > div, .elems > div, .apps > div, .social > div, .promo > div { position: relative; height: 44mm; display: grid; place-items: center; padding-bottom: 6mm; overflow: hidden; border: 0.2mm solid #ddd; }
.vars.four > div { height: 64mm; }
.vars span, .elems span, .apps span, .social span, .promo span { position: absolute; left: 3mm; bottom: 2mm; font-family: 'Barlow Condensed'; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; font-size: 8pt; }
.dark { background: #0A0A0A; color: #fff; } .light { background: #fff; } .red { background: #E30613; color: #fff; } .concrete { background: #808080; color: #fff; }
.busy { background: repeating-linear-gradient(45deg, #2a6, #2a6 6mm, #fd3 6mm, #fd3 12mm); }
.wrong span { color: #E30613; } .wrong .dark span { color: #FF3B45; }
.palette { display: flex; height: 100mm; } .palette div { padding: 5mm; display: flex; flex-direction: column; justify-content: flex-end; gap: 0.6mm; font-family: 'Barlow Condensed'; font-weight: 700; letter-spacing: .04em; font-size: 9pt; border: 0.2mm solid #ddd; }
.palette b { font-family: 'Anton'; font-weight: 400; font-size: 14pt; text-transform: uppercase; } .palette small { font-family: 'Barlow'; font-weight: 400; font-size: 7.5pt; margin-top: 1mm; }
.ratio { display: flex; height: 6mm; margin-top: 4mm; border: 0.2mm solid #ccc; }
.pair { display: inline-block; padding: 1mm 3mm; font-weight: 700; border: 0.2mm solid #ccc; }
.contrast td:nth-child(3) { font-family: 'Barlow Condensed'; font-weight: 800; font-size: 10.5pt; }
.vAAA, .vAA { color: #0A0A0A; font-weight: 700; } .vReprovado { color: #E30613; font-weight: 700; }
.contrast td:last-child { font-family: 'Barlow Condensed'; font-weight: 800; letter-spacing: .06em; }
.chips { display: flex; flex-wrap: wrap; gap: 2mm; font-size: 8.5pt; } .chips span { display: flex; gap: 1.5mm; align-items: center; border: 0.2mm solid #ddd; padding: 1mm 2mm; } .chips i { width: 4mm; height: 4mm; border: 0.2mm solid #ccc; }
.type .spec { border-bottom: 0.4mm solid #0A0A0A; margin-bottom: 3mm; padding-bottom: 2mm; }
.hier td:first-child { font-family: 'Barlow Condensed'; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; width: 28mm; }
.hier td:last-child { font-size: 8.5pt; color: #555; width: 70mm; }
.elems { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3mm; } .elems > div { height: 62mm; }
.photos { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3mm; height: 78mm; margin-bottom: 6mm; }
.photos div { background-size: cover; background-position: center; filter: grayscale(1) contrast(1.45); } .photos div.color { filter: none; }
.slogan-main { font-family: 'Anton'; font-size: 58pt; line-height: .95; text-transform: uppercase; margin-bottom: 5mm; } .slogan-main span { color: #E30613; }
.motion { gap: 5mm; } .motion div { border-top: 1.2mm solid #E30613; padding-top: 2mm; }
.sq { display: inline-block; width: 4mm; height: 4mm; vertical-align: -0.6mm; margin-right: 2mm; border: 0.2mm solid #ccc; }
.shots2 { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; margin-bottom: 4mm; } .shots2 img { width: 100%; display: block; border: 0.2mm solid #ccc; }
.apps { display: grid; grid-template-columns: 1fr 1fr 2fr; grid-template-rows: 62mm 62mm; gap: 3mm; }
.apps .wide { grid-row: span 1; } .apps > div { height: auto; }
.tabmock { background: #eee; border: 0.3mm solid #ccc; padding: 2mm 4mm; display: flex; gap: 2mm; align-items: center; font-size: 9pt; font-weight: 700; border-radius: 2mm 2mm 0 0; }
.social { display: grid; grid-template-columns: 1fr 2fr 1fr 1fr; grid-template-rows: 70mm 56mm; gap: 3mm; } .social > div { height: auto; background: #0A0A0A; }
.social .wide:last-child { grid-column: 2 / span 1; }
.promo { display: grid; grid-template-columns: 2fr 1fr 1fr; grid-template-rows: 80mm 50mm; gap: 3mm; } .promo > div { height: auto; background: #0A0A0A; }
.promo .big { grid-column: 1; } .promo .tall { grid-row: span 2; } .promo .phone { grid-row: span 1; }
.promo img, .social img, .apps img { max-width: 100% !important; max-height: 100% !important; object-fit: contain; }
.promo > div, .social > div, .apps > div { padding: 2mm 2mm 7mm; }
.promo span, .social span, .apps span { color: #fff; text-shadow: 0 0 3px #000; } .apps .light span { color: #0A0A0A; text-shadow: none; }
"""


def build():
    pages = []
    n = 0
    for sec, title, body, cls in PAGES:
        n += 1
        head = f'<div class="ph"><div class="sec">{sec}</div><h2>{title}</h2></div>' if title else ""
        foot = f'<div class="pf"><span>EXPRESSION SESSION — Official Brand Guidelines</span><span>{n:02d}</span></div>' if title else ""
        pages.append(f'<section class="page {cls}">{head}{body}{foot}</section>')
    html = f"""<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>EXPRESSION SESSION — OFFICIAL BRAND GUIDELINES</title>
<style>{CSS}</style></head><body>
{''.join(pages)}
</body></html>
"""
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    open(OUT, "w", encoding="utf-8").write(html)
    jobs = [{"type": "pdf", "src": "brand/guidelines/source/brand-guidelines.html", "out": "brand/guidelines/expression-session-brand-guidelines.pdf"}]
    json.dump(jobs, open(os.path.join(ROOT, "brand/tools/jobs-manual.json"), "w"), indent=1)
    print(len(PAGES), "paginas")


if __name__ == "__main__":
    build()
