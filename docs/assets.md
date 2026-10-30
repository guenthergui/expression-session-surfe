# Origem dos recursos

Nenhum arquivo de modelo, textura ou som de terceiros é usado nesta versão.
Tudo é gerado por código no próprio projeto:

| Recurso | Como é feito | Arquivo |
|---|---|---|
| Surfista | Rig articulado (tronco, membros, dedos com falanges, dedos dos pés), peças em torno (lathe) com tampas nas juntas, IK de dois ossos com limites, cabelo com mola | `src/render/SurferRig.ts` |
| Leash | Corda simulada (Verlet) desenhada como tubo | `src/sim/rope.ts`, `src/render/Leash.ts` |
| Parafina e normais da água | Desenhadas em canvas | `src/render/textures.ts` |
| Prancha | Malha gerada das medidas reais: outline, rocker, espessura, bordas, quilhas e deck pad | `src/render/BoardModel.ts` |
| Oceano e onda | Malha deslocada pelo campo de altura de `src/sim/waveField.ts` | `src/render/Ocean.ts` |
| Céu | Objeto `Sky` do Three.js (exemplos oficiais, licença MIT) | `src/render/Environment.ts` |
| Pós-processamento | `EffectComposer`, `RenderPass`, `UnrealBloomPass`, `ShaderPass` e `OutputPass` do Three.js (licença MIT); gradação de cor própria | `src/render/Stage.ts` |
| Nuvens | Shader próprio de ruído fractal projetado num plano de nuvens | `src/render/Clouds.ts` |
| Cenário | Morros de ruído fractal com mata instanciada, casas, coqueiros, guarda-sóis, farol e pedras, tudo gerado por código | `src/render/Scenery.ts` |
| Texturas | Pele, neoprene, cabelo, arte da prancha, tatuagens, areia, pedra e concreto desenhados em canvas | `src/render/textures.ts` |
| Sons | Sintetizados com Web Audio (ruído filtrado e osciladores) | `src/audio/Sfx.ts` |

Dependência de execução: [three](https://github.com/mrdoob/three.js) 0.186 (licença MIT).

Para usar um personagem detalhado no futuro, prefira GLB/glTF com licença que
permita uso no projeto (por exemplo CC0) e registre aqui a origem e a licença.
