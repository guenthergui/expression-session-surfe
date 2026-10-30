// Tipos compartilhados entre dados, lógica, renderização e interface.
// Nada aqui depende do Three.js: o motor de manobras funciona sem a parte visual.

export const ATTRIBUTE_KEYS = [
  'forca',
  'impulsao',
  'amplitude',
  'rotacao',
  'controleAereo',
  'equilibrio',
  'leituraOnda',
  'resistencia',
  'criatividade',
  'estilo',
] as const;

export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];
export type Attributes = Record<AttributeKey, number>;

/** Fases técnicas de um aéreo. Equipamentos e condições pesam em cada uma. */
export type Phase = 'impulsao' | 'rotacao' | 'grab' | 'aterrissagem';
export type PhaseMods = Record<Phase, number>;

/** Fases da animação, mostradas na tela durante a onda. */
export type AirPhase = 'remada' | 'drop' | 'surf' | 'aceleracao' | 'decolagem' | 'subida' | 'manobra' | 'descida' | 'aterrissagem' | 'saida';

export interface BoardDims {
  /** Medidas de referência em pés e polegadas, como nas pranchas reais. */
  lengthFt: number;
  lengthIn: number;
  widthIn: number;
  thicknessIn: number;
}

export type TailShape = 'squash' | 'swallow' | 'round' | 'pin';

export interface Board {
  id: string;
  name: string;
  archetype: string;
  description: string;
  dims: BoardDims;
  tail: TailShape;
  /** Elevação do bico e da rabeta em metros (curva de rocker). */
  noseRocker: number;
  tailRocker: number;
  /** Largura do bico relativa à largura máxima (0 a 1). */
  noseWidth: number;
  mods: PhaseMods;
  unlockLevel: number;
}

export type FinSetup = 'thruster' | 'twin' | 'quad';

export interface Fin {
  id: FinSetup;
  name: string;
  description: string;
  mods: PhaseMods;
  unlockLevel: number;
}

/** Direção do vento em relação à praia. */
export type WindType = 'terral' | 'maral' | 'lateral';

export interface Conditions {
  /** Altura da onda em metros. */
  height: number;
  /** Potência da onda, 0 a 100. */
  power: number;
  windType: WindType;
  /** Velocidade do vento em km/h. */
  windSpeed: number;
  /** Qualidade da seção de decolagem, 0 a 100. */
  sectionQuality: number;
}

export interface LocationVisual {
  /** Elevação do sol em graus e azimute em graus. */
  sunElevation: number;
  sunAzimuth: number;
  turbidity: number;
  rayleigh: number;
  exposure: number;
  deepColor: number;
  shallowColor: number;
  foamTint: number;
  fogColor: number;
  /** Cobertura de nuvens, de 0 (céu limpo) a 1 (encoberto). */
  clouds: number;
  scenery: 'praia' | 'pontal' | 'piscina';
}

export interface Location {
  id: string;
  name: string;
  kind: string;
  description: string;
  unlockLevel: number;
  heightRange: [number, number];
  powerRange: [number, number];
  windTypes: WindType[];
  windSpeedRange: [number, number];
  sectionRange: [number, number];
  /** Quanto a seção varia de uma onda para outra. */
  sectionVariance: number;
  /** Piscinas de ondas não sofrem efeito do vento. */
  windAffects: boolean;
  visual: LocationVisual;
}

export type Direction = 'nenhuma' | 'frontside' | 'backside';
/** Grabs: a mão e a borda definem cada um. Japan é o Mute puxado (tweak). */
export type GrabId = 'indy' | 'mute' | 'method' | 'stalefish' | 'tail' | 'japan';
/** Extensões do corpo no ar. */
export type ExtensionId = 'christ' | 'superman' | 'superwoman' | 'varial';
export type Hand = 'tras' | 'frente';
/** Tipo de rotação: giro no eixo vertical, flip para trás, flip com giro (rodeo). */
export type RotationAxis = 'nenhuma' | 'giro' | 'flip' | 'rodeo';
export type ManeuverFamily = 'aereo' | 'rotacao' | 'grab' | 'combo' | 'experimental';
export type AerialTier = 'basico' | 'rotacao' | 'avancado';

/** Ficha técnica de um aéreo. O jogo reconhece o aéreo pelo que o jogador fez no ar. */
export interface ManeuverDef {
  id: string;
  name: string;
  tier: AerialTier;
  family: ManeuverFamily;
  direction: Direction;
  /** Rotação nominal em graus (giro ou flip). */
  rotation: number;
  axis: RotationAxis;
  grab: GrabId | null;
  extension: ExtensionId | null;
  difficulty: number;
  baseScore: number;
  unlockLevel: number;
  /** Aéreos experimentais rendem descoberta na primeira vez. */
  experimental: boolean;
  /** Velocidade recomendada na decolagem (m/s); abaixo dela a execução perde nota. */
  minSpeed: number;
  /** Ângulo de aproximação recomendado (graus de subida: 90 = vertical). */
  approach: [number, number];
  /** Altura acima do lip (m) e tempo de voo (s) de referência. */
  height: number;
  airTime: number;
  /** Velocidade de rotação de referência (graus/s); 0 sem rotação. */
  spinRate: number;
  /** Exigência de controle, de 0 a 1. */
  control: number;
  /** Posição corporal, movimento da prancha e condição de pouso, em texto. */
  body: string;
  board: string;
  landing: string;
  /** Como fazer, em teclas. */
  howTo: string;
  recommended: Partial<Attributes>;
}

export interface Maneuver extends ManeuverDef {
  /** Pesos dos atributos relevantes, somando 1. */
  weights: Partial<Attributes>;
  /** Peso de cada fase na manobra, somando 1. Usado para equipamentos. */
  phaseWeights: PhaseMods;
}

export type Outcome = 'limpa' | 'concluida' | 'instavel' | 'queda';
