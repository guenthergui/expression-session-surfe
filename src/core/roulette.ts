import { masteryBonus, skillScore } from './performance';
import type { Rng } from './rng';
import type { Attributes, Maneuver, ManeuverFamily } from './types';

// A roleta só sorteia manobras desbloqueadas (o nível libera o catálogo). O peso
// de cada uma cai quando a dificuldade passa muito da capacidade do surfista
// (atributos + domínio técnico), então desafios difíceis aparecem, mas raramente.
// Repetições na mesma bateria também pesam menos.

export type MasteryMap = Partial<Record<ManeuverFamily, number>>;

export function rouletteWeight(
  m: Maneuver,
  attributes: Attributes,
  timesPickedThisHeat: number,
  mastery: MasteryMap = {},
): number {
  const capacity = skillScore(attributes, m) + masteryBonus(mastery[m.family]);
  const gap = m.difficulty - capacity;
  let w = gap <= 15 ? 1 : gap <= 35 ? 0.3 : 0.06;
  if (m.experimental) w *= 0.6;
  w *= Math.pow(0.4, timesPickedThisHeat);
  return w;
}

export function pickManeuver(
  pool: Maneuver[],
  attributes: Attributes,
  pickedThisHeat: string[],
  rng: Rng,
  mastery: MasteryMap = {},
): Maneuver {
  if (pool.length === 0) throw new Error('Nenhuma manobra disponível para a roleta');
  const weights = pool.map((m) =>
    rouletteWeight(m, attributes, pickedThisHeat.filter((id) => id === m.id).length, mastery),
  );
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r < 0) return pool[i];
  }
  return pool[pool.length - 1];
}
