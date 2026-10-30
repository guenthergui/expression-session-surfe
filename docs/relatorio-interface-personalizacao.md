# Relatório: redesign da interface e expansão da personalização

## 1. Interface

**Causa do aspecto pixelado.** Eram três coisas somadas:

- Os cartões centrais (`.center-card`, `.top-card`, trilha e avisos) eram
  centralizados com `transform: translate(-50%)`. Isso deixa o texto em meio
  pixel, e o navegador borra a renderização.
- A fonte era Bahnschrift em caixa alta com espaçamento entre letras, em 11 a
  13 px. Em telas comuns, isso fica serrilhado.
- A cena 3D usava um teto fixo de resolução abaixo da densidade da tela: 0,85×
  no Low e 1,25× no Medium. Isso valia também atrás dos menus.

**Correções.**

- A centralização agora usa `inset` + `margin: auto` e grid, sem transform.
- A fonte passou a ser a do sistema (Segoe UI no Windows, SF no Mac), com
  suavização e escala tipográfica fixa: título, cabeçalho, item, corpo, rótulo.
  Nenhum texto fica abaixo de 12,5 px.
- A resolução da cena agora é proporcional à densidade da tela
  (`renderScale` × `devicePixelRatio`, com teto por qualidade). Nos menus, ela
  sobe para a resolução nativa. A resolução também é recalculada quando a janela
  muda de monitor ou de zoom.
- Os painéis ficaram quase opacos, sem desfoque pesado do fundo. O contraste
  não depende mais da cena.

**Componentes.**

- **Botões:** têm os estados normal, hover, pressionado, selecionado (borda
  ciano e `aria-pressed`), desabilitado e bloqueado (borda tracejada com
  cadeado), além de foco visível pelo teclado.
- **Ícones:** são SVG próprios, desenhados no código (`src/ui/icons.ts`). Os
  emojis da interface foram removidos.
- **Menu principal:** os botões têm ícones e o antigo "Personalização" virou
  **Vestiário**.
- **Menu de pausa (Esc durante a bateria):**
  - Tem as opções Continuar, câmera, som, Como jogar e Sair da bateria (esta
    pede confirmação).
  - O tempo da onda para por completo e a tecla W é solta.

## 2. Personalização

O catálogo fica em `src/data/cosmetics.ts`, com ids estáveis. Cada item muda o
modelo de verdade.

| Categoria | Opções |
|---|---|
| Tom de pele | 12, do porcelana ao ébano, com subtom (frio, quente, neutro, oliva); todos liberados |
| Olhos | 8 cores (íris) |
| Sobrancelhas | 5 geometrias |
| Barba | 6 (sem, por fazer, bigode, cavanhaque, curta, cheia) |
| Cabelo | 12 geometrias: raspado, curto, topete, cacheado, black power, médio, longo, rabo de cavalo, coque, dreads, moicano, careca |
| Cor do cabelo | 10 naturais (inclusive grisalho e branco) e 6 de fantasia |
| Neoprene | completo 3/2, springsuit, long john, short john, springsuit manga longa, ou sem neoprene |
| Roupa avulsa | bermuda curta, média e longa; lycra manga curta e longa, camiseta, regata, sem camisa |
| Estampas | 10 (liso, listras, faixa lateral, blocos, floral, geométrico, camuflado, degradê, xadrez, tie-dye) |
| Cores por zona | principal, estampa e detalhes (barras e painéis), numa paleta de 26 cores |
| Tatuagens | 14 desenhos em 12 regiões (ombros, braços, antebraços, peito, costas, coxas, panturrilhas), com tamanho e rotação |
| Acessórios | leash, colar, relógio, pulseiras, boné |
| Prancha | cor do deck, do fundo, da arte e do bico/rabeta; 8 artes; acabamento brilhante ou fosco |
| Quilhas | cor, bicolor com cor da ponta, resina transparente, acabamento, 3 perfis de contorno |

**Tatuagens na pele.** Cada parte do corpo (quadril, abdômen, peito, coxas,
canelas, braços e antebraços) agora tem uma textura própria. Pele, tatuagens e
roupa são pintadas nela juntas. Assim a tatuagem acompanha a deformação do
membro e nunca flutua. A escala é convertida de metros para pixels em cada
segmento, então o desenho não estica. A roupa é pintada por cima, e só cobre a
tatuagem onde a peça chega. O vestiário avisa quando uma tatuagem fica coberta.

**Roupa por comprimento.** Cada peça declara quanto cobre de cada parte do
corpo. As bermudas, por exemplo, cobrem 35%, 60% ou 90% da coxa. A barra é
pintada na cor de detalhe. As articulações ficam da cor da roupa só onde a peça
chega até elas.

**Função separada da aparência.**

- O catálogo não tem nenhum campo de desempenho.
- A arte, o acabamento e o perfil das quilhas só mudam materiais e o desenho do
  contorno. Medidas, posição, cant e toe-in continuam vindo do equipamento.
