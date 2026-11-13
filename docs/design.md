# Design e regras: Expression Session 3D

## Unidades e eixos

Um metro por unidade. `x` corre ao longo da crista (o surfista avança em +x),
`y` é para cima e `z` aponta para a praia. A crista fica em z = 0 e a face da
onda olha para +z, onde está a câmera.

As pranchas são descritas em pés e polegadas, como as reais, e convertidas
(`boardMeters`): a Session Standard tem 5'10" × 18 1/2" × 2 1/4", ou
1,78 m × 47 cm × 5,7 cm. O surfista tem 1,78 m.

## Onda (`src/sim/waveField.ts`)

Perfil da crista em função da distância `s` até ela: face curta e íngreme na
frente (mais íngreme com potência), costas longas atrás, um cavado na base.
A onda quebra em sequência: tudo com `x < breakX` já quebrou, fica mais baixo e
vira espuma. A quebra avança a 4,6 + potência/25 m/s. Ondulações de fundo e
picado de vento somam por cima. A seção de decolagem fica mais crítica (mais
perto da quebra) quanto melhor a qualidade da seção.

A malha do oceano usa uma versão tabelada da mesma função (diferença menor que
1 cm, coberta por teste). Por isso o que se vê é a mesma superfície usada nos
pousos.

## Entrada na onda (`src/sim/waveRun.ts`)

Máquina de estados: `paddling` → (D) `dropping` → `riding`, com W acelerando →
(espaço perto do lip) `airborne` → pouso ou queda → resultado da onda. Se o
surfista fica lento, a quebra o alcança (`fallen`, "a onda fechou").

- **Remada**: deitado no alto da face, a 1,6 m/s. Setas, Z, X e espaço não fazem
  nada além de mostrar a instrução. A seção quebrando se aproxima e espera a
  11 m.
- **Drop (D)**: um toque. Em 0,9 s desce a face até a base, ganhando velocidade
  até a de cruzeiro (5 m/s + potência × 0,012), e o corpo se levanta de forma
  contínua em 0,75 s: mãos no deck, peito sobe, pernas passam por baixo, pés na
  base. Toques repetidos são ignorados; não há falha no drop.
- **Velocidade (W)**: segurar acelera aos poucos até o limite
  (8,2 + Força × 0,012 + impulsão do equipamento × 0,08 + potência × 0,008 m/s).
  Solto, volta devagar ao cruzeiro. Não acelera deitado. Em pé, o surfista sobe e
  desce a face numa linha; cada subida chega ao lip.
- **Decolagem (espaço)**: ver "Decolagem, voo e pouso" abaixo. Longe do lip,
  devagar demais ou descendo, aparece uma explicação e nada é gasto.
- **Velocidade conta**: decolar mais rápido sobe mais alto e pousa mais perto do
  lip, e a velocidade entra na nota de execução.

## Base do surfista

Pé direito à frente no sentido do deslocamento, de frente para a parede da onda,
ou seja, de costas para a câmera. Na nomenclatura do surfe, pé direito à frente
é chamado de *goofy*. A base é definida num único lugar (`STANCE_YAW` e
`FRONT_SIDE` em `AerialAnimator.ts`): as poses são descritas num referencial de
base (bico, cima, frente do corpo) e convertidas para a prancha numa função só.
Nos giros o corpo e a prancha giram livremente; depois do pouso, rotações de 180°
e 540° completam o giro na água e voltam à base, sem virar de uma vez.

## Decolagem, voo e pouso (`src/sim/takeoff.ts`, `airPhysics.ts`, `landing.ts`)

> As seções antigas sobre `sim/aerial.ts`, `core/timing.ts` (janelas
> Perfect/Good/Late/Miss) e a "chance de pouso" por sorteio descreviam a versão
> 0.1 e foram removidas: desde o PR #2 o aéreo é físico, não uma sequência de
> comandos com janelas de tempo.

- **Compressão** (segurar `Espaço`): comprime as pernas em 0,3 s. `←`/`→`
  carregam o giro. `↑` deixa a subida mais vertical (80°), `↓` abre a diagonal
  (20°) e, sem nenhum dos dois, a linha fica travada na direção em que estava.
- **Pop** (soltar `Espaço`): precisa estar subindo, a até 0,7 m abaixo do lip e
  com pelo menos 4,6 m/s. A saída vertical soma a subida na face (velocidade ×
  ângulo), as pernas (impulsão, compressão e tempo do pop) e o lip (mais forte
  na zona crítica). Cada aéreo tem uma velocidade e um ângulo de subida
  recomendados na ficha; fora deles, a execução perde nota.
