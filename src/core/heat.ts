import { findBoard, findFin } from '../data/equipment';
import { generateWaveConditions, type HeatSetup } from './conditions';
import { MANEUVERS } from './maneuvers';
import { computeChance, resolveOutcome, type ChanceBreakdown } from './performance';
import { HEAT_COMPLETION_XP, waveXp } from './progression';
import type { Rng } from './rng';
import { pickManeuver, type MasteryMap } from './roulette';
import { computeScore, nextCombo, type ScoreBreakdown } from './scoring';
import { summarizeExecution, type ExecutionSummary } from './timing';
import type { Attributes, Conditions, Maneuver, Outcome, StepResult } from './types';

export const WAVES_PER_HEAT = 5;

export interface WaveResult {
  waveIndex: number;
  maneuver: Maneuver;
  conditions: Conditions;
  chance: ChanceBreakdown;
  roll: number;
  outcome: Outcome;
  score: ScoreBreakdown;
  comboAfter: number;
  xp: number;
  newDiscovery: boolean;
  execution: ExecutionSummary;
  steps: StepResult[];
}

export interface HeatSummary {
  total: number;
  waveScores: { name: string; outcome: Outcome; points: number }[];
  landed: number;
  falls: number;
  successRate: number;
  bestCombo: number;
  bestWave: number;
  /** Melhor execução: manobra e qualidade de 0 a 100. */
  bestExecution: { name: string; quality: number } | null;
  perfects: number;
  xp: number;
  newDiscoveries: string[];
  families: { family: Maneuver['family']; outcome: Outcome; difficulty: number; quality: number }[];
}

/** Estado de uma bateria de cinco ondas. Não conhece a renderização. */
export class HeatSession {
  readonly results: WaveResult[] = [];
  combo = 0;
  bestCombo = 0;
  respinAvailable = true;
  private picked: string[] = [];
  private conditions: Conditions;
  private current: Maneuver | null = null;

  constructor(
    readonly setup: HeatSetup,
    readonly attributes: Attributes,
    private readonly unlockedManeuvers: string[],
    private readonly discoveries: string[],
    private readonly rng: Rng,
    readonly mastery: MasteryMap = {},
  ) {
    this.conditions = generateWaveConditions(setup, rng);
  }

  get waveIndex(): number {
    return this.results.length;
  }

  get isOver(): boolean {
    return this.results.length >= WAVES_PER_HEAT;
  }

  get total(): number {
    return this.results.reduce((a, r) => a + r.score.total, 0);
  }

  get currentConditions(): Conditions {
    return this.conditions;
  }

  get currentManeuver(): Maneuver | null {
    return this.current;
  }

  get pool(): Maneuver[] {
    return MANEUVERS.filter((m) => this.unlockedManeuvers.includes(m.id));
  }

  spin(): Maneuver {
    this.current = pickManeuver(this.pool, this.attributes, this.picked, this.rng, this.mastery);
    this.picked.push(this.current.id);
    return this.current;
  }

  /** Um giro extra por bateria, sem repetir a manobra atual se houver outra. */
  respin(): Maneuver | null {
    if (!this.respinAvailable || !this.current) return null;
    this.respinAvailable = false;
    const previous = this.current;
    const pool = this.pool.length > 1 ? this.pool.filter((m) => m.id !== previous.id) : this.pool;
    this.current = pickManeuver(pool, this.attributes, this.picked, this.rng, this.mastery);
    this.picked.push(this.current.id);
    return this.current;
  }

  /** Chance antes de surfar, sem a parcela da execução. */
  estimate(): ChanceBreakdown {
    if (!this.current) throw new Error('Gire a roleta antes');
    return this.chanceFor(this.current, undefined);
  }

  private chanceFor(m: Maneuver, executionQuality: number | undefined, approach?: number): ChanceBreakdown {
    return computeChance({
      attributes: this.attributes,
      maneuver: m,
      board: findBoard(this.setup.boardId),
      fin: findFin(this.setup.finId),
      conditions: this.conditions,
      locationId: this.setup.locationId,
      waveIndex: this.waveIndex,
      mastery: this.mastery[m.family],
      executionQuality,
      approach,
    });
  }

  /** Resolve a onda. `approach` é a velocidade de aproximação (0 a 1) na decolagem. */
  resolve(steps: StepResult[], approach?: number): WaveResult {
    const m = this.current;
    if (!m) throw new Error('Gire a roleta antes');
    if (this.isOver) throw new Error('A bateria já terminou');
    const exec = summarizeExecution(steps);
    const chance = this.chanceFor(m, exec.quality, approach);
    const roll = this.rng() * 100;
    const outcome = resolveOutcome(chance.P, roll, exec.essentialFailed, exec.quality);
    const landed = outcome !== 'queda';
    const comboAfter = nextCombo(this.combo, outcome, exec.quality);
    const newDiscovery = landed && m.experimental && !this.discoveries.includes(m.id) &&
      !this.results.some((r) => r.newDiscovery && r.maneuver.id === m.id);
    const score = computeScore({
      maneuver: m,
      outcome,
      executionQuality: exec.quality,
      grabMissed: exec.grabMissed,
      estilo: this.attributes.estilo,
      timesLandedThisHeat: this.results.filter((r) => r.maneuver.id === m.id && r.outcome !== 'queda').length,
      isNewDiscovery: newDiscovery,
      comboAfter,
    });
    const result: WaveResult = {
      waveIndex: this.waveIndex,
      maneuver: m,
      conditions: this.conditions,
      chance,
      roll,
      outcome,
      score,
      comboAfter,
      xp: waveXp(outcome, score.total, m.difficulty),
      newDiscovery,
      execution: exec,
      steps,
    };
    this.results.push(result);
    this.combo = comboAfter;
    this.bestCombo = Math.max(this.bestCombo, comboAfter);
    this.current = null;
    if (!this.isOver) this.conditions = generateWaveConditions(this.setup, this.rng);
    return result;
  }

  summary(): HeatSummary {
    const landed = this.results.filter((r) => r.outcome !== 'queda').length;
    const best = [...this.results].sort((a, b) => b.execution.quality - a.execution.quality)[0];
    return {
      total: this.total,
      waveScores: this.results.map((r) => ({ name: r.maneuver.name, outcome: r.outcome, points: r.score.total })),
      landed,
      falls: this.results.length - landed,
      successRate: this.results.length ? landed / this.results.length : 0,
      bestCombo: this.bestCombo,
      bestWave: Math.max(0, ...this.results.map((r) => r.score.total)),
      bestExecution: best ? { name: best.maneuver.name, quality: Math.round(best.execution.quality * 100) } : null,
      perfects: this.results.reduce((a, r) => a + r.execution.perfects, 0),
      xp: this.results.reduce((a, r) => a + r.xp, 0) + (this.isOver ? HEAT_COMPLETION_XP : 0),
      newDiscoveries: this.results.filter((r) => r.newDiscovery).map((r) => r.maneuver.id),
      families: this.results.map((r) => ({
        family: r.maneuver.family,
        outcome: r.outcome,
        difficulty: r.maneuver.difficulty,
        quality: r.execution.quality,
      })),
    };
  }
}
