# Expression Session - Surfe (3D)

Jogo de surfe aéreo em 3D feito com Three.js, TypeScript e Vite. Roda no
navegador, sem servidor, contas ou assets externos.

## Como rodar

Precisa do Node.js 18 ou mais novo.

```bash
npm install
npm run dev
```

Abra o endereço que aparecer no terminal (normalmente http://localhost:5180).

- `npm test` roda os testes automatizados (lógica, onda e trajetória).
- `npm run build` confere os tipos e gera a versão final em `dist/`.

## Controles

| Tecla | Ação |
|---|---|
| `D` | Drop: sai da remada, levanta e entra na onda (um toque) |
| `↑` `↓` `←` `→` | Na água: para onde ir na face (subir para o lip, descer, seguir a onda, voltar) |
| `W` | Segure para bombear e ganhar velocidade |
| `Espaço` | Segure para comprimir subindo a face; solte perto do lip para decolar. Também confirma as telas da bateria |
| `←` `→` comprimindo | Carregam o giro (backside / frontside) |
| `↑` `↓` comprimindo | Subida mais vertical / mais aberta; sem eles a linha fica travada |
| `←` `→` no ar | Giram; a seta oposta freia |
| `↑` no ar | Flip para trás (com `←` vira rodeo); vale um toque novo depois do pop |
| `↓` no ar | Prepara o pouso: estende as pernas e realinha |
| `Z` `X` `C` `V` `A` | Grabs: Indy, Grab (segurado vira Japan), Method, Stalefish, Tail |
| `S` | Extensão: sozinho Varial; com `Z` Christ; com `X` Superwoman; com `Z`+`X` Superman |
| `H` | Durante a onda: mostra ou esconde a legenda de teclas |
| `R` `L` | Na tela de treino: rever a demonstração e ligar a câmera lenta |
| `Enter` | Confirma a tela (começar bateria, "Estou pronto — Surfar", próxima onda) |
| `Esc` | Pausa durante a bateria; nos menus, volta |
| `←` `→` `↑` `↓` `+` `-` | No vestiário: girar e aproximar a prévia 3D |

Só aéreos pontuam. Curvas, cavadas e batidas são o caminho até eles.

No **Vestiário** dá para mudar tom de pele, olhos, sobrancelhas, barba, corte e
cor do cabelo, roupa (neoprene ou bermuda e lycra/camiseta, com estampa e três
cores por peça), tatuagens em 12 regiões do corpo (com tamanho e rotação),
acessórios, arte e acabamento da prancha e o visual das quilhas. A prévia 3D
gira com o mouse e muda na hora; só **Salvar** grava. A aparência nunca muda
atributos, chance ou física.

Em **Configurações** dá para escolher a qualidade gráfica (Low, Medium, High,
Ultra) e a câmera (lateral, com a onda inteira, ou próxima, com o corpo e a prancha).

Para inspecionar animações e modelos sem jogar uma bateria, rode `npm run dev`
e abra http://localhost:5180/?lab (cenas de validação).

## Fluxo do jogo

Menu → preparação (prancha, quilhas, local e condições) → 5 ondas
(condições → roleta → **treino** → onda → resultado da onda) → resultado da
bateria → evolução dos atributos e personalização.

A roleta sorteia um aéreo por onda (o desafio, que vale ×1,5). Antes de remar,
a **tela de treino** mostra esse aéreo numa demonstração na mesma onda, com
câmera lenta, as teclas no instante exato, o passo a passo, os bônus e os erros
comuns. Em **Configurações** dá para escolher o nível do treino (Iniciante,
Intermediário ou Experiente, que pula direto para a ficha) e pular os aéreos já
treinados.

No menu, **Treinar aéreos** abre o modo de treino: escolha um aéreo liberado e
surfe quantas ondas quiser, sem afetar nível, XP ou recordes.

O total da bateria é a soma das cinco ondas, com combo entre ondas.

## Organização do código

```
src/
  data/      dados puros: atributos, pranchas e quilhas (em pés/polegadas → metros),
             locais, manobras e catálogo de aparência (cosmetics.ts)
  core/      regras do jogo, sem Three.js (testáveis)
    maneuvers.ts    gera e valida manobras e variações a partir dos componentes
    maneuverGuide.ts guia de aprendizagem de cada aéreo (tela de treino), derivado
                    da ficha, das teclas e do piloto automático
    controls.ts     teclas → intenção do surfista (e o caminho inverso para o treino)
    performance.ts  capacidade, cansaço e efeito das condições
    scoring.ts      pontos = base × execução × pouso × dificuldade × novidade × sequência × desafio
    roulette.ts     sorteio ponderado por nível, atributos e domínio
    heat.ts         a bateria de cinco ondas
    progression.ts  experiência, níveis, domínio técnico e desbloqueios
    rewards.ts      aplica o resultado da bateria ao progresso
    save.ts         salvamento versionado, com validação e migração
    unlocks.ts      liberação de itens de aparência por nível, conquista e domínio
  sim/       física simplificada, sem Three.js
    waveField.ts    campo de altura da onda (o mesmo para gráfico e física)
    surfPhysics.ts  navegação na face
    takeoff.ts      compressão e pop
    airPhysics.ts   voo: giro, flip, grabs e extensões
    landing.ts      resultado do pouso
    waveRun.ts      máquina de estados da onda inteira
    autopilot.ts    piloto automático (demonstrações, lab e testes)
    rope.ts         corda do leash (Verlet)
  render/    cena 3D: palco, céu e luz, oceano, prancha, surfista com rig, spray,
             câmera e cenário
  anim/      biblioteca de poses e sequências por família de manobra
  game/      App (fluxo e estados), AerialAnimator (animação a partir da execução)
  dev/       cenas de validação visual (só com ?lab no modo de desenvolvimento)
  audio/     efeitos sonoros sintetizados (Web Audio)
  ui/        telas em HTML e CSS sobre o canvas
tests/       testes com Vitest
docs/        design, fórmulas e limitações
```

O motor de manobras não conhece o modelo 3D. O surfista implementa a interface
`SurferAvatar` (`src/render/SurferRig.ts`), então dá para trocar o modelo
provisório por um GLB com esqueleto sem mexer nas regras.

Mais detalhes em [docs/design.md](docs/design.md) e a origem dos recursos em
[docs/assets.md](docs/assets.md).
