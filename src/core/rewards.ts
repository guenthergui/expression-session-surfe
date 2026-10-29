import { findManeuver } from './maneuvers';
import type { HeatSummary } from './heat';
import { HEAT_SKILL_POINTS, applyMastery, applyXp, masteryGain, type XpResult } from './progression';
import type { SaveData } from './save';
import type { ManeuverFamily } from './types';

export interface HeatRewards {
  xp: XpResult;
  pointsGained: number;
  newRecord: boolean;
  masteryGains: Partial<Record<ManeuverFamily, number>>;
  unlocks: string[];
}

/** Aplica o resultado de uma bateria ao progresso. Chame uma única vez por bateria. */
export function applyHeatResult(save: SaveData, sum: HeatSummary): HeatRewards {
  const rec = save.records;
  const newRecord = sum.total > rec.bestHeatScore;
  rec.heatsPlayed++;
  rec.bestHeatScore = Math.max(rec.bestHeatScore, sum.total);
  rec.bestWaveScore = Math.max(rec.bestWaveScore, sum.bestWave);
  rec.bestCombo = Math.max(rec.bestCombo, sum.bestCombo);
  rec.bestExecution = Math.max(rec.bestExecution, sum.bestExecution?.quality ?? 0);

  save.stats.waves += sum.waveScores.length;
  save.stats.landed += sum.landed;
  save.stats.falls += sum.falls;
  save.stats.perfects += sum.perfects;

  const masteryGains: Partial<Record<ManeuverFamily, number>> = {};
  for (const f of sum.families) {
    const g = masteryGain(f.outcome, f.difficulty, f.quality);
    applyMastery(save, f.family, g);
    masteryGains[f.family] = (masteryGains[f.family] ?? 0) + g;
  }

  const unlocks: string[] = [];
  for (const id of sum.newDiscoveries) {
    if (!save.discoveries.includes(id)) {
      save.discoveries.push(id);
      unlocks.push(`Descoberta: ${findManeuver(id)?.name ?? id}`);
    }
  }

  const xp = applyXp(save, sum.xp);
  save.skillPoints += HEAT_SKILL_POINTS;
  return {
    xp,
    pointsGained: xp.pointsGained + HEAT_SKILL_POINTS,
    newRecord,
    masteryGains,
    unlocks: [...xp.unlocks, ...unlocks],
  };
}
