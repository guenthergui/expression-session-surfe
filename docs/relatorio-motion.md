# Relatório — Realismo biomecânico, física e motion do surfista

Data: 30/10/2026. Base: versão com a interface e o vestiário redesenhados (79 testes). Resultado: 127 testes passando, build ok, validação numérica e visual no navegador.

## 1. Diagnóstico inicial

O sistema já era híbrido (poses procedurais + IK de dois ossos + balística), e corpo e prancha já eram entidades separadas. Os problemas encontrados:

**Postura e pés**
- O pé de trás ficava 22 cm à frente do deck pad, longe das quilhas (x = −0,33 m numa prancha de 1,78 m; o pad vai de −0,85 a −0,55 m). As âncoras eram fixas, sem levar em conta o comprimento da prancha.
- Os pés ficavam sempre planos: não acompanhavam o kick da rabeta.
- Os dois joelhos usavam a mesma direção (nada de "joelho de trás para dentro").
- Nada impedia uma pose de pedir mais perna do que o surfista tem: o IK esticava a perna e o pé podia ficar curto.
- A pelve ficava no centro da prancha, não entre os pés.

**Animação**
- Ao terminar de levantar no drop, a pelve girava 86° num único quadro. Era um bug de aliasing do `slerpQuaternions` (origem e destino eram o mesmo objeto), e o mesmo acontecia com os pés.
- Todos os aéreos da mesma família usavam a mesma sequência: o frontside e o backside só trocavam o sinal do giro e da inclinação da prancha.
- Os braços eram posicionados no referencial da prancha, então não acompanhavam a torção do tronco no giro.
- O sentido do giro estava invertido em relação ao comando: com → o peito virava para a esquerda da tela.
- O giro seguia uma curva fixa, sem relação com a posição dos braços e das pernas.
- Os grabs levavam a mão até a borda sem verificar se o braço alcançava.

**Física e onda**
- A linha na face era uma senoide em z absoluto, mas a crista da onda ondula ao longo de x, então "chegar ao Lip" nem sempre era chegar ao Lip.
- A prancha apontava sempre para +x, mesmo subindo ou descendo a face.
- A velocidade não mudava com a altura na face, então a prancha subia e descia "como um elevador".
- A inclinação na curva era um fator arbitrário, e a borda entrava de uma vez no início do bottom turn (31° num quadro).
- A pose do bottom turn colocava o peso nos calcanhares, mas de frente para a onda a curva é feita na borda dos dedos.
- A simulação da linha usava passo variável.

## 2. Melhorias implementadas

**Pés e rig**
- Âncoras calculadas pela prancha (`src/anim/stance.ts`):
  - pé de trás no deck pad, 25 cm da rabeta, em cima das quilhas laterais;
  - base de 52–60 cm;
  - pé da frente perto do centro, aberto 17° para o bico; o de trás quase atravessado.
- Os pés acompanham a inclinação do deck no ponto de apoio (kick da rabeta).
- Os pés passaram a ser restrições fixas: quando a perna não alcança ou dobraria além do limite (~145°), é a pelve que se move, nunca o pé.
- Cada joelho e cada cotovelo tem a sua própria direção. O joelho de trás fecha para dentro.
- A pelve fica entre os pés e se desloca com o peso: bico/rabeta, borda e perna esticada.

**Física na face** (`src/sim/waveRun.ts`)
- A linha é medida a partir da crista real. Com isso existem zonas da face (Lip, parte superior, meio, parte inferior, base), que aparecem na depuração.
- Troca de energia: v² = v₀² + 2·g·η·Δh. Subindo para o Lip o surfista perde até ~10% da velocidade e na base ganha ~10%.
- A prancha aponta para a trajetória real: desce a face no drop e sobe com o bico para o Lip.
- Bottom turn na borda dos dedos, com inclinação de equilíbrio atan(a/g), de até ~40°. A borda entra progressivamente.
- Passo fixo de 1/120 s, então o resultado é o mesmo a 30 ou a 144 FPS.