- Um teste confirma que a chance da bateria é a mesma com aparências
  diferentes.

## 3. Vestiário

- **Prévia 3D:**
  - O mar e o cenário somem, e um piso neutro aparece. Isso evita que a câmera
    atravesse a onda.
  - Dá para girar arrastando e aproximar com a roda do mouse, as setas ou + e −.
    Há botões Frente, Lado e Costas.
  - A câmera enquadra conforme a categoria: o rosto em Pele e Cabelo, o corpo em
    Roupa e Tatuagens. Em Prancha e Quilhas, o surfista fica congelado no ar,
    para ver o fundo e as quilhas.
  - O personagem fica centralizado na área livre, ao lado do painel. No
    celular, fica acima dele.
- **Edição:**
  - Tudo é feito numa cópia, e o modelo muda na hora.
  - **Salvar** grava. **Cancelar** ou Esc volta ao que estava salvo e pede
    confirmação se houver alterações. **Padrão** restaura o visual inicial.
- **Filtros:**
  - Por categoria (abas) e por situação (todos, equipados, liberados,
    bloqueados).
  - Por estilo ou família de cor dentro de cada grupo (por exemplo, subtom,
    naturais/fantasia, neutras/quentes/frias/especiais, curtos/longos/presos).
- **Itens bloqueados:** aparecem com cadeado e o requisito ("Nível 3",
  "Conquista: Primeiro pouso", "Domínio rotação 30"). A dica explica como
  conseguir.

## 4. Progressão

- **Liberação:** por nível, por conquista (primeira bateria, primeiro pouso, 25
  Perfects, combo x4, 50 ondas, 90% de execução, primeira descoberta) ou por
  domínio de uma família de manobras. O cálculo vem do progresso
  (`src/core/unlocks.ts`).
- **Itens no início:** 69% do catálogo já começa liberado, incluindo todos os
  tons de pele, cores de olhos e cores naturais de cabelo.
- **Avisos:** itens novos aparecem uma única vez na lista de desbloqueios do fim
  da bateria.

## 5. Salvamento

- **Versão nova:** o salvamento passou para a versão 3 (chave
  `expression-session-save-v3`). A versão 2 é lida e convertida automaticamente.
- **O que a migração mantém:** trajes, corte, cor do cabelo, tatuagem,
  acessório, cor e arte da prancha viram os equivalentes novos. O que estava
  equipado continua liberado, mesmo que a regra nova exija um nível maior (por
  exemplo, o bico xadrez). Nível, atributos, domínio, recordes e preferências
  não mudam.
- **Validação:** cada campo da aparência é validado. Item desconhecido, de outra
  categoria ou bloqueado volta ao padrão sem apagar o resto. Tatuagens repetidas
  na mesma região ou em região inexistente são descartadas. Tamanho e rotação
  são limitados.

## 6. Correção encontrada no caminho

Os membros do boneco eram gerados com as faces viradas para dentro (o perfil
do torno ia de cima para baixo). A câmera mostrava o lado de dentro da parte de
trás de cada braço e perna. Isso só ficou visível quando as tatuagens passaram
a ser pintadas na pele. Com as faces corrigidas, a iluminação dos membros
também ficou mais natural.

## 7. Validação

- **Testes:** `npm test` passou com 79 testes em 4 arquivos. Os 19 testes novos
  ficam em `tests/appearance.test.ts` e cobrem:
  - ids únicos e estáveis, e variedade mínima por categoria;
  - itens liberados no início e ordem dos tons de pele;
  - todos os desenhos de tatuagem existem;
  - aparência sem efeito na chance;
  - liberação por nível, conquista e domínio, com o texto do requisito;
  - aviso único de item novo;
  - bloqueio de item não liberado vindo do salvamento;
  - limites e regiões das tatuagens, e cobertura pela roupa;
  - comprimentos das peças;
  - migração da versão 2 sem perda;
  - dados quebrados;
  - nenhum emoji na interface e nenhum botão do vestiário sem ação.
- **Build:** `npm run build` concluiu sem erros.
- **Navegador:** validado em 1366×800 e 390×844 (celular):
  - menu, configurações, vestiário com todas as abas, tatuagens na frente e nas
    costas, troca de roupa, salvar e conferir o `localStorage`, prévia da
    prancha e das quilhas no ar;
  - pausa (o tempo da onda parou) e uma onda completa com drop, W e decolagem
    Perfect usando o visual novo.

## 8. Como executar

```bash
npm install
npm run dev
```

O endereço é http://localhost:5180. O jogo publicado é atualizado pelo GitHub
Actions a cada push na `main`.

## Limitações conhecidas

- As peças são pintadas na pele, sem volume próprio. Uma bermuda não tem tecido
  solto.
- As tatuagens usam tinta escura. Em tons de pele muito escuros elas ficam
  discretas, como na vida real.
- O tom de pele não altera as unhas nem a palma da mão.