- **Voo**: balístico. `←`/`→` giram (a oposta freia), `↑` faz o flip (só vale
  um toque novo depois do pop), `↓` prepara o pouso, `Z X C V A` são os grabs e
  `S` as extensões.
- **Pouso**: compara alinhamento, flip fechado, grab solto, pés no deck,
  pernas preparadas, local e impacto, com tolerância maior para quem tem mais
  Equilíbrio. Resultado: limpo, concluído, instável ou queda.

## Pontuação (`src/core/scoring.ts`)

```
pontos do aéreo = base × execução × pouso × dificuldade × novidade × sequência × desafio
pontos da onda  = soma dos aéreos × combo (× 0,85 se a onda terminou em queda)
total da bateria = soma das 5 ondas
```

- Só aéreos pontuam. Curvas, cavadas e batidas são o caminho até eles.
- Desafio da onda (o aéreo sorteado pela roleta): ×1,5, uma vez por onda.
- Sair surfando 1 s depois do pouso: +10% no aéreo.
- Sequência: cada aéreo completado depois do primeiro na mesma onda soma 0,15,
  até ×1,6.
- Novidade: 1,5 na primeira vez de um aéreo experimental; repetir rende menos.
- Aéreo ainda não liberado pelo nível vale ×0,6.
- Combo entre ondas: até ×2,5. Queda zera; instável mantém.

## Progressão (`src/core/progression.ts`, `src/core/rewards.ts`)

- XP por onda: pontos/40 + D/2; numa queda, 10 + D/5. Bateria completa dá +40.
- Próximo nível: 100 + 100 × nível. Cada nível dá 4 pontos de habilidade e cada
  bateria dá 1.
- Domínio técnico por família, de 0 a 100, sobe a cada onda.
- Os aéreos, locais, pranchas e quilhas são liberados pelo campo `unlockLevel`
  de cada ficha.

## Salvamento (`src/core/save.ts`)

Chave `expression-session-save-v3` no localStorage, com migração das versões
anteriores (`-v2` e a 2D `-v1`). Cada campo é validado e volta ao padrão se for
inválido. Guarda também as preferências do treino (`prefs.tutorial`,
`prefs.skipTrained`) e os aéreos já treinados (`trained`).

## Treino antes da onda e modo de treino

Fluxo da bateria: condições → roleta → **treino** → onda → resultado.

- A tela de treino mostra local, número da onda, o aéreo sorteado, dificuldade,
  passo a passo com as teclas, quando decolar, bônus que valem, erros comuns e
  dicas. Atrás dela roda uma **demonstração na mesma onda** que o jogador vai
  surfar: o piloto automático (`sim/autopilot.ts`) faz o aéreo passando pelo
  mesmo caminho do teclado (`KeyReplay` em `core/controls.ts`), então só faz o
  que as setas conseguem fazer, e as teclas mostradas no canto são as que
  produziram o movimento. Câmera didática (`CameraRig.teach`) e câmera lenta
  (0,35×) da compressão até logo depois do pouso.
- Os textos vêm de `core/maneuverGuide.ts`, derivados da ficha do aéreo, das
  teclas do jogo e do plano do piloto. Um teste garante que, com as teclas
  mostradas, cada um dos 22 aéreos sai em todos os locais.
- Níveis: **Iniciante** (tudo), **Intermediário** (passos curtos),
  **Experiente** (pula para a ficha do desafio, com o botão "Ver treino").
  Opção de pular o treino de aéreos já treinados.
- Na onda: o desafio fica no topo e ganha ✓ quando é cumprido; o medidor de
  velocidade marca a velocidade recomendada; se o aéreo pousado não foi o
  desafio, uma dica diz o que faltou (`challengeHint`). `H` mostra ou esconde a
  legenda de teclas.
- **Modo de treino** (menu → Treinar aéreos): escolhe um aéreo liberado, vê a
  demonstração e surfa quantas ondas quiser. Usa uma `HeatSession` própria que
  nunca vai para o salvamento: nível, XP, recordes e domínio não mudam.

## Animação e biomecânica (versão 0.2)

- **Poses** (`src/anim/poses.ts`): base, cavada, subida da face, compressão,
  extensão, ar neutro, giro encolhido, grab, preparação do pouso, absorção,
  instável, saída e comemoração. Cada família de manobra tem a sua sequência de
  keyframes; a interpolação tem aceleração e desaceleração (smoothstep) e o teste
  garante que nenhuma pose salta mais que 0,15 em 10 ms.
