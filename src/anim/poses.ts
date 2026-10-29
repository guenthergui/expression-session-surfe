import type { ManeuverFamily } from '../core/types';

// Biblioteca de poses do surfista e sequências por família de manobra.
// Uma pose é um conjunto de parâmetros corporais independentes do modelo 3D;
// o animador interpola entre elas com aceleração e desaceleração suaves, e o
// rig converte o resultado em juntas por cinemática inversa.

export interface BodyParams {
  /** 0 em pé, 1 agachado. */
  crouch: number;
  /** 0 pernas soltas, 1 joelhos no peito (no ar). */
  tuck: number;
  /** Peso para o bico (+) ou para a rabeta (−), −1 a 1. */
  lean: number;
  /** Peso para a borda dos dedos (+) ou dos calcanhares (−), −1 a 1. */
  side: number;
  /** Torção do tronco em relação ao quadril, em radianos. */
  twist: number;
  /** Braços abaixo (−1) ou acima (+1) da linha dos ombros. */
  armsUp: number;
  /** Braços junto ao corpo (0) ou abertos para equilíbrio (1). */
  spread: number;
  /** Cabeça olhando para baixo (+) ou para cima (−). */
  headPitch: number;
  /** Mãos abertas (0) ou fechadas (1). */
  grip: number;
}

export const POSES = {
  /** Remada e posição base surfando. */
  base: { crouch: 0.45, tuck: 0, lean: 0, side: 0, twist: 0, armsUp: -0.2, spread: 0.4, headPitch: 0.1, grip: 0.2 },
  /** Drop: descendo a face logo depois de levantar, base baixa e braços abertos. */
  drop: { crouch: 0.82, tuck: 0, lean: 0.15, side: 0.1, twist: 0, armsUp: 0.1, spread: 0.75, headPitch: 0.2, grip: 0.2 },
  /** Acelerando (W): peso à frente, joelhos trabalhando e braços impulsionando. */
  acelerando: { crouch: 0.62, tuck: 0, lean: 0.25, side: 0.05, twist: 0.12, armsUp: -0.05, spread: 0.6, headPitch: -0.05, grip: 0.3 },
  /** Cavada: peso baixo e na borda dos calcanhares para subir a face. */
  cavada: { crouch: 0.78, tuck: 0, lean: -0.15, side: -0.7, twist: -0.15, armsUp: -0.1, spread: 0.55, headPitch: -0.15, grip: 0.2 },
  /** Subindo a face, abrindo o corpo para a crista. */
  subidaFace: { crouch: 0.5, tuck: 0, lean: 0.05, side: -0.2, twist: 0.05, armsUp: 0, spread: 0.45, headPitch: -0.2, grip: 0.2 },
  /** Compressão antes da decolagem. */
  compressao: { crouch: 0.95, tuck: 0, lean: -0.25, side: 0.1, twist: -0.35, armsUp: -0.35, spread: 0.3, headPitch: -0.1, grip: 0.3 },
  /** Extensão explosiva na saída do lip. */
  extensao: { crouch: 0.08, tuck: 0, lean: -0.1, side: 0, twist: 0.1, armsUp: 0.45, spread: 0.6, headPitch: -0.25, grip: 0.1 },
  /** Posição neutra no ar, com as pernas soltas. */
  arNeutro: { crouch: 0.25, tuck: 0.45, lean: 0, side: 0, twist: 0, armsUp: 0.3, spread: 0.85, headPitch: 0.15, grip: 0.2 },
  /** Encolhido para girar mais rápido (braços perto do corpo). */
  arGiro: { crouch: 0.2, tuck: 0.92, lean: 0, side: 0, twist: 0, armsUp: 0.15, spread: 0.35, headPitch: 0.25, grip: 0.4 },
  /** Grab: joelhos no peito e tronco por cima da prancha. */
  arGrab: { crouch: 0.2, tuck: 1, lean: 0, side: 0.1, twist: 0, armsUp: 0.25, spread: 0.5, headPitch: 0.35, grip: 1 },
  /** Estica as pernas e olha para o ponto de pouso. */
  preparaPouso: { crouch: 0.3, tuck: 0.1, lean: -0.05, side: 0, twist: 0, armsUp: 0.15, spread: 0.75, headPitch: 0.45, grip: 0.2 },
  /** Absorção do impacto com joelhos e quadril. */
  absorcao: { crouch: 0.98, tuck: 0, lean: -0.1, side: 0.2, twist: 0, armsUp: 0.05, spread: 0.6, headPitch: 0.2, grip: 0.2 },
  /** Pouso instável: braços buscando equilíbrio. */
  instavel: { crouch: 0.9, tuck: 0, lean: -0.35, side: 0.5, twist: 0.3, armsUp: 0.6, spread: 1, headPitch: 0.1, grip: 0.1 },
  /** Saída tranquila depois do pouso. */
  saida: { crouch: 0.5, tuck: 0, lean: 0.05, side: 0.3, twist: 0, armsUp: -0.1, spread: 0.45, headPitch: 0, grip: 0.2 },
  /** Comemoração depois de um pouso limpo (claim). */
  comemoracao: { crouch: 0.35, tuck: 0, lean: 0, side: 0.15, twist: -0.2, armsUp: 0.95, spread: 0.7, headPitch: -0.35, grip: 0.9 },
} satisfies Record<string, BodyParams>;

