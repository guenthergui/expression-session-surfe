import type { AirRecord } from '../sim/airPhysics';
import type { LandingResult } from '../sim/landing';
import type { Recognized } from './maneuvers';
import { clamp } from './rng';
import type { Outcome } from './types';

// Pontuação dos aéreos, pela qualidade real da execução.
//
//   pontos do aéreo = base × execução × pouso × dificuldade × novidade × sequência × desafio
//   pontos da onda  = soma dos aéreos × combo entre ondas (× 0,85 se a onda terminou em queda)
//
// Execução (0,5 a 1,5) soma altura, amplitude, velocidade na decolagem,
// fluidez (compressão e tempo do pop), controle (sem giro indo e voltando),
// precisão da rotação, qualidade do grab e estilo, e desconta quando a
// aproximação não cumpre a ficha (velocidade abaixo da recomendada, ângulo
// fora da faixa). Pouso usa a qualidade física do pouso: um 360 que chega
// desequilibrado nunca leva a nota máxima. Repetir o mesmo aéreo rende menos e
// cada aéreo seguinte na mesma onda soma no multiplicador de sequência, até um
// limite. Curvas e batidas não pontuam.

export const LIMITS = {
  execution: [0.5, 1.5],
  landing: [0, 1.25],
  difficulty: [1, 2],
  novelty: [0.5, 1.5],
  sequence: [1, 1.6],
  combo: [1, 2.5],
} as const;

/** Bônus do aéreo sorteado pela roleta (desafio da onda). */
export const CHALLENGE_BONUS = 1.5;
/** Aéreo ainda não liberado por nível vale menos. */
export const LOCKED_FACTOR = 0.6;
/** Bônus de continuidade: sair surfando depois do pouso. */
export const RIDE_AWAY_BONUS = 0.1;

export interface ExecutionParts {
  height: number;
  amplitude: number;
  speed: number;
  fluidity: number;
  control: number;
  rotation: number;
  grab: number;
  /** Desconto por não cumprir a aproximação da ficha (0 a 0,3). */
  requirement: number;
}

export function executionParts(r: AirRecord, rec: Recognized, landing: Pick<LandingResult, 'yawError' | 'flipError'>): ExecutionParts {
  const L = r.launch;
  const p = rec.primary;
  const ref = Math.max(p.height, rec.secondary?.height ?? 0);
  const minSpeed = Math.max(p.minSpeed, rec.secondary?.minSpeed ?? 0);
  const [a0, a1] = p.approach;
  const angleOff = L.approachDeg < a0 ? a0 - L.approachDeg : L.approachDeg > a1 ? L.approachDeg - a1 : 0;
  const grabHeld = Math.max(0, ...Object.values(r.grabs), ...Object.values(r.ext));
  const rotates = rec.rotation >= 140 || r.flip >= 270;
  return {
    height: clamp(r.apex / (ref * 1.4), 0, 1),
    amplitude: clamp(r.distance / 7.5, 0, 1),
    speed: clamp((L.speed - 5) / 5, 0, 1),
    fluidity: (L.compress + L.timing) / 2,
    control: clamp(1 - 0.18 * Math.max(0, r.reversals - 1) - (r.prepTime > 0.6 ? 0.15 : 0), 0, 1),
    rotation: rotates ? clamp(1 - Math.max(landing.yawError, landing.flipError) / 60, 0, 1) : 0,
    grab: grabHeld > 0 ? clamp(grabHeld / 0.55, 0, 1) * (r.grabAtTouch > 0.3 ? 0.6 : 1) : 0,
    requirement: clamp(Math.max(0, minSpeed - L.speed) * 0.12 + angleOff / 150, 0, 0.3),
  };
}