**Linha e decolagem**
- A linha segue a sequência: bottom turn baixo e com o peso no pé de trás → extensão na subida → compressão rápida (~0,25 s) chegando ao Lip, com os ombros enrolando no sentido contrário ao giro → extensão explosiva.
- A prancha e o corpo saem da água a partir da orientação e da pose que tinham, sem salto.
- A posição e a qualidade da saída continuam definindo a trajetória (`planAerial`). O pouso agora também é medido a partir da crista.

**Aéreos** (`src/anim/choreography.ts`)
- 8 coreografias próprias, escolhidas pelos componentes da manobra:
  - Straight Air: corpo simétrico, olhando a água à frente, sem rotação.
  - Frontside Air: peito aberto para a parede, braço da frente por cima da face, joelhos levados para a onda, prancha mostrando o fundo para a praia.
  - Backside Air: braço de trás varrendo para cima e por cima do Lip, olhar por cima do ombro de trás, rabeta empurrada pela perna de trás, prancha inclinada para os calcanhares.
  - Air Reverse frontside: cabeça e braço da frente puxam o giro pelo ombro da frente.
  - Air Reverse backside: giro "cego", com o ombro de trás liderando.
  - Frontside 360 e Backside 360: abrem o giro com o braço líder, encolhem no meio e abrem os braços no fim para frear e procurar o pouso.
  - Rodeo Flip: no eixo inclinado.
- Giro em cadeia (`src/anim/rotation.ts`): os ombros lideram, o quadril segue por uma mola e a prancha segue o quadril (até 45° e 50° de diferença). A velocidade angular segue ω = L/I: o momento de inércia vem dos braços e das pernas da própria coreografia, então encolhido gira mais rápido (o pico do 360 passa de 400°/s com o corpo fechado).
- A prancha gira em volta do centro de massa combinado (surfista de 75 kg + prancha de 3,2 kg), que fica entre os pés.
- Sentido do giro corrigido: frontside abre o peito para o bico (direita na tela, tecla →); backside lidera com as costas (esquerda, tecla ←).
- Comandos fora do tempo: Late gira 150° e pousa desalinhado, e o surfista corrige na água. Miss não gira e o corpo fica num aéreo neutro, sem forçar a rotação.

**Grabs**
- Cada grab tem um ponto de contato próprio:
  - Indy: mão de trás, borda dos dedos, entre os pés;
  - Mute: mão da frente cruzando, borda dos dedos;
  - Melon: mão da frente, borda dos calcanhares, atrás da perna da frente;
  - Stalefish: mão de trás, borda dos calcanhares, atrás da perna de trás.
- Cada grab também tem uma pose e um ajuste de prancha próprios.
- Alcance resolvido: quando o ombro está longe, o corpo curva a coluna, gira o peito e o quadril, inclina e desce o quadril encolhendo as pernas, sempre dentro dos limites anatômicos, até o braço alcançar sem travar.
- A mão só fecha depois de chegar à borda e solta a tempo do pouso.
- Combinações (Air Reverse Indy, 360 Mute, 540 Melon) inserem o grab dentro do giro.

**Pouso**
- A prancha se alinha com a face nos últimos 0,28 s.
- A absorção nos joelhos é proporcional à velocidade vertical do impacto.
- O pouso instável tem a rabeta escorregando, braços buscando equilíbrio e mais perda de velocidade.
- Na queda (sistema anterior preservado), corpo e prancha se separam e o leash continua preso. Agora a prancha sai da orientação em que estava, sem trocar de repente.

## 3. Arquivos e sistemas

**Criados**
- `src/anim/stance.ts`: medidas do corpo, âncoras, massas, limites das pernas e zonas da face.
- `src/anim/choreography.ts`: coreografias e contatos dos grabs.
- `src/anim/rotation.ts`: curva do giro com inércia e mola de passo fixo.
- `src/dev/MotionDebug.ts`: depuração.
- `tests/motion.test.ts`: 48 testes.

**Modificados**
- `src/anim/poses.ts`: poses com braço da frente e de trás independentes, giro da cabeça, quadril e ajustes da prancha.
- `src/game/AerialAnimator.ts`
- `src/sim/waveRun.ts`
- `src/sim/aerial.ts`
- `src/render/SurferRig.ts`: polos de joelho e cotovelo por lado.
- `src/game/App.ts`: cenas antes de um evento e acesso de depuração.
- `src/dev/Lab.ts`
- `src/ui/style.css`
- `tests/anim.test.ts`