export type PoseName = keyof typeof POSES;

const KEYS: (keyof BodyParams)[] = ['crouch', 'tuck', 'lean', 'side', 'twist', 'armsUp', 'spread', 'headPitch', 'grip'];

export function easeInOut(u: number): number {
  const t = Math.min(1, Math.max(0, u));
  return t * t * (3 - 2 * t);
}

export function blendPoses(a: BodyParams, b: BodyParams, u: number): BodyParams {
  const t = easeInOut(u);
  const out = { ...a };
  for (const k of KEYS) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}

export interface Keyframe {
  /** Segundos relativos à âncora da fase. */
  t: number;
  pose: PoseName;
}

/** Avalia uma sequência de keyframes no tempo t, sempre de forma contínua. */
export function sampleSequence(keys: Keyframe[], t: number): BodyParams {
  if (t <= keys[0].t) return { ...POSES[keys[0].pose] };
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (t <= b.t) return blendPoses(POSES[a.pose], POSES[b.pose], (t - a.t) / Math.max(1e-4, b.t - a.t));
  }
  return { ...POSES[keys[keys.length - 1].pose] };
}

/**
 * Voo, com tempo desde a decolagem. Cada família usa uma sequência própria:
 * rotações encolhem o corpo durante o giro, grabs levam os joelhos ao peito,
 * aéreos básicos ficam mais abertos e estilosos.
 */
export function airKeys(family: ManeuverFamily, airTime: number, moveStart: number, moveEnd: number): Keyframe[] {
  const ext: Keyframe = { t: 0.1, pose: 'extensao' };
  // A preparação do pouso começa pelo menos 0,18 s depois do fim da manobra, para não haver troca brusca.
  const holdEnd = family === 'grab' || family === 'combo' ? Math.max(0.3, moveEnd + 0.12) : Math.max(0.2, moveEnd);
  const prep = Math.min(airTime - 0.05, Math.max(holdEnd + 0.18, airTime - 0.3));
  switch (family) {
    case 'rotacao':
    case 'experimental':
      return [
        { t: 0, pose: 'compressao' },
        ext,
        { t: Math.max(0.18, moveStart - 0.05), pose: 'arGiro' },
        { t: Math.max(0.2, moveEnd), pose: 'arGiro' },
        { t: prep, pose: 'preparaPouso' },
        { t: airTime, pose: 'preparaPouso' },
      ];
    case 'grab':
    case 'combo':
      return [
        { t: 0, pose: 'compressao' },
        ext,
        { t: Math.max(0.2, moveStart - 0.1), pose: 'arNeutro' },
        { t: Math.max(0.25, moveStart + 0.05), pose: 'arGrab' },
        { t: Math.max(0.3, moveEnd + 0.12), pose: 'arGrab' },
        { t: prep, pose: 'preparaPouso' },
        { t: airTime, pose: 'preparaPouso' },
      ];
    default:
      return [
        { t: 0, pose: 'compressao' },
        ext,
        { t: Math.min(airTime * 0.45, 0.4), pose: 'arNeutro' },
        { t: prep, pose: 'preparaPouso' },
        { t: airTime, pose: 'preparaPouso' },
      ];
  }
}

/** Depois do pouso, conforme o resultado. */
export function landingKeys(outcome: 'limpa' | 'concluida' | 'instavel'): Keyframe[] {
  if (outcome === 'instavel') {
    return [
      { t: 0, pose: 'preparaPouso' },
      { t: 0.1, pose: 'absorcao' },
      { t: 0.35, pose: 'instavel' },
      { t: 1.1, pose: 'instavel' },
      { t: 1.7, pose: 'saida' },
    ];
  }
  const keys: Keyframe[] = [
    { t: 0, pose: 'preparaPouso' },
    { t: 0.09, pose: 'absorcao' },
    { t: 0.45, pose: 'saida' },
  ];
  if (outcome === 'limpa') keys.push({ t: 0.85, pose: 'comemoracao' }, { t: 1.5, pose: 'comemoracao' }, { t: 1.9, pose: 'saida' });
  return keys;
}
