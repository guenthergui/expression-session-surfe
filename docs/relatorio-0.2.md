# Relatório da versão 0.2 (evolução 3D)

## 1. Diagnóstico

O projeto já era Three.js + TypeScript + Vite, com a lógica (manobras, chance,
pontuação, progressão, salvamento) separada da renderização e 34 testes. Por isso
a versão foi evoluída, sem refazer nada.

Limitações encontradas:
- corpo de peças rígidas, que abriam nas juntas;
- mãos sem dedos e pés simplificados;
- cabelo estático;
- corpo e prancha girando como um bloco;
- leash como linha fixa, sem parafina;
- água só com o detalhe da malha;
- três níveis gráficos e nenhuma cena de teste;
- objetos criados a cada quadro na animação.

Decisões principais:
- Manter o personagem procedural. Não há modelo humano com licença verificada
  no projeto, e não baixei nada de origem duvidosa.
- Criar animação híbrida: biblioteca de poses com keyframes, mais IK e molas.
- Separar o giro do corpo do giro da prancha.

## 2. Implementações

Arquivos novos:
- `src/anim/poses.ts`: poses e sequências por família de manobra.
- `src/sim/rope.ts`: corda do leash com integração Verlet.
- `src/render/Leash.ts`: tubo do leash atualizado no lugar.
- `src/dev/Lab.ts`: cenas de validação.
- `tests/anim.test.ts`: 12 testes novos.

Arquivos modificados:
- `AerialAnimator.ts`: reescrito com poses, atraso entre corpo e prancha,
  prancha puxada ao encolher, tweak, grab com mão fechando e eventos de spray
  novos. Sem alocações no laço principal.
- `SurferRig.ts`: dedos com falanges, polegar, pés com cinco dedos, rosto com
  queixo, maçãs, pálpebras e olhos com íris e pupila, cabelo com mechas em mola,
  tampas nas juntas, limites de joelho, cotovelo e coluna, pele e roupa molhadas,
  bermuda com material de tecido.
- `BoardModel.ts`: parafina com relevo e plug do leash.
- `Ocean.ts`: dois mapas de normais de detalhe, rastro de espuma, plano distante
  corrigido e menos alocações.
- `World.ts`: leash simulado que segura a prancha na queda, spray por evento,
  molhado, rastro.
- `Stage.ts`: Low, Medium, High e Ultra (com bloom suave), alcance de render.
- `CameraRig.ts`: modos lateral e próxima, e afastamento para caber o voo.
- `save.ts`: Ultra e modo de câmera nas preferências.
- `screens.ts`: configurações com os 4 níveis explicados e câmera.
- `App.ts` e `main.ts`: integração e cenas de validação.

Jogabilidade preservada: fluxo de 5 ondas, roleta, comandos, chance, pontuação,
combos, progressão, cosméticos e salvamento.

## 3. Assets

Nenhum asset externo. Tudo é gerado por código; só a biblioteca three (MIT),
incluindo `Sky` e o pós-processamento dos exemplos oficiais.

Continuam simplificados: o corpo inteiro (peças rígidas, sem skinning), o rosto e
a onda (campo de altura).

## 4. Testes

- `npm test`: 46 de 46 aprovados (core, simulação, animação, leash, configurações).
- `npm run build`: concluído sem erros.

Inspeção visual real, no navegador do app (aba em segundo plano, quadros
avançados por script):
- cenas de rosto, mãos, grab, 180°, 360°, queda e onda inteira;
- uma bateria completa de 5 ondas, com pouso, queda e comandos atrasados,
  terminando no resultado com o progresso salvo;
- tela de configurações;
- console sem erros.

Problemas encontrados e corrigidos nessa inspeção:
- mechas de cabelo apontando para cima;
- bolhas musculares;
- polegar solto;
- plano do mar aparecendo através da malha;
- normais de detalhe fortes demais.

Não foi testado com teclado real nem numa aba em primeiro plano.

## 5. Como executar

```bash
npm install
npm run dev
```

O jogo abre em http://localhost:5180. As configurações ficam no menu
Configurações. As cenas de validação ficam em http://localhost:5180/?lab, só em
desenvolvimento.

## 6. Limitações restantes

- O personagem ainda parece um boneco estilizado de perto. Realismo humano
  exige um GLB com malha contínua, skinning e animações (por exemplo de captura
  de movimento) com licença clara.
- Não existe tubo na onda, e a espuma não é simulação de fluido.
- Não há colisão física real; a queda é animada.
- O oceano é calculado na CPU. Tempo indicativo por quadro, medido com a aba em
  segundo plano: Low 7,8 ms, Medium 17 ms, High 15,8 ms, Ultra 25,5 ms.

## 7. Próximos passos

1. Personagem GLB com esqueleto e animações licenciadas, mapeado pela interface
   `SurferAvatar`.
2. Onda no shader de vértices (GPU), liberando a CPU e permitindo malha mais densa.
3. Lip e tubo com malha própria, mais espuma por partículas ligadas à quebra.
4. Teste com jogadores para calibrar as janelas de tempo e a chance.
5. Música e sons gravados com licença.
