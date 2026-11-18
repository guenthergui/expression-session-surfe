# Motion

Tempos e curvas em `design-system/tokens.json` (`motion`): 120 ms (rápido), 200 ms (base), 420 ms (lento),
`ease-out` cubic-bezier(0.2, 0.8, 0.2, 1), `ease-punch` cubic-bezier(0.3, 1.6, 0.4, 1), eixo -11°.

| Animação | Keyframes (`src/ui/style.css`) | Onde |
|---|---|---|
| Entrada de tela em diagonal | `screen-in` | todas as `.screen` |
| Revelação de título | `title-reveal` | `h1` das telas, nome da manobra, resultado da onda |
| Entrada do logotipo + faixas /// | `logo-in`, `slash-in` | splash e menu |
| Botões em cascata | `btn-in` | menu |
| Cartões e modais | `card-in`, `panel-in`, `fade-in` | fichas, resultados, vestiário, modais |
| Soco de pontuação | `score-bump` | total e combo do HUD (classe `.bump` via `bumpText`), totais |
| Carimbo | `stamp` | recorde pessoal, resultado da onda |
| Feedback de manobra | `pop` | pop-ups (`popup()` em `heatViews.ts`) |
| Splash | logotipo vetorial no `index.html` + barra inclinada | carregamento |

Regras: nada pisca mais de 3 vezes por segundo, sem brilhos estroboscópicos, nada anima em loop na
interface do jogo. `prefers-reduced-motion: reduce` reduz tudo a 1 ms e os pop-ups apenas esmaecem.
Demonstração interativa: `../showcase/index.html#motion`.
