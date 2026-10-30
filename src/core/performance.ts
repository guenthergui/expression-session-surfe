import { WILDCARD_EXPERIMENTAL_BONUS } from '../data/equipment';
import { findLocation } from '../data/locations';
import { clamp } from './rng';
import type { AttributeKey, Attributes, Board, Conditions, Fin, Maneuver, Phase } from './types';

// Capacidade do surfista e efeito das condições e do equipamento.
// O pouso não é mais decidido por uma rolagem de chance: é a física do voo e
// do pouso (sim/). Daqui saem os números que alimentam essa física:
//   - capacidade S: média ponderada dos atributos relevantes (para a roleta);
//   - condições C: altura, potência, vento e seção viram um multiplicador da
//     projeção (vento maral ajuda a subir, terral atrapalha); a leitura de onda
//     reduz a parte negativa;
//   - cansaço: cada onda da bateria pesa um pouco nas pernas (bombeada).

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
  // Aéreos que pedem muito voo sofrem mais em onda pequena.
  const height = -5 * Math.abs(conditions.height - 1.5) - (conditions.height < 1.1 ? (maneuver.airTime - 0.8) * 12 : 0);
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

/** Fatiga de 0 a 1 para a física (bombeada mais fraca nas últimas ondas). */
export function fatigueFactor(attributes: Attributes, waveIndex: number): number {
  return clamp(fatigue(attributes, waveIndex) / 12, 0, 1);
}

/** Multiplicador das condições na projeção do aéreo (perto de 1, entre 0,88 e 1,1). */
export function conditionFactor(conditions: Conditions, maneuver: Maneuver, locationId: string, leituraOnda: number): number {
  return 1 + clamp(conditionModifier(conditions, maneuver, locationId, leituraOnda) / 100, -0.12, 0.1);
}
