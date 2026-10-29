import { clamp } from './rng';
import type { Maneuver, Outcome } from './types';

// Pontos = base × execução × pouso × dificuldade × novidade × combo
// Todos os multiplicadores têm limites para evitar pontuações descontroladas.

export const LIMITS = {
  execution: [0.5, 1.4],
  landing: [0, 1.25],
  difficulty: [1, 2],
  novelty: [0.5, 1.5],
  combo: [1, 2.5],
} as const;

export const LANDING_MULT: Record<Outcome, number> = {
  limpa: 1.25,
  concluida: 1,
  instavel: 0.7,
  queda: 0,
};

export interface ScoreInput {
  maneuver: Maneuver;
  outcome: Outcome;
  executionQuality: number;
  grabMissed: boolean;
  estilo: number;
  /** Quantas vezes esta manobra já foi completada nesta bateria. */
  timesLandedThisHeat: number;
  /** Primeira vez que esta manobra experimental é completada pelo jogador. */
  isNewDiscovery: boolean;
  /** Combo depois desta onda (já atualizado por nextCombo). */
  comboAfter: number;
}

export interface ScoreBreakdown {
  base: number;
  execution: number;
  landing: number;
  difficulty: number;
  novelty: number;
  combo: number;
  styleBonus: number;
  total: number;
}

export function executionMultiplier(i: Pick<ScoreInput, 'executionQuality' | 'grabMissed' | 'estilo'>) {
  const styleBonus = (i.estilo / 100) * 0.15;
  let e = 0.6 + 0.6 * i.executionQuality + styleBonus;
  if (i.grabMissed) e -= 0.2;
  return { execution: clamp(e, ...LIMITS.execution), styleBonus };
}

/** Repetir a manobra reduz a novidade; uma experimental nova vale 1,5. */
export function noveltyMultiplier(timesLanded: number, isNewDiscovery: boolean): number {
  if (isNewDiscovery) return LIMITS.novelty[1];
  return clamp(1 / (1 + 0.3 * timesLanded), ...LIMITS.novelty);
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

export function computeScore(i: ScoreInput): ScoreBreakdown {
  const { execution, styleBonus } = executionMultiplier(i);
  const landing = LANDING_MULT[i.outcome];
  const difficulty = clamp(1 + i.maneuver.difficulty / 100, ...LIMITS.difficulty);
  const novelty = noveltyMultiplier(i.timesLandedThisHeat, i.isNewDiscovery);
  const combo = comboMultiplier(i.comboAfter);
  const total = Math.round(i.maneuver.baseScore * execution * landing * difficulty * novelty * combo);
  return { base: i.maneuver.baseScore, execution, landing, difficulty, novelty, combo, styleBonus, total };
}
