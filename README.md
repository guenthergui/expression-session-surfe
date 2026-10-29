# Expression Session - Surfe (3D, versão 0.2)

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
| `W` | Segure para ganhar velocidade; solte para parar de acelerar |
| `Espaço` | Decolagem perto do lip, com velocidade suficiente. Também avança as telas da bateria. |
| `←` `→` | Direção e rotação: `→` frontside, `←` backside |
| `↑` | Jogar o corpo no flip (manobras experimentais) |
| `Z` | Grab com a mão de trás (Indy, Stalefish) |
| `X` | Grab com a mão da frente (Mute, Melon) |
| `↓` | Aterrissagem |
| `Enter` | Começar ou repetir uma bateria nos menus |
| `Esc` | Voltar ao menu |

Em **Configurações** dá para escolher a qualidade gráfica (Low, Medium, High,
Ultra) e a câmera (lateral, com a onda inteira, ou próxima, com o corpo e a prancha).

Para inspecionar animações e modelos sem jogar uma bateria, rode `npm run dev`
e abra http://localhost:5180/?lab (cenas de validação).

Os comandos deslizam pela faixa de baixo. Aperte quando a tecla cruzar a linha
amarela: **Perfect**, **Good**, **Late** ou **Miss**. Comandos com borda branca
são essenciais: um Miss neles é queda.

## Fluxo do jogo

Menu → preparação (prancha, quilhas, local e condições) → 5 ondas
(condições → roleta → desafio → execução → resultado da onda) → resultado da
bateria → evolução dos atributos e personalização.

## Organização do código

```
src/
  data/      dados puros: atributos, pranchas e quilhas (em pés/polegadas → metros),
             locais, manobras e cosméticos
  core/      regras do jogo, sem Three.js (testáveis)
    maneuvers.ts    gera e valida manobras e variações a partir dos componentes
    timing.ts       janelas de tempo Perfect/Good/Late/Miss
    performance.ts  chance de pouso (fórmula documentada no arquivo e em docs/design.md)
    scoring.ts      pontos = base × execução × pouso × dificuldade × novidade × combo
    roulette.ts     sorteio ponderado por nível, atributos e domínio
    heat.ts         a bateria de cinco ondas
    progression.ts  experiência, níveis, domínio técnico e desbloqueios
    rewards.ts      aplica o resultado da bateria ao progresso
    save.ts         salvamento versionado, com validação e migração
  sim/       física simplificada, sem Three.js
    waveField.ts    campo de altura da onda (o mesmo para gráfico e física)
    aerial.ts       trajetória: cavada, voo balístico e saída
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
