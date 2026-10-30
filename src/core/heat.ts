import { findBoard, findFin } from '../data/equipment';
import type { AirRecord } from '../sim/airPhysics';
import type { LandingResult } from '../sim/landing';
import { generateWaveConditions, type HeatSetup } from './conditions';
import { MANEUVERS, recognize, type Recognized } from './maneuvers';
import { conditionFactor, fatigueFactor } from './performance';
import { HEAT_COMPLETION_XP, waveXp } from './progression';
import type { Rng } from './rng';
import { pickManeuver, type MasteryMap } from './roulette';
import { RIDE_AWAY_BONUS, comboMultiplier, executionQuality, nextCombo, scoreAerial, type AerialScore } from './scoring';
import type { Attributes, Conditions, Maneuver, ManeuverFamily, Outcome } from './types';

export const WAVES_PER_HEAT = 5;
/** Onda que termina em queda depois de aéreos completados perde parte dos pontos. */
export const FALL_FINISH = 0.85;

export type WaveEnd = 'fim' | 'queda' | 'fechou';

/** Um aéreo feito na onda, já reconhecido e avaliado. */
export interface AerialResult {
  name: string;
  recognized: Recognized;
  record: AirRecord;
  landing: LandingResult;
  score: AerialScore;
  /** Qualidade da execução de 0 a 1. */
  quality: number;
  challenge: boolean;
  unlocked: boolean;
  newDiscovery: boolean;
  /** Saiu surfando depois do pouso (bônus de continuidade já somado). */
  rodeAway: boolean;
  points: number;
}

export interface WaveResult {
  waveIndex: number;
  /** Aéreo sorteado como desafio da onda. */
  maneuver: Maneuver;
  conditions: Conditions;
  aerials: AerialResult[];
  endedBy: WaveEnd;
  /** Resultado da onda para o combo: o melhor pouso, ou queda sem nenhum. */
  outcome: Outcome;
  subtotal: number;
  combo: number;
  finish: number;
  total: number;
  comboAfter: number;
  xp: number;
  newDiscovery: boolean;
  challengeDone: boolean;
  quality: number;
}

export interface HeatSummary {
  total: number;
  waveScores: { name: string; outcome: Outcome; points: number }[];
  landed: number;
  falls: number;
  successRate: number;
  bestCombo: number;
  bestWave: number;
  /** Melhor execução: aéreo e qualidade de 0 a 100. */
  bestExecution: { name: string; quality: number } | null;
  /** Pousos limpos. */
  perfects: number;
  xp: number;
  newDiscoveries: string[];
  families: { family: ManeuverFamily; outcome: Outcome; difficulty: number; quality: number }[];
}

const OUTCOME_RANK: Record<Outcome, number> = { queda: 0, instavel: 1, concluida: 2, limpa: 3 };

