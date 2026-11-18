# EXPRESSION SESSION — marca

Identidade visual oficial do jogo: conceito **Underground Surf Punk**, slogan
**AIR IS EXPRESSION.**, assinatura **UNDERGROUND SURF CULTURE.**

- Manual completo (PDF, 39 páginas): [`guidelines/expression-session-brand-guidelines.pdf`](guidelines/expression-session-brand-guidelines.pdf)
- Fonte editável do manual: [`guidelines/source/brand-guidelines.html`](guidelines/source/brand-guidelines.html) (gerada por `tools/build_manual.py`)
- Galeria viva (logos, cores, tipos, ícones, componentes reais, HUD, motion, promo): [`showcase/index.html`](showcase/index.html)
  - com `npm run dev`: http://localhost:5180/brand/showcase/ (não entra no build do jogo)
- Decisões criativas: [`DECISIONS.md`](DECISIONS.md) · Licenças: [`licenses/REGISTRY.md`](licenses/REGISTRY.md)

## Uso rápido

| Preciso de... | Use |
|---|---|
| Logo em fundo escuro | `logos/svg/es-logo-primary.svg` |
| Logo em fundo claro | `logos/svg/es-logo-primary-black.svg` |
| Logo pequeno (< 240 px) | `logos/svg/es-logo-wordmark.svg` (sem textura, sem assinatura) |
| Logo numa linha | `logos/svg/es-logo-horizontal.svg` |
| Avatar, selo, adesivo | `logos/svg/es-symbol.svg`, `logos/svg/es-monogram-badge.svg` |
| Ícone de app / favicon | `logos/svg/es-app-icon.svg`, `logos/svg/es-favicon.svg`, `logos/png/sizes/` |
| PNG transparente | mesma pasta em `logos/png/` (2400 px de largura) |
| Cores, fontes, espaçamentos | `design-system/tokens.json` |
| Ícones | `icons/svg/*.svg` (no jogo: `icon('nome')` de `src/ui/icons.ts`) |

**Cores:** Underground Black `#0A0A0A` · Rebel Red `#E30613` · Pure White `#FFFFFF` ·
Concrete Gray `#808080` · Asphalt Gray `#242424`. Texto vermelho pequeno usa
Signal Red `#FF3B45` (contraste AA). Proporção 60/25/10/5.

**Tipos:** Anton (display), Barlow Condensed (números, rótulos, botões), Barlow
(interface). Todas SIL OFL 1.1, embutidas em `src/ui/fonts`.

## Estrutura

```text
brand/
  guidelines/      manual em PDF + fonte HTML
  logos/           svg/, png/ (e png/sizes/), proposals/ (as 3 propostas)
  typography/      README com o sistema tipográfico
  colors/          paleta em JSON e amostras
  icons/           svg/ (38 ícones) e folha de contato
  textures/        grão, papel, asfalto, concreto, spray, pincel, retícula, impacto
  patterns/        faixas de velocidade, chevron Lip, monograma, trajetórias, retícula
  motion/          linguagem de movimento
  photography/     game/ (quadros do jogo), ui/ e ui-mobile/ (capturas da interface)
  promotional/     peças finais (JPG) + src/ (HTML editável) + stickers/
  mockups/         boards/ (estampas de prancha), apparel/ (camisetas)
  design-system/   tokens.json (fonte única)
  showcase/        galeria viva
  licenses/        registro e textos das licenças
  tools/           geradores (Python + Node)
```

## Como regenerar

Os arquivos de `logos/`, `icons/`, `textures/`, `patterns/`, `promotional/`,
`mockups/`, `guidelines/`, `src/ui/tokens.css`, o bloco de ícones de
`src/ui/icons.ts`, o logotipo do `index.html` e os ícones de `public/` são
**gerados**. Edite os scripts, não os arquivos.

Requisitos só para regenerar (o jogo não depende deles): Python 3 com
`shapely`, `fonttools` e `brotli`; Node com Playwright e Chromium.

```bash
pip install shapely fonttools brotli
python3 brand/tools/build_brand.py           # logos, ícones, texturas, tokens.css...
node brand/tools/render.cjs brand/tools/jobs.json          # PNG
npm run dev                                   # em outro terminal
node brand/tools/photos.cjs                   # quadros do jogo para a fotografia
node brand/tools/capture.cjs                  # capturas da interface (desktop)
node brand/tools/capture.cjs brand/photography/ui-mobile 390 844
python3 brand/tools/build_promo.py && node brand/tools/render.cjs brand/tools/jobs-promo.json
python3 brand/tools/build_showcase.py
python3 brand/tools/build_manual.py && node brand/tools/render.cjs brand/tools/jobs-manual.json
```

`capture.cjs` joga uma bateria completa com o piloto automático do próprio
jogo (o mesmo das cenas `?lab`) e avança o tempo sem desenhar entre as fotos,
porque o navegador sem GPU desenha a cena devagar.

## Manutenção

1. Mudou a marca? Edite o gerador, nunca o arquivo gerado.
2. Cor nova só entra pelo `tokens.json`, com uso e contraste documentados.
3. Fonte ou imagem nova só entra com licença em `licenses/REGISTRY.md`.
4. Nova versão do manual: aumente a versão na capa (`build_manual.py`).
5. A cada lançamento, refaça as capturas e o manual.
