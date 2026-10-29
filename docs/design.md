# Design e regras: Expression Session 3D, versão 0.1

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
- **Decolagem (espaço)**: aceita com pelo menos 6,3 m/s e a até 0,45 s do pico da
  subida (o lip). No pico é Perfect (±0,1 s + Controle aéreo), até 0,24 s é Good
  e depois Late. Cedo demais, devagar demais ou longe do lip, aparece uma
  explicação e nada é gasto.
- **Velocidade conta**: decolar mais rápido sobe mais alto e pousa mais perto do
  lip, e soma até +5 na chance (componente A).

## Base do surfista

Pé direito à frente no sentido do deslocamento, de frente para a parede da onda,
ou seja, de costas para a câmera. Na nomenclatura do surfe, pé direito à frente
é chamado de *goofy*. A base é definida num único lugar (`STANCE_YAW` e
`FRONT_SIDE` em `AerialAnimator.ts`): as poses são descritas num referencial de
base (bico, cima, frente do corpo) e convertidas para a prancha numa função só.
Nos giros o corpo e a prancha giram livremente; depois do pouso, rotações de 180°
e 540° completam o giro na água e voltam à base, sem virar de uma vez.

## Trajetória (`src/sim/aerial.ts`)

1. **Voo**: balístico com gravidade de 9,81 m/s². O tempo de voo é fixo pela
   sequência de comandos (o pouso tem um tempo-alvo), e a decolagem define o
   ponto de pouso: uma impulsão Perfect pousa perto da crista e por isso sobe
   mais alto no mesmo tempo. Uma impulsão fraca pousa mais baixo, e o voo sai
   mais baixo.
2. **Saída** (1,7 s): desce a face. Rotações de 180 e 540 pousam de costas e
   completam o giro na água.

## Comandos (`src/core/timing.ts`)

| Classe | Janela | Valor |
|---|---|---|
| Perfect | ±(55 ms + 0,45 ms × Controle aéreo) | 1 |
| Good | ±130 ms | 0,75 |
| Late | ±260 ms, cedo ou tarde | 0,4 |
| Miss | tecla errada ou nada | 0 |

Sequência gerada pelos componentes: `Espaço` (decolagem, essencial), ajuste de
direção nos aéreos sem giro, uma seta por meia volta (essencial; no flip
alterna `↑` e a direção), o grab (`Z` ou `X`, opcional) e `↓` (pouso, essencial).

A animação mostra o estado real: a rotação só avança com os comandos de
rotação certos (Late gira 150° em vez de 180°), o grab só acontece se o comando
foi feito, e uma rotação incompleta chega torta à água.

## Chance de pouso (`src/core/performance.ts`)

```
P = clamp(40 + k × (S − D) + E + C + L + A, 5, 97)     k = 0,5 se S ≥ D, 0,7 se S < D
```

| Parte | O que é | Faixa |
|---|---|---|
| S | média ponderada dos atributos relevantes + domínio da família (até +10) − cansaço | 0 a 110 |
| D | dificuldade da manobra | 15 a 92 |
| E | (prancha + quilhas) por fase × peso da fase × 1,5; Wildcard +6 em experimentais | −6 a +9 |
| C | altura (ideal 1,5 m), potência, vento e seção; leitura de onda reduz só a parte negativa | −15 a +12 |
| L | execução: −25 + 60 × qualidade dos comandos | −25 a +35 |
| A | velocidade de aproximação na decolagem (0 no cruzeiro, 1 no máximo) × 5 | 0 a +5 |

A execução é o maior peso (o teste "a execução é o fator principal" garante isso).
A rolagem de 0 a 100 decide o pouso: abaixo de P é pouso; margem menor que 10 é
instável; margem de 25 ou mais com execução de 80% ou mais é limpo. Um Miss
em comando essencial é queda, seja qual for P.

Exemplos com o personagem inicial, mar médio e execução perfeita: Straight Air
cerca de 85%, Air Reverse cerca de 72%, Frontside 360 cerca de 56%, Rodeo Flip
cerca de 37%. Com execução de 50%, essas chances caem cerca de 30 pontos.

## Pontuação (`src/core/scoring.ts`)

```
Pontos = base × execução × pouso × dificuldade × novidade × combo
```

- Execução: 0,6 + 0,6 × qualidade + Estilo/100 × 0,15 (−0,2 sem o grab), de 0,5 a 1,4.
- Pouso: limpo 1,25, concluído 1, instável 0,7, queda 0.
- Dificuldade: 1 + D/100, de 1 a 2.
- Novidade: 1,5 na primeira experimental completada; senão 1/(1 + 0,3 × repetições na bateria), mínimo 0,5.
- Combo: 1 + 0,25 × (combo − 1), até 2,5. Queda zera; instável mantém; limpo com 90% de execução soma 2; o resto soma 1.

## Progressão (`src/core/progression.ts`, `src/core/rewards.ts`)

- XP por onda: pontos/40 + D/2; numa queda, 10 + D/5. Bateria completa dá +40.
- Próximo nível: 100 + 100 × nível. Cada nível dá 4 pontos de habilidade e cada bateria dá 1.
- Domínio técnico por família, de 0 a 100, sobe a cada onda (mais nos pousos).
- Nível 2 libera Air Reverse Indy, os 360 e cosméticos; nível 3 libera o 360 Mute,
  o 540 Melon e a Piscina Lagoa Azul; nível 4 libera mais cosméticos.
- Equipamentos já têm o campo de desbloqueio por nível; nesta versão todos começam liberados.

## Salvamento (`src/core/save.ts`)

Chave `expression-session-save-v2` no localStorage, com `version: 2`. Cada campo
é validado e volta ao padrão se for inválido. O salvamento da versão 2D
(`-v1`) é migrado automaticamente. A tela de configurações permite reiniciar a
progressão, com confirmação.

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
- **Som**: efeitos sintetizados simples, sem música.