**Preservados**: controles, janelas de tempo, pontuação, atributos, equipamentos, progressão, vestiário e aparência, câmera, spray, leash e queda.

**Assets**: nenhum asset novo. Tudo é gerado por código.

## 4. Testes

- **127 testes automáticos passando** (`npm test`), cobrindo as 13 manobras do catálogo:
  - pés na âncora e no deck (±5 mm) em todos os quadros;
  - pé de trás no pad e em cima das quilhas, inclinado junto com o kick;
  - pernas dentro do alcance e joelhos entre 12° e 146°;
  - sem teletransporte nem giro instantâneo (≤ 15° por quadro a 60 FPS);
  - mesmo resultado a 30 e a 144 FPS;
  - perda e ganho de energia na face;
  - prancha seguindo a trajetória e bottom turn na borda dos dedos (> 20°);
  - ordem ombros → quadril → prancha;
  - sentido frontside/backside;
  - 360 completo e contínuo;
  - inércia;
  - pouso desalinhado com Late;
  - mão na borda certa e com alcance em todos os grabs;
  - compressão e extensão na decolagem e absorção no pouso.
- **Validação no navegador real** (Chromium, rig e prancha 3D de verdade), percorrendo as 13 manobras do início ao fim:
  - distância da sola ao deck entre 0 e 0,2 mm em todos os quadros em pé;
  - joelhos entre 78° e 148°;
  - ombro–borda nos grabs de 43 a 53 cm (o braço tem 57 cm);
  - nenhum erro no console.
  - Essa validação encontrou um erro que os testes não pegavam (método da prancha chamado sem o objeto), e ele foi corrigido.
- **Inspeção visual** por capturas das cenas do laboratório: pés, bottom turn, compressão, Frontside Air, Backside Air, Reverse, 360 frontside e backside, Indy, Stalefish, 360 Mute, pouso limpo e instável.
  - Com base nelas os braços do Frontside Air foram corrigidos (estavam abertos em T).
- **Não testado**: jogar com o teclado real. A validação foi com o piloto automático e resultados forçados.

## 5. Limitações

- O surfista é um rig procedural de peças rígidas, sem malha com skinning. Não há deformação de músculo nem de roupa, e as mãos são simplificadas.
- Não há animações capturadas (mocap). As poses-chave foram escritas à mão a partir da mecânica de cada manobra, então o "estilo" de um surfista profissional ainda depende de animações profissionais.
- A física da água é simplificada:
  - a linha na face é guiada (fase da subida e descida) com troca de energia, e não uma simulação livre;
  - o voo é balístico com o pouso planejado pelos comandos;
  - não há arrasto do ar nem empuxo variável.
- O contato da mão no grab é verificado pelo pulso e pelo alcance. Os dedos fecham, mas não há colisão real entre dedos e borda.
- Nos grabs com a mão atrás das pernas (Stalefish, Melon), o tronco dobra bastante para alcançar. O resultado é plausível, mas é o ponto visual mais fraco.

## 6. Próximos passos de maior impacto

1. Trocar o rig procedural por um modelo GLB com esqueleto e skinning (a interface `SurferAvatar` já está pronta) e usar animações de mocap licenciadas como base das poses-chave.
2. Colisão de mão e prancha por dedo nos grabs, e IK do pé com rotação do tornozelo para mudanças de peso mais visíveis.
3. Linha livre na face, controlada pelo jogador (curvas com ← e →), usando a mesma física de energia e inclinação.
4. Spray e rastro ligados à borda que está na água e à força da curva.
5. Cena de comparação lado a lado (frontside × backside) no laboratório.

## Como inspecionar

Rode `npm run dev` e abra `http://localhost:5180/?lab`. Há 20 cenas numeradas, além das cenas visuais. A caixa "Depuração do movimento" mostra:

- âncoras dos pés (verde) e tornozelos do rig (amarelo);
- centro de massa e trajetória (branco);
- velocidade (azul), aceleração (laranja) e eixo do giro (roxo);
- normal da onda (ciano) e Lip (vermelho);
- um painel com o estado, a zona da face, o giro de ombros, quadril e prancha, a distância de cada pé ao deck medida no rig e o ângulo dos joelhos.
