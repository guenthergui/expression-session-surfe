import { WILDCARD_EXPERIMENTAL_BONUS } from '../data/equipment';
import { findLocation } from '../data/locations';
import { clamp } from './rng';
import type { AttributeKey, Attributes, Board, Conditions, Fin, Maneuver, Outcome, Phase } from './types';

// Avaliação centralizada da chance de pouso:
//
//   P = clamp(40 + k × (S − D) + E + C + L + A, 5, 97)   com k = 0,5 se S ≥ D e 0,7 se S < D
//
// Todos os componentes estão na mesma escala de pontos percentuais e cada um é
// calculado uma única vez, para nenhum modificador entrar em dobro:
//   S  capacidade: média ponderada dos atributos relevantes (0 a 100),
//      mais o domínio da família (até +10), menos o cansaço.
//   D  dificuldade-base da manobra (0 a 100). Faltar capacidade pesa mais que sobrar.
//   E  equipamento: prancha + quilhas por fase, ponderados pela manobra (−6 a +9).
//   C  condições: altura, potência, vento e seção (−15 a +12). A leitura de onda
//      só reduz a parte negativa.
//   L  execução: −25 + 60 × qualidade dos comandos (−25 a +35). É o maior peso.
//   A  aproximação: velocidade com que o surfista chega ao lip (0 a +5).
//
// Depois, uma rolagem de 0 a 100 decide o pouso. Um Miss em comando essencial é
// queda direta, seja qual for P.

export const P_MIN = 5;
export const P_MAX = 97;

export interface ChanceInput {
  attributes: Attributes;
  maneuver: Maneuver;
  board: Board;
  fin: Fin;
  conditions: Conditions;
  locationId: string;
  /** Índice da onda na bateria (0 a 4), usado para o cansaço. */
  waveIndex: number;
  /** Domínio do jogador na família da manobra, de 0 a 100. */
  mastery?: number;
  /** Qualidade da execução de 0 a 1. Sem valor, L = 0 (estimativa antes de surfar). */
  executionQuality?: number;
  /** Velocidade da aproximação de 0 (cruzeiro) a 1 (máxima). Sem valor, A = 0. */
  approach?: number;
}

export interface ChanceBreakdown {
  S: number;
  fatigue: number;
  masteryBonus: number;
  D: number;
  E: number;
  C: number;
  L: number;
  /** Bônus da velocidade de aproximação (0 a +5). */
  A: number;
  P: number;
}

export function fatigue(attributes: Attributes, waveIndex: number): number {
  return waveIndex * ((100 - attributes.resistencia) / 100) * 3;
}

export function skillScore(attributes: Attributes, maneuver: Maneuver): number {
  let s = 0;
  for (const [key, w] of Object.entries(maneuver.weights) as [AttributeKey, number][]) {
    s += attributes[key] * w;
  }
  return s;
}

export function masteryBonus(mastery = 0): number {
  return clamp(mastery, 0, 100) * 0.1;
}

export function equipmentModifier(board: Board, fin: Fin, maneuver: Maneuver): number {
  let e = 0;
  for (const [phase, w] of Object.entries(maneuver.phaseWeights) as [Phase, number][]) {
    e += (board.mods[phase] + fin.mods[phase]) * w;
  }
  e *= 1.5;
  if (board.id === 'wildcard' && maneuver.experimental) e += WILDCARD_EXPERIMENTAL_BONUS;
  return e;
}

/** Partes das condições antes da leitura de onda, para mostrar ao jogador. */
export function conditionParts(conditions: Conditions, maneuver: Maneuver, locationId: string) {
  const loc = findLocation(locationId);
  const height = -5 * Math.abs(conditions.height - 1.5) +
    (maneuver.minWaveHeight && conditions.height < maneuver.minWaveHeight ? -7 : 0);
  const power = clamp((conditions.power - 50) / 10, -3, 3.5);
  let wind = 0;
  if (loc.windAffects) {
    const v = conditions.windSpeed;
    if (conditions.windType === 'maral') wind = v < 5 ? 0 : v <= 18 ? 2.5 : 2.5 - (v - 18) * 0.5;
    else if (conditions.windType === 'terral') wind = -v / 6;
    else wind = -v / 10;
  }
  const section = (conditions.sectionQuality - 50) / 6;
  return { height, power, wind, section };
}

export function conditionModifier(
  conditions: Conditions,
  maneuver: Maneuver,
  locationId: string,
  leituraOnda: number,
): number {
  const parts = Object.values(conditionParts(conditions, maneuver, locationId));
  const pos = parts.filter((p) => p > 0).reduce((a, b) => a + b, 0);
  const neg = parts.filter((p) => p < 0).reduce((a, b) => a + b, 0);
  return clamp(pos + neg * (1 - leituraOnda / 200), -15, 12);
}

export function executionModifier(quality: number | undefined): number {
  if (quality === undefined) return 0;
  return -25 + 60 * clamp(quality, 0, 1);
}

/** Chegar rápido ao lip (W) dá até 5 pontos: a velocidade é potencial de aéreo. */
export function approachModifier(approach: number | undefined): number {
  if (approach === undefined) return 0;
  return 5 * clamp(approach, 0, 1);
}

export function computeChance(input: ChanceInput): ChanceBreakdown {
  const fat = fatigue(input.attributes, input.waveIndex);
  const mb = masteryBonus(input.mastery);
  const S = skillScore(input.attributes, input.maneuver) + mb - fat;
  const D = input.maneuver.difficulty;
  const E = equipmentModifier(input.board, input.fin, input.maneuver);
  const C = conditionModifier(input.conditions, input.maneuver, input.locationId, input.attributes.leituraOnda);
  const L = executionModifier(input.executionQuality);
  const A = approachModifier(input.approach);
  const gap = S - D;
  const P = Math.round(clamp(40 + (gap >= 0 ? 0.5 : 0.7) * gap + E + C + L + A, P_MIN, P_MAX));
  return { S, fatigue: fat, masteryBonus: mb, D, E, C, L, A, P };
}

/**
 * Resolve o pouso com uma rolagem de 0 a 100.
 * Um Miss num comando essencial derruba o surfista, seja qual for a chance.
 */
export function resolveOutcome(P: number, roll: number, essentialFailed: boolean, quality: number): Outcome {
  if (essentialFailed) return 'queda';
  if (roll >= P) return 'queda';
  const margin = P - roll;
  if (margin < 10) return 'instavel';
  if (margin >= 25 && quality >= 0.8) return 'limpa';
  return 'concluida';
}