- **Corpo e prancha**: o giro alvo é do corpo; a prancha segue por uma mola
  criticamente amortecida (cerca de 0,1 s de atraso, no máximo 50°). A diferença
  vira torção do quadril e do tronco, e os pés continuam presos ao deck pela IK.
- **Centro de massa**: no voo, a pelve segue a balística. Ao encolher as
  pernas (giro e grab) a prancha sobe em direção ao corpo, e volta à posição
  antes do pouso.
- **Grab**: a mão só vai à borda certa se o comando foi feito; os dedos fecham
  no fim do movimento. A prancha inclina para a borda segurada.
- **Pouso**: absorção com joelhos e quadril; o instável gira os braços; o limpo
  termina com comemoração. A queda separa corpo e prancha, com o leash segurando
  a prancha a no máximo 1,83 m.

## Personagem

Rig com pelve, coluna, peito, pescoço, cabeça, ombros, braços, antebraços,
punhos, quatro dedos com três falanges, polegar com duas, coxas, canelas,
tornozelos e pés com cinco dedos. Joelhos limitados a cerca de 145° e cotovelos
a cerca de 150°; torção da coluna limitada a ±0,9 rad. As articulações têm
tampas esféricas para não abrir. O cabelo longo e o coque têm mechas com mola
que respondem à aceleração da cabeça e ao vento. Pele e roupa ficam mais
brilhantes molhadas. A bermuda usa material de tecido; as outras roupas, neoprene.

## Água

- Malha deslocada na CPU pelo mesmo campo de altura da física.
- Dois mapas de normais de detalhe (camada base e verniz) andando em direções
  diferentes, para as ondulações pequenas.
- Espuma da crista, da parte quebrada e do vento, mais o rastro deixado pela
  prancha (pontos que se alargam e somem em 2,8 s).
- Spray diferente para cada evento: curva, decolagem, pouso limpo, pouso
  instável, queda, corpo entrando na água e prancha batendo na água.

## Qualidade gráfica

| Nível | Resolução | Sombras | Malha do mar | Partículas | Alcance | Detalhe da água | Rastro | Pós |
|---|---|---|---|---|---|---|---|---|
| Low | 0,85× | não | 70 cm | 350 | 900 m | não | não | não |
| Medium | 1,25× | 1024 | 45 cm | 800 | 1600 m | sim | 40 pontos | não |
| High | 2× | 2048 | 35 cm | 1400 | 2500 m | sim | 80 pontos | não |
| Ultra | 2× | 4096 | 27 cm | 2400 | 4000 m | sim | 140 pontos | bloom suave |

Tempo medido por quadro, na aba em segundo plano do navegador do app
(1280×720, Pico Leste, demonstração do menu): Low 7,8 ms,
Medium 17 ms, High 15,8 ms, Ultra 25,5 ms. É uma medida indicativa, feita num
navegador sem a janela visível; numa aba em primeiro plano os números podem mudar.

## Cenas de validação

Com o servidor de desenvolvimento rodando, abra `http://localhost:5180/?lab`.
Um painel lista 19 cenas (surfista de perto, rosto, mãos, pés, prancha, face da
onda, compressão, decolagem, ascensão, 180°, 360°, grab, descida, pouso limpo,
instável, queda, prancha na água, spray e onda inteira), cada uma congelada no
instante certo e com a câmera apontada para o detalhe, mais botões para comparar
os quatro níveis gráficos. O painel não existe na versão de produção.

## Limitações conhecidas

- **Personagem**: continua procedural, feito de peças rígidas com tampas nas
  juntas, sem malha contínua com skinning. De perto ainda parece um boneco
  estilizado, não uma pessoa real. Rosto simples, sem animação facial.
  Para realismo de verdade é preciso um modelo humano GLB com esqueleto e
  animações (por exemplo de captura de movimento) com licença adequada.
- **Onda**: campo de altura, então não há tubo nem lip fechado por baixo. O
  lip que se projeta é uma lâmina separada. A espuma é cor, rugosidade e
  partículas, não uma simulação de fluido.
- **Física**: trajetória balística planejada, sem colisão real entre prancha e
  água. A queda é animada; só o leash é simulado.
- **Desempenho**: o oceano é recalculado na CPU a cada quadro. Mover esse cálculo
  para um shader de vértices seria a maior otimização restante.
- **Som**: efeitos sintetizados simples e uma música tema.
