# Registro de licenças da marca

| Recurso | Origem | Licença | Onde é usado |
|---|---|---|---|
| Anton 400 | Vernon Adams / The Anton Project Authors, via pacote npm `@fontsource/anton` 5.3.0 (subconjunto latin) | SIL Open Font License 1.1 (`OFL-Anton.txt`) | `src/ui/fonts`, títulos, proposta B do logotipo, carimbos |
| Barlow 400, 500, 600, 700 | Jeremy Tribby, via `@fontsource/barlow` 5.3.0 (latin) | SIL OFL 1.1 (`OFL-Barlow.txt`) | `src/ui/fonts`, texto da interface |
| Barlow Condensed 500, 600, 700, 800 | Jeremy Tribby, via `@fontsource/barlow-condensed` 5.3.0 (latin) | SIL OFL 1.1 (`OFL-Barlow-Condensed.txt`) | `src/ui/fonts`, números, rótulos, botões; assinatura do logotipo convertida em curvas |
| Lettering EXPRESSION SESSION, monograma E/S, faixas ///, ícones, texturas, padrões, adesivos, estampas | Desenho próprio do projeto (`brand/tools/letters.py`, `build_brand.py`) | Propriedade do projeto | Toda a marca |
| Fotografia (`brand/photography/game`) | Quadros renderizados pelo próprio jogo (`brand/tools/photos.cjs`) | Propriedade do projeto | Promocional, manual, showcase |
| Capturas da interface (`brand/photography/ui*`) | Capturas do próprio jogo (`brand/tools/capture.cjs`) | Propriedade do projeto | Manual, showcase |

A OFL permite usar, embutir e redistribuir as fontes com o jogo, inclusive em
produto comercial, desde que as fontes não sejam vendidas sozinhas e o texto
da licença acompanhe os arquivos. O uso dos contornos (texto convertido em
curvas) em logotipos e peças gráficas é permitido.

Ferramentas usadas só para gerar arquivos (não são distribuídas com o jogo):
shapely (BSD-3), fontTools (MIT), Playwright (Apache-2.0).

Nenhuma foto, ilustração, marca ou elemento de terceiros ou de jogos
concorrentes é usado. Ao adicionar um recurso externo, registre aqui origem,
autor, licença e onde ele é usado antes do merge.
