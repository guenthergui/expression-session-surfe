import type { ManeuverDef } from '../core/types';

// Repertório de aéreos. Cada ficha descreve a identidade técnica do aéreo:
// requisitos de aproximação, referência de altura, tempo e rotação, posição do
// corpo, movimento da prancha e o que o pouso exige. O jogo não toca uma
// animação pronta: reconhece o aéreo pelo que o jogador fez no ar
// (core/maneuvers.ts) e a animação sai do estado físico (anim/airPose.ts).
// Curvas, batidas e mudanças de direção são navegação e não estão aqui.

type Base = Omit<ManeuverDef, 'id' | 'name' | 'tier' | 'family' | 'difficulty' | 'baseScore' | 'body' | 'board' | 'landing' | 'howTo'>;

const air = (b: Partial<Base>): Base => ({
  direction: 'nenhuma',
  rotation: 0,
  axis: 'nenhuma',
  grab: null,
  extension: null,
  unlockLevel: 1,
  experimental: false,
  minSpeed: 5.2,
  approach: [40, 90],
  height: 0.7,
  airTime: 0.8,
  spinRate: 0,
  control: 0.25,
  recommended: {},
  ...b,
});

export const MANEUVER_DEFS: ManeuverDef[] = [
  // ---------- Básicos ----------
  {
    ...air({ minSpeed: 5, approach: [45, 90], height: 0.6, airTime: 0.75, control: 0.2, recommended: { impulsao: 25 } }),
    id: 'straight-air', name: 'Straight Air', tier: 'basico', family: 'aereo', difficulty: 12, baseScore: 300,
    body: 'Joelhos encolhidos e simétricos, braços abertos equilibrando, olhar no ponto de pouso.',
    board: 'Sobe pela rabeta e fica sob os pés, nivelada, sem girar.',
    landing: 'Prancha reta na direção do movimento.',
    howTo: 'Suba a face, segure Espaço e solte no lip. Sem giro nem grab.',
  },
  {
    ...air({ direction: 'frontside', axis: 'giro', minSpeed: 5.5, approach: [35, 85], height: 0.7, spinRate: 200, control: 0.3, recommended: { impulsao: 30, equilibrio: 25 } }),
    id: 'fs-air', name: 'Frontside Air', tier: 'basico', family: 'aereo', difficulty: 18, baseScore: 360,
    body: 'Peito abre para o bico, joelhos levados para a onda, braço da frente por cima da face.',
    board: 'Gira entre 40° e 140° para o lado frontside e volta a alinhar antes do toque.',
    landing: 'Realinhar com ↓ antes de tocar a água.',
    howTo: '→ curto no pop ou no ar e ↓ para realinhar antes do pouso.',
  },
  {
    ...air({ direction: 'backside', axis: 'giro', minSpeed: 5.5, approach: [35, 85], height: 0.7, spinRate: 200, control: 0.35, recommended: { impulsao: 30, controleAereo: 30 } }),
    id: 'bs-air', name: 'Backside Air', tier: 'basico', family: 'aereo', difficulty: 22, baseScore: 400,
    body: 'Costas para o lip, olhar por cima do ombro de trás, perna de trás empurrando a rabeta.',
    board: 'Gira entre 40° e 140° para o lado backside e volta a alinhar.',
    landing: 'Realinhar com ↓; o giro cego pede controle.',
    howTo: '← curto no pop ou no ar e ↓ para realinhar.',
  },
  {
    ...air({ minSpeed: 5.5, approach: [35, 90], height: 0.75, airTime: 0.85, control: 0.35, recommended: { controleAereo: 30 } }),
    id: 'grab-air', name: 'Grab Air', tier: 'basico', family: 'grab', difficulty: 22, baseScore: 420, grab: 'mute',
    body: 'A mão da frente cruza o corpo e segura a borda dos dedos entre os pés; o braço de trás sobe.',
    board: 'Puxada contra o corpo, com a borda dos dedos levemente erguida.',
    landing: 'Soltar o grab antes do toque.',
    howTo: 'X no ar, solte antes de pousar.',
  },
  {
    ...air({ minSpeed: 6, approach: [35, 90], height: 0.8, airTime: 0.9, control: 0.4, recommended: { amplitude: 30, controleAereo: 35 } }),
    id: 'indy-air', name: 'Indy Air', tier: 'basico', family: 'grab', difficulty: 28, baseScore: 500, grab: 'indy',
    body: 'A mão de trás segura a borda dos dedos entre os pés; braço da frente equilibra no alto.',
    board: 'Encostada nos joelhos, inclinada mostrando o fundo para a praia.',
    landing: 'Soltar o Indy e estender as pernas antes do toque.',
    howTo: 'Z no ar, solte antes de pousar.',
  },
  {
    ...air({ minSpeed: 6.3, approach: [40, 90], height: 0.95, airTime: 1.0, control: 0.5, recommended: { amplitude: 35, controleAereo: 40, estilo: 30 } }),
    id: 'method-air', name: 'Method Air', tier: 'basico', family: 'grab', difficulty: 36, baseScore: 600, grab: 'method', unlockLevel: 2,
    body: 'Mão da frente na borda dos calcanhares, joelhos dobrados para trás e corpo arqueado.',
    board: 'Puxada para cima e para trás do corpo (tweak), mostrando o fundo.',
    landing: 'O tweak precisa voltar para baixo do corpo antes do toque.',
    howTo: 'C no ar, segure para o tweak e solte cedo.',
  },
  {
    ...air({ minSpeed: 6.3, approach: [40, 90], height: 0.9, airTime: 0.95, control: 0.5, recommended: { amplitude: 35, controleAereo: 35 } }),
    id: 'stalefish-air', name: 'Stalefish Air', tier: 'basico', family: 'grab', difficulty: 38, baseScore: 620, grab: 'stalefish',
    body: 'Mão de trás por trás da perna de trás, na borda dos calcanhares; peito fecha para a rabeta.',
    board: 'Rabeta empurrada para fora pela perna de trás, bico apontando para a onda.',
    landing: 'Soltar e trazer a rabeta de volta para baixo do corpo.',
    howTo: 'V no ar, solte antes de pousar.',
  },

  // ---------- Rotação ----------
  {
    ...air({ rotation: 180, axis: 'giro', minSpeed: 6.3, approach: [45, 90], height: 0.8, airTime: 0.85, spinRate: 320, control: 0.5, recommended: { rotacao: 30, equilibrio: 35 } }),
    id: '180-air', name: '180 Air', tier: 'rotacao', family: 'rotacao', difficulty: 34, baseScore: 580, direction: 'backside',
    body: 'Ombro de trás lidera, olhar por cima dele; braços fechados no meio do giro.',
    board: 'Meia volta backside no eixo vertical; entra de costas e completa na água.',
    landing: 'Entra de costas (fakie) e gira a rabeta na água.',
    howTo: 'Segure ← na compressão ou logo depois do pop; ↓ para fechar.',
  },
  {
    ...air({ direction: 'frontside', rotation: 180, axis: 'giro', minSpeed: 6.5, approach: [55, 90], height: 0.85, airTime: 0.9, spinRate: 350, control: 0.5, recommended: { rotacao: 30, equilibrio: 35 } }),
    id: 'air-reverse', name: 'Air Reverse', tier: 'rotacao', family: 'rotacao', difficulty: 38, baseScore: 650, direction: 'frontside',
    body: 'Cabeça e braço da frente puxam o giro pelo peito; joelhos altos no meio.',
    board: 'Meia volta frontside saindo vertical do lip; o reverse termina na água.',
    landing: 'Entra de costas e gira a rabeta para voltar à frente.',
    howTo: 'Suba vertical, segure → na compressão e no pop; ↓ para fechar.',
  },
  {
    ...air({ rotation: 360, axis: 'giro', minSpeed: 7.2, approach: [62, 90], height: 1.0, airTime: 1.0, spinRate: 450, control: 0.6, recommended: { rotacao: 45, amplitude: 40 } }),
    id: '360-air', name: '360 Air', tier: 'rotacao', family: 'rotacao', difficulty: 55, baseScore: 950, unlockLevel: 2,
    body: 'Decolagem vertical, corpo encolhido no eixo e braços colados para girar rápido.',
    board: 'Volta completa no eixo vertical, prancha plana sob os pés.',
    landing: 'Fechar a volta e chegar de frente.',
    howTo: 'Suba na vertical e segure ← ou → do pop até perto do pouso.',
  },
  {
    ...air({ direction: 'frontside', rotation: 360, axis: 'giro', minSpeed: 7.2, approach: [25, 62], height: 0.95, airTime: 1.0, spinRate: 430, control: 0.6, recommended: { rotacao: 45, amplitude: 40 } }),
    id: 'fs-360', name: 'Frontside 360', tier: 'rotacao', family: 'rotacao', difficulty: 58, baseScore: 1000, direction: 'frontside', unlockLevel: 2,
    body: 'Ombros enrolados na compressão, peito lidera e o quadril segue.',
    board: 'Volta completa frontside saindo em diagonal do lip.',
    landing: 'Fechar a volta de frente, com o corpo já olhando para a água.',
    howTo: 'Diagonal pelo lip, → na compressão e no ar.',
  },
  {
    ...air({ direction: 'backside', rotation: 360, axis: 'giro', minSpeed: 7.4, approach: [40, 62], height: 1.0, airTime: 1.0, spinRate: 430, control: 0.7, recommended: { rotacao: 50, amplitude: 45 } }),
    id: 'bs-360', name: 'Backside 360', tier: 'rotacao', family: 'rotacao', difficulty: 64, baseScore: 1100, direction: 'backside', unlockLevel: 2,
    body: 'Giro cego: costas lideram, braço de trás abre por cima do ombro.',
    board: 'Volta completa backside saindo em diagonal.',
    landing: 'O ponto de pouso só aparece no fim do giro: pede controle.',
    howTo: 'Diagonal pelo lip, ← na compressão e no ar.',
  },
  {
    ...air({ direction: 'backside', rotation: 180, axis: 'giro', minSpeed: 7.0, approach: [10, 40], height: 0.7, airTime: 0.9, spinRate: 350, control: 0.65, recommended: { rotacao: 40, leituraOnda: 40 } }),
    id: 'alley-oop', name: 'Alley-oop', tier: 'rotacao', family: 'rotacao', difficulty: 60, baseScore: 1050, direction: 'backside', unlockLevel: 2,
    body: 'Giro backside contra o sentido da linha, saindo baixo e longo pelo lip.',
    board: 'Gira para trás da direção do movimento, em diagonal aberta.',
    landing: 'Pouso longo na face, absorvendo com a borda dos calcanhares.',
    howTo: 'Linha em diagonal aberta pelo lip e ← no pop.',
  },
  {
    ...air({ rotation: 540, axis: 'giro', minSpeed: 8.4, approach: [55, 90], height: 1.4, airTime: 1.25, spinRate: 520, control: 0.85, recommended: { rotacao: 70, amplitude: 55, controleAereo: 55 } }),
    id: 'full-rotation', name: 'Full Rotation', tier: 'rotacao', family: 'rotacao', difficulty: 82, baseScore: 1650, unlockLevel: 3,
    body: 'Corpo bem fechado o voo inteiro, abrindo só para frear no fim.',
    board: 'Uma volta e meia ou mais (540°+) no eixo vertical.',
    landing: 'Muito tempo de voo e frear o giro com ↓ na hora certa.',
    howTo: 'Muita velocidade, subida vertical e giro segurado com grab para acelerar.',
  },

  // ---------- Avançados ----------
  {
    ...air({ minSpeed: 8.6, approach: [65, 90], height: 1.5, airTime: 1.3, spinRate: 330, control: 0.9, recommended: { amplitude: 65, rotacao: 55, criatividade: 50 } }),
    id: 'backflip', name: 'Backflip', tier: 'avancado', family: 'experimental', difficulty: 86, baseScore: 1800, axis: 'flip', rotation: 360, experimental: true, unlockLevel: 3,
    body: 'Cabeça e ombros jogados para trás logo no pop, joelhos no peito durante a volta.',
    board: 'Gira borda sobre borda com o corpo, de cabeça para baixo no meio do voo.',
    landing: 'Fechar a volta inteira e abrir o corpo antes da água.',
    howTo: 'Muita altura: ↑ logo depois do pop e ↓ para abrir.',
  },
  {
    ...air({ minSpeed: 8.6, approach: [45, 88], height: 1.5, airTime: 1.3, spinRate: 380, control: 0.95, recommended: { amplitude: 60, rotacao: 55, criatividade: 50 } }),
    id: 'rodeo-flip', name: 'Rodeo Flip', tier: 'avancado', family: 'experimental', difficulty: 90, baseScore: 2000, direction: 'backside', axis: 'rodeo', rotation: 360, experimental: true, unlockLevel: 3,
    body: 'Flip para trás com giro backside: eixo inclinado, o corpo passa de lado sobre a prancha.',
    board: 'Gira inclinada, combinando flip e meia volta.',
    landing: 'Pede altura máxima e muito controle para chegar alinhado.',
    howTo: '↑ e ← juntos logo depois do pop; ↓ para abrir.',
  },
  {
    ...air({ minSpeed: 7.4, approach: [45, 90], height: 1.1, airTime: 1.05, control: 0.75, recommended: { controleAereo: 50, criatividade: 45 } }),
    id: 'superwoman', name: 'Superwoman', tier: 'avancado', family: 'experimental', difficulty: 62, baseScore: 1050, extension: 'superwoman', grab: 'mute', experimental: true, unlockLevel: 3,
    body: 'Uma mão segura a borda dos dedos e as pernas saem para o lado, corpo estendido.',
    board: 'Fica presa pela mão, à frente do corpo, enquanto as pernas voltam.',
    landing: 'Trazer os pés de volta ao deck antes do toque.',
    howTo: 'X e depois S; solte o S cedo para os pés voltarem.',
  },
  {
    ...air({ minSpeed: 7.8, approach: [45, 90], height: 1.2, airTime: 1.1, control: 0.85, recommended: { controleAereo: 55, amplitude: 45, criatividade: 45 } }),
    id: 'superman', name: 'Superman', tier: 'avancado', family: 'experimental', difficulty: 72, baseScore: 1300, extension: 'superman', grab: 'indy', experimental: true, unlockLevel: 3,
    body: 'As duas mãos seguram as bordas e as pernas saem para trás: corpo na horizontal.',
    board: 'Segura à frente do corpo pelas duas mãos, sem os pés.',
    landing: 'Puxar a prancha de volta para baixo dos pés antes do toque.',
    howTo: 'Z e X juntos, depois S; solte cedo.',
  },
  {
    ...air({ minSpeed: 7.0, approach: [45, 90], height: 1.0, airTime: 1.0, control: 0.6, recommended: { estilo: 40, controleAereo: 45 } }),
    id: 'christ-air', name: 'Christ Air', tier: 'avancado', family: 'experimental', difficulty: 50, baseScore: 850, extension: 'christ', grab: 'indy', unlockLevel: 2,
    body: 'Segura o Indy com a mão de trás e abre o corpo em cruz: braço livre esticado e pernas longas.',
    board: 'Presa pela mão de trás, afastada do corpo.',
    landing: 'Fechar o corpo e soltar o grab a tempo.',
    howTo: 'Z e depois S, solte os dois antes do pouso.',
  },
  {
    ...air({ minSpeed: 6.3, approach: [40, 90], height: 0.85, airTime: 0.9, control: 0.5, recommended: { controleAereo: 35 } }),
    id: 'tail-grab', name: 'Tail Grab', tier: 'avancado', family: 'grab', difficulty: 34, baseScore: 560, grab: 'tail', unlockLevel: 2,
    body: 'A mão de trás desce pela perna de trás até a rabeta; o peito fecha.',
    board: 'Rabeta puxada para cima, bico apontando para baixo.',
    landing: 'Soltar a rabeta e nivelar o bico antes do toque.',
    howTo: 'A no ar, solte e use ↓ para nivelar.',
  },
  {
    ...air({ minSpeed: 6.6, approach: [40, 90], height: 0.95, airTime: 1.0, control: 0.6, recommended: { controleAereo: 45, estilo: 40 } }),
    id: 'japan-air', name: 'Japan Air', tier: 'avancado', family: 'grab', difficulty: 44, baseScore: 720, grab: 'japan', unlockLevel: 2,
    body: 'Mute segurado e puxado: joelho da frente desce e a prancha vai para trás das costas.',
    board: 'Tweak forte para trás, bico apontando para cima.',
    landing: 'Desfazer o tweak a tempo de a prancha voltar para baixo do corpo.',
    howTo: 'Segure X por mais de meio segundo, solte antes de pousar.',
  },
  {
    ...air({ minSpeed: 6.8, approach: [45, 90], height: 0.9, airTime: 0.95, control: 0.7, recommended: { controleAereo: 45, criatividade: 40 } }),
    id: 'varial-air', name: 'Varial Air', tier: 'avancado', family: 'experimental', difficulty: 48, baseScore: 800, extension: 'varial', unlockLevel: 2,
    body: 'Os pés soltam a prancha e chutam; o corpo fica sem girar sobre ela.',
    board: 'Gira uma volta inteira sob os pés e volta a encaixar.',
    landing: 'Os pés precisam encontrar o deck antes de tocar a água.',
    howTo: 'S sem grab, com tempo de voo para a prancha voltar.',
  },
];
