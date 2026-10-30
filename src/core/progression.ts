import { MAX_ATTRIBUTE } from '../data/attributes';
import { BOARDS, FINS } from '../data/equipment';
import { LOCATIONS } from '../data/locations';
import { MANEUVERS } from './maneuvers';
import { clamp } from './rng';
import type { SaveData } from './save';
import type { AttributeKey, ManeuverFamily, Outcome } from './types';
import { refreshCosmetics } from './unlocks';

export const SKILL_POINTS_PER_LEVEL = 4;
/** Ponto de skill garantido por bateria completa, além dos pontos de nível. */
export const HEAT_SKILL_POINTS = 1;
export const HEAT_COMPLETION_XP = 40;

export function xpToNext(level: number): number {
  return 100 + 100 * level;
}

/** Experiência de uma onda. Quedas rendem menos, mas o jogador sempre progride. */
export function waveXp(outcome: Outcome, points: number, difficulty: number): number {
  if (outcome === 'queda') return Math.round(10 + difficulty / 5);
  return Math.round(points / 40 + difficulty / 2);
}

/** Domínio técnico ganho na família da manobra. Pousos valem mais que quedas. */
export function masteryGain(outcome: Outcome, difficulty: number, quality: number): number {
  const base = outcome === 'queda' ? 0.5 : outcome === 'instavel' ? 2 : outcome === 'concluida' ? 3 : 4;
  return base * (0.6 + difficulty / 100) * (0.5 + quality / 2);
}

export function applyMastery(save: SaveData, family: ManeuverFamily, gain: number): void {
  save.mastery[family] = clamp(save.mastery[family] + gain, 0, 100);
}

export interface XpResult {
  levelsGained: number;
  pointsGained: number;
  unlocks: string[];
}

/** Soma experiência, sobe de nível e libera conteúdo. Altera o save recebido. */
export function applyXp(save: SaveData, xp: number): XpResult {
  let levelsGained = 0;
  save.xp += Math.max(0, Math.round(xp));
  while (save.xp >= xpToNext(save.level)) {
    save.xp -= xpToNext(save.level);
    save.level++;
    levelsGained++;
  }
  const pointsGained = levelsGained * SKILL_POINTS_PER_LEVEL;
  save.skillPoints += pointsGained;
  return { levelsGained, pointsGained, unlocks: refreshUnlocks(save) };
}

/** Libera o conteúdo do nível atual. Retorna os nomes do que foi liberado agora. */
export function refreshUnlocks(save: SaveData): string[] {
  const unlocks: string[] = [];
  const add = (list: string[], id: string, label: string) => {
    if (!list.includes(id)) {
      list.push(id);
      unlocks.push(label);
    }
  };
  for (const m of MANEUVERS) if (m.unlockLevel <= save.level) add(save.unlockedManeuvers, m.id, `Manobra: ${m.name}`);
  for (const l of LOCATIONS) if (l.unlockLevel <= save.level) add(save.unlockedLocations, l.id, `Local: ${l.name}`);
  for (const b of BOARDS) if (b.unlockLevel <= save.level) add(save.unlockedBoards, b.id, `Prancha: ${b.name}`);
  for (const f of FINS) if (f.unlockLevel <= save.level) add(save.unlockedFins, f.id, `Quilhas: ${f.name}`);
  for (const c of refreshCosmetics(save)) unlocks.push(`Visual: ${c.name}`);
  return unlocks;
}

/** Gasta um ponto de skill. Não passa de 100 nem do saldo. */
export function spendPoint(save: SaveData, key: AttributeKey): boolean {
  if (save.skillPoints <= 0 || save.attributes[key] >= MAX_ATTRIBUTE) return false;
  save.attributes[key]++;
  save.skillPoints--;
  return true;
}
