# Auditoria completa — Expression Session (surfe aéreo 3D)

Data: 13/11/2026 · Base auditada: `main` em `980b2f1` (PR #2, "Navegação livre, física de voo e 22 aéreos").

Esta auditoria foi feita **antes de qualquer alteração**. A linha de base foi
medida no mesmo commit. Cada problema traz a classificação pedida
(Crítico, Alto, Médio, Baixo) e diz se é **comprovado** (visto no código, em
teste ou em execução) ou **hipótese** (precisa de validação com GPU real,
teclado real ou um jogador).

---

## 1. Linha de base

| Verificação | Resultado |
|---|---|
| `npx vitest run` | 5 arquivos, **174 testes passando** (1,7 s) |
| `tsc --noEmit` | sem erros |
| `vite build` | gera `dist/` em 0,3 s; um único bundle JS de **867 kB** (243 kB gzip) |
| Repositório | sem `TODO`/`FIXME`; árvore limpa |

Não há testes de interface no navegador; as cenas de validação visual ficam em
`?lab` (só em `npm run dev`).

## 2. Tecnologia

- **Motor gráfico:** Three.js 0.186 (WebGL), sem engine de jogo. Pós-processamento
  próprio (`render/Stage.ts`): MSAA, gradação de cor, bloom no Alto/Ultra.
- **Linguagem e build:** TypeScript 7, Vite 8, Vitest 5. Nenhuma outra dependência
  em tempo de execução.
- **Áudio:** efeitos sintetizados com Web Audio (`audio/Sfx.ts`) e uma música tema
  em MP3 (`public/music/tema.mp3`).
- **Interface:** HTML e CSS sobre o canvas, sem framework (`ui/`).
- **Publicação:** GitHub Pages, workflow a cada push na `main`.
- **Modelos e texturas:** tudo gerado por código (surfista, prancha, cenário,
  texturas em canvas). Não há arquivos GLB, imagens ou animações gravadas.

## 3. Arquitetura

```
data/   fichas puras (22 aéreos, 5 pranchas, 3 quilhas, 3 locais, cosméticos)
core/   regras sem Three.js: reconhecimento, pontuação, roleta, bateria,
        progressão, desbloqueios, salvamento versionado, controles
sim/    física sem Three.js: campo da onda, navegação na face, decolagem,
        voo, pouso, máquina de estados da onda, piloto automático, leash
anim/   poses, coreografia e base do surfista
render/ palco, céu, oceano, nuvens, cenário, prancha, rig do surfista,
        spray, câmera
game/   App (fluxo e estados) e AerialAnimator (animação a partir da física)
ui/     telas, HUD, vestiário
dev/    cenas de validação (?lab)
```

Ponto forte: a separação é real. Regras e física rodam sem Three.js e são
testadas com um **piloto automático que aperta as mesmas teclas do jogador**
(`sim/autopilot.ts`). Esse piloto é o melhor recurso existente para
demonstrações fiéis.

## 4. Sistemas analisados

### 4.1 Onda e oceano
- `sim/waveField.ts`: um único campo de altura serve a física e o gráfico
  (diferença < 1 cm, coberta por teste). A onda quebra em sequência (peel) e a
  zona crítica fica perto da quebra.
- `render/Ocean.ts`: malha atualizada na CPU a cada quadro, densidade pela
  qualidade (70 cm no Low, 27 cm no Ultra), espuma, translucidez, rastro.
- **Não há tubo**: a crista não fecha sobre o surfista (limitação já registrada).

### 4.2 Navegação, decolagem, voo e pouso
- Navegação livre na face (`surfPhysics.ts`): setas apontam o caminho, W bombeia,
  o pocket segura a velocidade, fora da face a velocidade morre (intencional).
- Decolagem (`takeoff.ts`): segurar Espaço comprime; soltar até 0,7 m abaixo do
  lip, subindo e com pelo menos 4,6 m/s, faz o pop. Velocidade, ângulo de subida,
  compressão e tempo do pop definem a altura.
- Voo (`airPhysics.ts`): giro, flip, grabs, extensões, varial e preparação do
  pouso, todos por tecla.
- Pouso (`landing.ts`): alinhamento, flip fechado, grab solto, pés no deck,
  pernas preparadas, local e impacto. Resultado: limpa, concluída, instável ou
  queda.

### 4.3 Surfista, prancha e animação
- Rig gerado por código (`render/SurferRig.ts`) com interface `SurferAvatar`,
  pronto para trocar por um GLB com esqueleto.
- Animação dirigida pela física (`game/AerialAnimator.ts` + `anim/airPose.ts`),
  com interpolação cúbica, pop pela rabeta, corpo com referencial próprio e
  movimento secundário. Teste de continuidade limita a 15° por quadro.
- Queda tem animação própria (`fallFrame`); a onda termina na queda, então não
  existe "recuperação depois da queda" (regra de design, não falha).
- Leash com corda Verlet (`sim/rope.ts`, `render/Leash.ts`). Quilhas visíveis e
  personalizáveis.

### 4.4 Câmera
- `render/CameraRig.ts`: dois modos (Lateral, Próxima), amortecimento
  exponencial, distância cresce com a altura do voo, olha à frente do surfista.
- Câmera orbital no vestiário e enquadramentos fixos no `?lab`.
- Não existe replay.

### 4.5 Pontuação, bateria e progressão
- **Só aéreos pontuam** (regra do projeto). Pontos =
  base × execução × pouso × dificuldade × novidade × sequência × desafio
  (× 0,6 se o aéreo ainda não foi desbloqueado).
- **Bateria de 5 ondas; o total é a soma das 5 ondas** com combo entre ondas
  (até ×2,5) e × 0,85 quando a onda termina em queda.
- Sair surfando 1 s depois do pouso: +10% no aéreo.
- Sequência dentro da onda: cada aéreo completado depois do primeiro soma +0,15
  no multiplicador (até ×1,6).
- XP, níveis, pontos de atributo, domínio por família, desbloqueios de manobras,
  locais, pranchas, quilhas e cosméticos. Salvamento versionado (v3) com
  migração.

### 4.6 Roleta
- **Sorteia um único aéreo por onda** (o "Desafio da onda"), ponderado por
  nível, atributos, domínio e repetição. Cumprir o desafio vale **×1,5**.
- Um giro extra por bateria.

### 4.7 Modos de jogo e fluxo
Só existe **um modo**: a bateria. Fluxo real:

```
Menu → Preparação (prancha, quilhas, local, condições)
     → [5×] Condições da onda → Roleta → Ficha do desafio → Onda → Resultado da onda
     → Resultado da bateria → Evolução / Vestiário
```

Outras telas: Evolução do surfista, Vestiário (aparência completa),
Configurações (qualidade, câmera, som, música), Como jogar, Pausa (Esc).
Demonstração automática ao fundo dos menus.

### 4.8 Manobras e comandos (22 aéreos)

Comandos comuns: `D` drop · setas navegam · `W` bombeia · segurar `Espaço`
comprime, soltar no lip decola · `←`/`→` na compressão carregam o giro.
No ar: `←`/`→` giram · `↑` flip · `↓` prepara o pouso · `Z` Indy · `X` Grab
(segurado vira Japan) · `C` Method · `V` Stalefish · `A` Tail · `S` Varial,
com `Z` Christ, com `X` Superwoman, com `Z`+`X` Superman.

| Nível | Aéreos |
|---|---|
| Básico | Straight Air, Frontside Air, Backside Air, Grab Air, Indy Air, Method Air, Stalefish Air |
| Rotação | 180 Air, Air Reverse, 360 Air, Frontside 360, Backside 360, Alley-oop, Full Rotation |
| Avançado | Backflip, Rodeo Flip, Superwoman, Superman, Christ Air, Tail Grab, Japan Air, Varial Air |

Rotação + grab vira nome composto (ex.: "Air Reverse Indy"). Todos os 22 são
executados de ponta a ponta pelo piloto automático nos testes.

## 5. O que o pedido supõe e o jogo não tem

Registrado para não "corrigir" o que é decisão de design:

| Suposição do pedido | O que existe | Decisão |
|---|---|---|
| Roleta com **três manobras obrigatórias** na mesma onda, com bônus pela ordem | Roleta com **um** desafio por onda (×1,5). Qualquer aéreo extra pontua, com multiplicador de sequência | Preservar a regra real. O treino mostra o desafio sorteado e explica os bônus que existem de verdade |
| Classificação pelas **duas melhores notas** de cinco ondas | Total = **soma das cinco ondas** com combo | Preservar a soma |
| Bottom Turn e Cutback como manobras exigidas | Curvas e batidas são navegação e **não pontuam** (regra do PR #2) | Não criar manobras de curva pontuadas. O treino ensina a curva como parte da aproximação |
| Tubo | Não há tubo | Fica como limitação; exigiria geometria de crista que fecha e novas regras |
| Replay e câmera de replay | Não há | Não criado nesta passada |
| Vários modos de jogo e carreira | Um modo (bateria) com progressão persistente | Preservar; o modo de treino é novo e separado |
| Praias reais | Três locais fictícios (Pico Leste, Ponta da Rampa, Lagoa Azul) | Preservar; nada apresentado como praia real |

## 6. Problemas encontrados

### Críticos
Nenhum problema crítico comprovado: o jogo compila, os testes passam e o fluxo
completo da bateria funciona com o piloto automático.

### Altos
| # | Problema | Situação |
|---|---|---|
| A1 | **Espaço segurado pula telas sem intenção.** `onKey` não ignora a repetição automática do teclado (`e.repeat`). Segurar Espaço em "Condições da onda" gira a roleta e, quando a ficha do desafio aparece, a repetição já dispara "Remar!", pulando a explicação. O mesmo acontece no resultado da onda. | Comprovado no código (`App.onKey`) |
| A2 | **Tecla segurada vaza para dentro da onda.** Na onda, `rideKey` aceita eventos repetidos; se o jogador ainda segura Espaço ao entrar, a repetição registra a tecla de novo depois do `keys.clear()` e o surfista começa comprimindo sem ter apertado. | Comprovado no código (`App.rideKey` + `KeyboardControls.press`) |
| A3 | **Não existe aprendizagem antes da onda.** A ficha do desafio é um bloco de texto técnico (graus, m/s, ângulos). Não mostra o momento de cada tecla nem uma demonstração, e a legenda no HUD lista todas as teclas ao mesmo tempo. Para quem começa, o desafio sorteado é difícil de entender. | Comprovado (telas atuais) |
| A4 | **Durante a onda, pouco retorno sobre o desafio.** O desafio aparece só como texto no rodapé; quando o jogador pousa outro aéreo, nada diz o que faltou para ser o desafio. | Comprovado |

### Médios
| # | Problema | Situação |
|---|---|---|
| M1 | **Documentação desatualizada.** O README e `docs/design.md` descrevem o sistema antigo de comandos com janelas Perfect/Good/Late/Miss, `core/timing.ts` e `sim/aerial.ts`, que não existem mais. A tabela de controles do README está errada (sem `C`, `V`, `A`, `S`; "↑ experimental"; Espaço "decolagem perto do lip" sem compressão). A velocidade mínima citada (6,3 m/s) não é a do código (4,6 m/s). | Comprovado |
| M2 | **A velocidade recomendada do desafio não aparece na onda.** A ficha pede, por exemplo, 26 km/h, mas o medidor de velocidade não marca esse alvo; o jogador decola abaixo e perde nota sem saber. | Comprovado |
| M3 | **Não há modo de praticar uma manobra** sem gastar uma onda da bateria. | Comprovado |
| M4 | **Câmera sem enquadramento didático.** Os dois modos servem ao jogo; para observar corpo, prancha e lip ao mesmo tempo não há opção, só os enquadramentos fixos do `?lab`. | Comprovado |
| M5 | **Custo da malha do oceano na CPU.** A malha inteira é recalculada a cada quadro em JavaScript; no Ultra (27 cm) isso deve pesar em notebooks. | Hipótese: precisa medir FPS em GPU real |
| M6 | **Qualidade padrão "Alta"** (pixel ratio até 2, bloom) em máquina fraca pode ficar abaixo de 60 FPS no primeiro uso. | Hipótese: precisa medir |
| M7 | **Sem tubo.** A transição crista → tubo pedida não tem o que refinar. | Comprovado (limitação conhecida) |

### Baixos
| # | Problema | Situação |
|---|---|---|
| B1 | Bundle único de 867 kB (o Vite avisa acima de 500 kB). Não atrapalha o jogo, só o primeiro carregamento. | Comprovado |
| B2 | Surfista provisório gerado por código: proporções e mãos simplificadas. O rig está pronto para GLB, mas não há modelo. | Comprovado (limitação conhecida) |
| B3 | Não há replay. | Comprovado |
| B4 | Janelas e sensação das teclas nunca foram testadas com teclado real e jogador (registrado nas versões anteriores). | Hipótese |
| B5 | O HUD da onda mostra a legenda inteira de teclas o tempo todo, o que compete com a ação. | Comprovado; o quanto incomoda é hipótese |

## 7. O que dá para fazer com a tecnologia atual

| Melhoria | Viável agora? |
|---|---|
| Tela de treino com demonstração 3D real | **Sim.** O piloto automático faz cada um dos 22 aéreos com as mesmas teclas do jogador; basta mostrar a onda dele com câmera didática, câmera lenta e as teclas que ele aperta a cada instante |
| Catálogo de manobras com a mesma fonte do jogo | **Sim.** Derivar de `data/maneuvers.ts`, `core/controls.ts` e `sim/autopilot.ts` |
| Modo de treino sem afetar a progressão | **Sim.** `HeatSession` é pura; basta não aplicar o resultado no salvamento |
| Indicadores do desafio durante a onda | **Sim** |
| Correção das teclas repetidas | **Sim** |
| Tubo | Exige nova geometria da crista, colisão e regras: projeto à parte |
| Surfista com malha e esqueleto reais | Exige um modelo GLB (asset externo) |
| Reflexos de tela (SSR), GI | Exigem passes extras de render e custo de GPU; fora do escopo seguro |
| Replay | Viável (a simulação é determinística com passo fixo), mas é um sistema novo |

## 8. Plano desta passada

1. Corrigir A1 e A2 (teclas repetidas).
2. Biblioteca de manobras derivada da ficha, dos controles e do piloto (resolve
   a divergência entre tutorial e comandos).
3. Tela de treino antes de cada onda, com demonstração do piloto, câmera
   didática, câmera lenta e teclas no instante exato (A3, M4).
4. Indicadores discretos do desafio na onda, alvo de velocidade e dica quando o
   aéreo pousado não foi o desafio (A4, M2).
5. Modo de treino de manobras, fora da bateria e sem afetar a progressão (M3).
6. Preferência de nível de tutorial (Iniciante, Intermediário, Experiente).
7. Atualizar README e docs (M1).

Itens marcados como hipótese (M5, M6, B4) ficam para validação com o jogo
rodando na máquina do usuário. O tubo, o modelo GLB e o replay ficam como
próximos passos, porque exigem sistemas ou recursos novos.
