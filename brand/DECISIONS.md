# Decisões criativas

Registro do porquê de cada escolha, para quem for evoluir a marca.

## Auditoria (antes)

- Jogo em Three.js + TypeScript + Vite, interface em HTML/CSS sobre o canvas,
  sem framework. Estilos já organizados em variáveis CSS (`src/ui/style.css`),
  o que permitiu trocar a identidade sem mexer em lógica.
- Paleta anterior: azul-noite, laranja, ciano, rosa e verde ("pôr do sol no
  mar"). Bonita, mas genérica e sem relação com o nome ou com o aéreo.
- Tipografia do sistema (Segoe UI): cada computador mostrava o jogo diferente.
- Logotipo era texto digitado. Sem símbolo, favicon ou ícone de app.
- Inconsistências: título "SURFE AÉREO" em areia, destaque ora laranja ora
  amarelo (`.warn` usado como destaque e como aviso), botão ciano isolado na
  tela de resultados, emojis ✓/✗ como marcadores, toasts duplicados no CSS,
  roleta com oito cores sem relação entre si.
- Mecânicas, física, comandos, progressão, salvamento e nomenclatura (Lip,
  frontside, backside...) foram preservados. Nenhum arquivo de `core/`, `sim/`,
  `anim/`, `data/` ou `render/` foi alterado.

## Conceito

**Underground Surf Punk**: a atitude do punk e da serigrafia organizada com a
precisão de uma interface esportiva. "Agressiva, mas organizada. Suja na borda,
limpa no centro."

## Logotipo

Três propostas (`logos/proposals`): A Lip Slash, B Air Loop, C Stencil Tape.
Escolhida **A** (29/30 pontos contra 18 e 20), porque:
- o lettering é desenhado do zero (geometria em `letters.py`), não é fonte;
- funciona de 16 px (favicon) a outdoor, e no HUD;
- a inclinação de 11° e as faixas /// dão movimento sem prejudicar a leitura;
- o monograma E/S carrega o corte vermelho do **Lip**, termo central do jogo.
B perde na legibilidade dos Os-anel e na escala; C é a mais punk, mas a fita e
o estêncil não sobrevivem em tamanhos pequenos nem em telas.

## Cor

Paleta pedida (preto, vermelho, branco, cinzas), mais: **Signal Red #FF3B45**
para texto vermelho pequeno (o Rebel Red dá 4,0:1 sobre preto, abaixo do AA),
**Concrete Light #B3B3B3** para texto secundário sobre asfalto e **Amber
#FFB020** só para avisos. "Positivo" virou branco com ✓/+ em vez de verde. O
mar, o céu e a personalização do surfista continuam coloridos.

## Tipografia

Anton (display) + Barlow Condensed (números com tnum, rótulos, botões) +
Barlow (texto). Uma família-mãe (Barlow) em duas larguras mantém a coerência;
Anton dá o impacto de cartaz. Descartadas: Teko (números estreitos em 13 px),
Oswald (pouco agressiva), Archivo Black (larga para o HUD), Inter (neutra).

## Slogan

**AIR IS EXPRESSION.** liga o nome ao diferencial (o aéreo como expressão
pessoal). Linhas de campanha: Own the air, Beyond the lip, No rules. Just
style, Above the lip, e as originais Launch loud, Write your air, Every air is
a signature.

## Interface

- Botões com cantos cortados (clip-path), caixa alta condensada; foco como anel
  interno porque o clip-path corta o `outline`.
- Painéis quase pretos com a marca de registro vermelha no canto.
- `.accent` passou a ser o destaque de marca; `.warn` ficou só para aviso.
- Ficha da manobra ganhou desenho da trajetória (a partir de `height`,
  `rotation`, `direction` de cada manobra), quatro números-chave e a sequência
  de comandos montada a partir da legenda de controles existente.
- Cards de praia usam as cores reais de cada pico (`location.visual`).
- Resultados: total da onda em faixa vermelha, pontuação final em Anton,
  carimbo de recorde pessoal (só quando `rewards.newRecord`).
- Nenhum indicador novo foi inventado: tudo que aparece já existia nos dados.

## Movimento

Entradas diagonais (420 ms), revelação de títulos, "soco" de pontuação quando
o total/combo muda, carimbo de recorde. `prefers-reduced-motion` desliga tudo.
Sem flashes.

## Limitações conhecidas

- Não há telas de loja, campeonato, ranking online ou replay no jogo; a marca
  traz ícones e regras para elas, mas nenhuma tela foi inventada.
- Não há seleção de surfistas (há um só, personalizável no Vestiário); o
  Vestiário recebeu a nova identidade.
- O movimento reduzido segue a preferência do sistema; não foi criada uma opção
  nas configurações para não alterar o formato do salvamento.
- As capturas foram feitas num Chromium sem GPU (render por software). Nele a
  cena 3D fora do menu roda a cerca de 1 quadro por segundo tanto na versão
  antiga quanto na nova; por isso `capture.cjs` avança o tempo sem desenhar.
  A mudança é só de HTML/CSS: a cena 3D, a física e o número de objetos são os
  mesmos de antes.
