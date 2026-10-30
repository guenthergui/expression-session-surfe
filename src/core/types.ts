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
export type GrabId = 'indy' | 'mute' | 'melon' | 'stalefish';
export type Hand = 'tras' | 'frente';
export type RotationAxis = 'giro' | 'flip';
export type CommandKey = 'SPACE' | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | 'Z' | 'X';
export type ManeuverFamily = 'aereo' | 'rotacao' | 'grab' | 'combo' | 'experimental';

export interface CommandStep {
  phase: Phase;
  key: CommandKey;
  /** Segundos depois da decolagem. */
  time: number;
  /** Se falhar (Miss) num comando essencial, é queda, seja qual for a chance. */
  essential: boolean;
}

/** Componentes que descrevem uma manobra. O motor gera o resto a partir deles. */
export interface ManeuverComponents {
  family: ManeuverFamily;
  direction: Direction;
  rotation: number;
  axis: RotationAxis;
  grab: GrabId | null;
}

export interface ManeuverDef extends ManeuverComponents {
  id: string;
  name: string;
  difficulty: number;
  baseScore: number;
  unlockLevel: number;
  experimental: boolean;
  /** Referência de origem da variação experimental (skate, snowboard). */
  origin?: string;
  recommended: Partial<Attributes>;
  /** Ids das manobras que são variações desta (mais rotação ou grab). */
  variations: string[];
  /** Restrições em texto, mostradas ao jogador. */
  restrictions: string[];
  /** Abaixo desta altura de onda a manobra recebe penalidade nas condições. */
  minWaveHeight?: number;
}

export interface Maneuver extends ManeuverDef {
  /** Pesos dos atributos relevantes, somando 1. */
  weights: Partial<Attributes>;
  /** Peso de cada fase na manobra, somando 1. Usado para equipamentos e condições. */
  phaseWeights: PhaseMods;
  sequence: CommandStep[];
}

export type Judgement = 'perfect' | 'good' | 'late' | 'miss';

export interface StepResult {
  step: CommandStep;
  judgement: Judgement;
}

export type Outcome = 'limpa' | 'concluida' | 'instavel' | 'queda';