export function executionMultiplier(e: ExecutionParts, rec: Recognized, estilo: number): { execution: number; styleBonus: number } {
  const styleBonus = (estilo / 100) * 0.12;
  let x = 0.55 + 0.22 * e.height + 0.1 * e.amplitude + 0.1 * e.speed + 0.1 * e.fluidity + 0.08 * e.control + styleBonus;
  if (rec.rotation >= 140 || rec.primary.axis === 'flip' || rec.primary.axis === 'rodeo') x += 0.12 * e.rotation;
  if (rec.primary.grab || rec.secondary?.grab || rec.primary.extension || rec.secondary?.extension) x += 0.12 * e.grab;
  x -= e.requirement;
  return { execution: clamp(x, ...LIMITS.execution), styleBonus };
}

/** Pouso: a qualidade física define o multiplicador dentro de cada resultado. */
export function landingMultiplier(outcome: Outcome, quality: number): number {
  switch (outcome) {
    case 'queda': return 0;
    case 'instavel': return 0.45 + 0.15 * clamp((quality - 0.32) / 0.28, 0, 1);
    case 'concluida': return 0.8 + 0.18 * clamp((quality - 0.6) / 0.24, 0, 1);
    case 'limpa': return 1.05 + 0.2 * clamp((quality - 0.84) / 0.16, 0, 1);
  }
}

/** Repetir a manobra reduz a novidade; uma experimental nova vale 1,5. */
export function noveltyMultiplier(timesLanded: number, isNewDiscovery: boolean): number {
  if (isNewDiscovery) return LIMITS.novelty[1];
  return clamp(1 / (1 + 0.3 * timesLanded), ...LIMITS.novelty);
}

/** k-ésimo aéreo completado na mesma onda (1 = primeiro). */
export function sequenceMultiplier(k: number): number {
  return clamp(1 + 0.15 * (k - 1), ...LIMITS.sequence);
}

export function comboMultiplier(combo: number): number {
  return clamp(1 + 0.25 * (combo - 1), ...LIMITS.combo);
}

/** Queda zera o combo; instável mantém; limpa e excepcional soma 2; o resto soma 1. */
export function nextCombo(combo: number, outcome: Outcome, executionQuality: number): number {
  if (outcome === 'queda') return 0;
  if (outcome === 'instavel') return Math.max(combo, 1);
  if (outcome === 'limpa' && executionQuality >= 0.9) return combo + 2;
  return combo + 1;
}

export interface AerialScore {
  base: number;
  execution: number;
  landing: number;
  difficulty: number;
  novelty: number;
  sequence: number;
  challenge: number;
  locked: number;
  styleBonus: number;
  parts: ExecutionParts;
  total: number;
}

export interface AerialScoreInput {
  record: AirRecord;
  recognized: Recognized;
  landing: LandingResult;
  estilo: number;
  timesLanded: number;
  isNewDiscovery: boolean;
  /** Posição do aéreo entre os completados na onda (1 = primeiro). */
  indexInWave: number;
  challenge: boolean;
  unlocked: boolean;
}

export function scoreAerial(i: AerialScoreInput): AerialScore {
  const parts = executionParts(i.record, i.recognized, i.landing);
  const { execution, styleBonus } = executionMultiplier(parts, i.recognized, i.estilo);
  const landing = landingMultiplier(i.landing.outcome, i.landing.quality);
  const difficulty = clamp(1 + i.recognized.difficulty / 100, ...LIMITS.difficulty);
  const novelty = noveltyMultiplier(i.timesLanded, i.isNewDiscovery);
  const sequence = sequenceMultiplier(i.indexInWave);
  const challenge = i.challenge ? CHALLENGE_BONUS : 1;
  const locked = i.unlocked ? 1 : LOCKED_FACTOR;
  const total = Math.round(i.recognized.baseScore * execution * landing * difficulty * novelty * sequence * challenge * locked);
  return { base: i.recognized.baseScore, execution, landing, difficulty, novelty, sequence, challenge, locked, styleBonus, parts, total };
}

/** Qualidade da execução de 0 a 1 (para o combo, as estatísticas e o domínio). */
export function executionQuality(s: AerialScore): number {
  return clamp((s.execution - LIMITS.execution[0]) / (1.25 - LIMITS.execution[0]), 0, 1) * 0.5 + clamp(s.landing / 1.25, 0, 1) * 0.5;
}
