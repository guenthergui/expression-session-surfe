# Relatório: remada, drop, velocidade e decolagem

## Como funciona o novo fluxo

1. **Remada**: cada onda começa com o surfista deitado na prancha, remando. A
   tela mostra "Pressione D para entrar na onda". As setas, Z, X e o espaço não
   fazem manobra nenhuma nessa fase.
2. **Drop (D)**: um toque. A prancha desce a face e o corpo se levanta em cerca
   de 0,75 s: as mãos empurram o deck, o peito sobe, as pernas passam por baixo e
   os pés chegam à base. Não há falha no drop, e toques repetidos são ignorados.
3. **Velocidade (W)**: segurar acelera aos poucos até um limite que depende da
   Força, da impulsão da prancha e das quilhas, e da potência da onda. Soltar para
   a aceleração, e a velocidade volta devagar à de cruzeiro. O corpo inclina para
   frente e bombeia a prancha, o spray aumenta e o som do mar fica mais forte. A
   tela mostra a velocidade em km/h.
4. **Decolagem (espaço)**: o surfista sobe e desce a face. A decolagem vale com
   velocidade mínima de 6,3 m/s e perto do lip, até 0,45 s do pico de cada
   subida. No pico a decolagem é Perfect, um pouco antes ou depois é Good ou Late.
   Antes da hora aparece o motivo ("Prepare o drop", "Espere ficar em pé",
   "Ganhe velocidade para realizar o aéreo", "Espere chegar perto do lip"), e
   nada é gasto.
5. **Manobra, pouso e resultado**: continuam como antes, com os mesmos comandos,
   pontuação, combos e progressão. A velocidade na decolagem deixa o aéreo mais
   alto e soma até +5 na chance (componente A, documentado em `docs/design.md`).
6. **Onda fechando**: quem fica lento é alcançado pela quebra. Antes aparece o
   aviso "A onda está fechando! Segure W". Se acontecer, a onda conta como queda
   e a bateria segue normalmente.

## Controles finais

- `D`: drop.
- `W` (segurar): velocidade.
- `Espaço`: decolar.
- Setas: direção e rotação.
- `Z` e `X`: grabs.
- `↓`: pouso.

## Orientação do surfista

O surfista agora fica com o pé direito à frente, de frente para a parede da onda
e de costas para a câmera. Na nomenclatura do surfe, essa base com o pé direito
à frente se chama *goofy*.

A base é definida num lugar só: `STANCE_YAW` e `FRONT_SIDE`, em
`src/game/AerialAnimator.ts`. As poses são escritas num referencial de base
(bico, cima, frente do corpo) e convertidas para a prancha pela função
`stanceToBoard`; não há compensação espalhada pelas animações. O rig ganhou nomes
claros (pé e mão esquerdos e direitos), e o leash passou para o tornozelo de trás
(o esquerdo). Nos giros, corpo e prancha giram livremente. Depois do pouso,
rotações de 180° e 540° completam o giro na água e voltam à base, sem virar de
uma vez.

## "Lip"

O termo novo aparece em todas as mensagens da tela: instruções, ajuda e cartão do
desafio. Também substituí o termo antigo nos comentários de `Ocean.ts`,
`World.ts` e `poses.ts` e em `docs/design.md` e `docs/relatorio-0.2.md`. Mantive
"Lábios (boca)" em `SurferRig.ts`, porque se refere à boca do personagem.

Um teste procura a palavra antiga em todo o `src`.

## Arquivos

Novos:
- `src/sim/waveRun.ts`: máquina de estados da aproximação.
- `docs/relatorio-entrada-na-onda.md`: este relatório.

Modificados:
- `AerialAnimator.ts`: remada, levantar, surf, aceleração, base nova e queda
  quando a onda fecha.
- `aerial.ts`: o voo parte da posição e da velocidade reais da decolagem.
- `App.ts`: teclas D, W e espaço por estado, criação da trilha de comandos na
  decolagem, instruções na tela, piloto automático da demonstração e cenas de
  validação.
- `SurferRig.ts`: lados esquerdo e direito e leash.
- `timing.ts`: decolagem avaliada pela posição no lip.
- `performance.ts` e `heat.ts`: componente A.
- `poses.ts`: poses de drop e aceleração.
- `World.ts`: spray de remada e de drop, rastro proporcional à velocidade.
- `Ocean.ts`: o rastro não satura mais.
- `heatViews.ts`, `screens.ts` e `style.css`: instruções.
- `Lab.ts`: cenas novas de remada e levantar.
- Testes, `README.md` e `docs/design.md`.

## Testes executados

`npm test` passou com 58 de 58 testes, e `npm run build` terminou sem erros. Os
testes novos verificam:
- começa remando e deitado;
- D vale uma vez só e o corpo levanta sem saltos;
- W acelera aos poucos, respeita o limite, para quando solto e não age deitado;
- o espaço antecipado explica o motivo e não gasta a tentativa;
- decolar no pico do lip dá Perfect, e longe do lip é recusado;
- quem fica lento é alcançado pela quebra;
- pé direito mais perto do bico e frente do corpo para -z (costas para a câmera);
- velocidade maior dá um aéreo mais alto;
- não sobra o termo antigo no código.

Também testei no navegador do app, com teclas enviadas por script e os quadros
avançados manualmente, porque a aba estava em segundo plano. Joguei uma bateria
completa de 5 ondas com:
- espaço e setas antes do drop (ignorados);
- D repetido;
- espaço sem velocidade (recusado);
- W segurado e solto;
- decolagem Perfect no lip;
- uma onda sem o comando de pouso (queda);
- uma onda sem W (a onda fechou);
- resultado final e progresso salvo.

As instruções mudaram conforme o estado, sem erros no console nessa sessão.
Vi por captura de tela a remada, o levantar, a base de costas para a câmera e o
HUD com velocidade. Não testei com teclado real, nem com o jogo em primeiro plano
na janela.

## Limitações

- A velocidade de cruzeiro (cerca de 5,7 m/s) fica abaixo da mínima para
  decolar (6,3 m/s), então o W é sempre necessário para decolar.
- Sem W, a onda fecha cerca de 16 s depois do drop.
- A linha na face é automática: o jogador escolhe quando acelerar e quando
  decolar, mas não dirige a prancha para cima ou para baixo.
- O personagem continua procedural, com os mesmos limites visuais de antes.
- O tempo das janelas e a dificuldade de entrar no lip ainda precisam ser
  calibrados com jogadores reais.
