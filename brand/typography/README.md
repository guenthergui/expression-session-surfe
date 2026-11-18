# Tipografia

| Papel | Família | Pesos | Arquivos | Uso |
|---|---|---|---|---|
| Display | **Anton** | 400 | `src/ui/fonts/anton-latin-400-normal.woff2` | Títulos de tela, nomes de manobra, campeonatos, publicidade. Sempre caixa alta. |
| Números e rótulos | **Barlow Condensed** | 500, 600, 700, 800 | `src/ui/fonts/barlow-condensed-*.woff2` | Pontuação, cronômetro, combo, velocidade, botões, rótulos. `font-variant-numeric: tabular-nums`. |
| Interface | **Barlow** | 400, 500, 600, 700 | `src/ui/fonts/barlow-latin-*.woff2` | Menus, instruções, diálogos, configurações. |

Licença: SIL Open Font License 1.1 (textos em `../licenses`). Subconjunto latin (cobre português com acentos).

## Hierarquia

| Nível | Fonte | Tamanho | Espaço entre letras |
|---|---|---|---|
| Hero / slogan | Anton 400 | 48–104 px | +1% |
| H1 de tela | Anton 400 | 30–44 px | +1% |
| Nome de manobra | Anton 400 + sombra de registro vermelha | 44–72 px | +1% |
| Pontuação final | Anton 400 | 56–96 px | 0 |
| Placar do HUD | Barlow Condensed 800 | 30 px | +1% |
| Botão | Barlow Condensed 700, caixa alta | 14–21 px | +7% |
| Título de seção | Barlow Condensed 700, caixa alta | 14 px | +16% |
| Corpo | Barlow 500 | 15 px, entrelinha 1,45 | 0 |
| Secundário | Barlow 500 | 13 px | 0 |
| Mínimo em tela | — | 12,5 px | — |

Variáveis: `--es-font-display`, `--es-font-ui`, `--es-font-numeric` e `--es-fs-*` em `src/ui/tokens.css`.