/** Estado de uma bateria de cinco ondas. Não conhece a renderização. */
export class HeatSession {
  readonly results: WaveResult[] = [];
  combo = 0;
  bestCombo = 0;
  respinAvailable = true;
  private picked: string[] = [];
  private conditions: Conditions;
  private current: Maneuver | null = null;
  /** Aéreos da onda em andamento. */
  wave: AerialResult[] = [];

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
    return this.results.reduce((a, r) => a + r.total, 0);
  }

  /** Pontos da onda em andamento (antes do combo). */
  get waveSubtotal(): number {
    return this.wave.reduce((a, r) => a + r.points, 0);
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
    this.wave = [];
    return this.current;
  }

  /** Um giro extra por bateria, sem repetir o desafio atual se houver outro. */
  respin(): Maneuver | null {
    if (!this.respinAvailable || !this.current) return null;
    this.respinAvailable = false;
    const previous = this.current;
    const pool = this.pool.length > 1 ? this.pool.filter((m) => m.id !== previous.id) : this.pool;
    this.current = pickManeuver(pool, this.attributes, this.picked, this.rng, this.mastery);
    this.picked.push(this.current.id);
    return this.current;
  }

  /** Números da física para a onda atual: cansaço e efeito das condições na projeção. */
  physics(): { fatigue: number; conditions: number; equip: Maneuver['phaseWeights'] } {
    const board = findBoard(this.setup.boardId);
    const fin = findFin(this.setup.finId);
    const m = this.current ?? MANEUVERS[0];
    const equip = { impulsao: 0, rotacao: 0, grab: 0, aterrissagem: 0 };
    for (const k of Object.keys(equip) as (keyof typeof equip)[]) equip[k] = board.mods[k] + fin.mods[k];
    return {
      fatigue: fatigueFactor(this.attributes, this.waveIndex),
      conditions: conditionFactor(this.conditions, m, this.setup.locationId, this.attributes.leituraOnda),
      equip,
    };
  }

  private timesLanded(id: string): number {
    const prev = this.results.flatMap((r) => r.aerials).concat(this.wave);
    return prev.filter((a) => a.landing.outcome !== 'queda' && a.recognized.primary.id === id).length;
  }

  /** Registra um aéreo no pouso: reconhece, avalia e soma na onda. */
  registerAerial(record: AirRecord, landing: LandingResult): AerialResult {
    const rec = recognize(record, landing);
    const landed = landing.outcome !== 'queda';
    const index = this.wave.filter((a) => a.landing.outcome !== 'queda').length + 1;
    const newDiscovery = landed && rec.experimental && rec.ids.some((id) => findExperimental(id) && !this.discoveries.includes(id) && !this.alreadyDiscovered(id));
    const challenge = landed && !!this.current && rec.ids.includes(this.current.id) && !this.wave.some((a) => a.challenge);
    const unlocked = rec.ids.every((id) => this.unlockedManeuvers.includes(id));
    const score = scoreAerial({
      record,
      recognized: rec,
      landing,
      estilo: this.attributes.estilo,
      timesLanded: this.timesLanded(rec.primary.id),
      isNewDiscovery: newDiscovery,
      indexInWave: index,
      challenge,
      unlocked,
    });
    const a: AerialResult = {
      name: rec.name,
      recognized: rec,
      record,
      landing,
      score,
      quality: landed ? executionQuality(score) : 0,
      challenge,
      unlocked,
      newDiscovery,
      rodeAway: false,
      points: score.total,
    };
    this.wave.push(a);
    return a;
  }

  private alreadyDiscovered(id: string): boolean {
    return this.results.flatMap((r) => r.aerials).concat(this.wave).some((a) => a.newDiscovery && a.recognized.ids.includes(id));
  }

  /** Saiu surfando depois do pouso: confirma o bônus de continuidade do último aéreo. */
  rideAway(): number {
    const a = this.wave[this.wave.length - 1];
    if (!a || a.rodeAway || a.landing.outcome === 'queda') return 0;
    a.rodeAway = true;
    const bonus = Math.round(a.score.total * RIDE_AWAY_BONUS);
    a.points += bonus;
    return bonus;
  }

  /** Fecha a onda. */
  resolveWave(endedBy: WaveEnd): WaveResult {
    const m = this.current;
    if (!m) throw new Error('Gire a roleta antes');
    if (this.isOver) throw new Error('A bateria já terminou');
    const aerials = this.wave;
    const landed = aerials.filter((a) => a.landing.outcome !== 'queda');
    const best = landed.reduce<Outcome>((o, a) => (OUTCOME_RANK[a.landing.outcome] > OUTCOME_RANK[o] ? a.landing.outcome : o), 'queda');
    const outcome: Outcome = endedBy === 'fim' || landed.length === 0 ? best : best === 'limpa' ? 'concluida' : best;
    const quality = landed.length ? Math.max(...landed.map((a) => a.quality)) : 0;
    const comboAfter = endedBy !== 'fim' && landed.length === 0 ? 0 : nextCombo(this.combo, endedBy === 'fim' ? outcome : landed.length ? outcome : 'queda', quality);
    const subtotal = aerials.reduce((s, a) => s + a.points, 0);
    const combo = comboMultiplier(comboAfter);
    const finish = endedBy === 'fim' ? 1 : FALL_FINISH;
    const total = Math.round(subtotal * combo * finish);
    const hardest = landed.reduce((d, a) => Math.max(d, a.recognized.difficulty), 0);
    const result: WaveResult = {
      waveIndex: this.waveIndex,
      maneuver: m,
      conditions: this.conditions,
      aerials: [...aerials],
      endedBy,
      outcome,
      subtotal,
      combo,
      finish,
      total,
      comboAfter,
      xp: waveXp(outcome, total, hardest),
      newDiscovery: aerials.some((a) => a.newDiscovery),
      challengeDone: aerials.some((a) => a.challenge),
      quality,
    };
    this.results.push(result);
    this.combo = comboAfter;
    this.bestCombo = Math.max(this.bestCombo, comboAfter);
    this.current = null;
    this.wave = [];
    if (!this.isOver) this.conditions = generateWaveConditions(this.setup, this.rng);
    return result;
  }

  summary(): HeatSummary {
    const all = this.results.flatMap((r) => r.aerials);
    const landedAirs = all.filter((a) => a.landing.outcome !== 'queda');
    const falls = all.length - landedAirs.length + this.results.filter((r) => r.endedBy === 'fechou').length;
    const best = [...landedAirs].sort((a, b) => b.quality - a.quality)[0];
    const bestOf = (r: WaveResult) => [...r.aerials].sort((a, b) => b.points - a.points)[0];
    return {
      total: this.total,
      waveScores: this.results.map((r) => ({ name: r.aerials.length ? `${bestOf(r).name}${r.aerials.length > 1 ? ` +${r.aerials.length - 1}` : ''}` : 'Sem aéreo', outcome: r.outcome, points: r.total })),
      landed: landedAirs.length,
      falls,
      successRate: landedAirs.length + falls ? landedAirs.length / (landedAirs.length + falls) : 0,
      bestCombo: this.bestCombo,
      bestWave: Math.max(0, ...this.results.map((r) => r.total)),
      bestExecution: best ? { name: best.name, quality: Math.round(best.quality * 100) } : null,
      perfects: landedAirs.filter((a) => a.landing.outcome === 'limpa').length,
      xp: this.results.reduce((a, r) => a + r.xp, 0) + (this.isOver ? HEAT_COMPLETION_XP : 0),
      newDiscoveries: [...new Set(all.filter((a) => a.newDiscovery).flatMap((a) => a.recognized.ids.filter((id) => findExperimental(id))))],
      families: all.map((a) => ({ family: a.recognized.family, outcome: a.landing.outcome, difficulty: a.recognized.difficulty, quality: a.quality })),
    };
  }
}

function findExperimental(id: string): boolean {
  return MANEUVERS.some((m) => m.id === id && m.experimental);
}
