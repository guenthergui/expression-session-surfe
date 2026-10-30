import { MANEUVER_DEFS } from '../data/maneuvers';
import { FAKIE_MIN, type AirRecord } from '../sim/airPhysics';
import type { LandingResult } from '../sim/landing';
import type { AerialTier, Attributes, Direction, GrabId, Maneuver, ManeuverDef, ManeuverFamily, PhaseMods } from './types';

// Catálogo e reconhecimento dos aéreos.
//
// O jogador não escolhe o aéreo num menu: ele o constrói com a aproximação,
// o pop e os comandos no ar. No pouso, recognize() lê o registro do voo
// (giro total, flip, grabs, extensões, ângulo de ataque) e diz qual aéreo foi.
// Rotação ou flip com grab ou extensão vira um nome composto (por exemplo,
// Air Reverse Indy), com a dificuldade das duas partes.

export const GRAB_LABELS: Record<GrabId, string> = {
  indy: 'Indy',
  mute: 'Grab',
  method: 'Method',
  stalefish: 'Stalefish',
  tail: 'Tail Grab',
  japan: 'Japan',
};

export const FAMILY_LABELS: Record<ManeuverFamily, string> = {
  aereo: 'Aéreo básico',
  rotacao: 'Rotação',
  grab: 'Grab',
  combo: 'Rotação + grab',
  experimental: 'Avançado',
};

export const TIER_LABELS: Record<AerialTier, string> = {
  basico: 'Básico',
  rotacao: 'Rotação',
  avancado: 'Avançado',
};

/** Tempo mínimo segurando um grab ou extensão para ele contar (s). */
export const GRAB_MIN = 0.15;

function normalize<T extends string>(raw: Partial<Record<T, number>>): Partial<Record<T, number>> {
  const total = Object.values<number>(raw as Record<T, number>).reduce((a, b) => a + b, 0);
  const out: Partial<Record<T, number>> = {};
  for (const k of Object.keys(raw) as T[]) out[k] = (raw[k] ?? 0) / total;
  return out;
}

/** Atributos relevantes para o aéreo, com pesos que somam 1. */
export function buildWeights(def: ManeuverDef): Partial<Attributes> {
  const w: Partial<Attributes> = { impulsao: 0.25, amplitude: 0.15, forca: 0.1, equilibrio: 0.15 };
  if (def.rotation > 0) {
    w.rotacao = 0.2 * Math.min(1.5, def.rotation / 360 + 0.5);
    w.controleAereo = 0.1;
  }
  if (def.grab) {
    w.controleAereo = (w.controleAereo ?? 0) + 0.1;
    w.estilo = 0.05;
  }
  if (def.extension) {
    w.controleAereo = (w.controleAereo ?? 0) + 0.1;
    w.criatividade = 0.1;
  }
  if (def.experimental) w.criatividade = (w.criatividade ?? 0) + 0.15;
  return normalize(w);
}

export function buildPhaseWeights(def: ManeuverDef): PhaseMods {
  const n = normalize<keyof PhaseMods>({
    impulsao: 0.3,
    rotacao: def.rotation > 0 ? 0.3 : 0,
    grab: def.grab || def.extension ? 0.15 : 0,
    aterrissagem: 0.3,
  });
  return { impulsao: n.impulsao ?? 0, rotacao: n.rotacao ?? 0, grab: n.grab ?? 0, aterrissagem: n.aterrissagem ?? 0 };
}

/** Lista os problemas de uma ficha. Lista vazia significa válida. */
export function validateManeuver(def: ManeuverDef): string[] {
  const errors: string[] = [];
  if (!def.id) errors.push('sem id');
  if (def.difficulty < 1 || def.difficulty > 100) errors.push('dificuldade fora de 1 a 100');
  if (def.baseScore <= 0) errors.push('pontuação-base deve ser positiva');
  if (def.unlockLevel < 1) errors.push('nível de desbloqueio inválido');
  if (def.minSpeed < 4 || def.minSpeed > 11) errors.push('velocidade mínima fora de 4 a 11 m/s');
  if (def.approach[0] < 0 || def.approach[1] > 90 || def.approach[0] >= def.approach[1]) errors.push('ângulo de aproximação inválido');
  if (def.height <= 0 || def.airTime <= 0) errors.push('altura e tempo de voo precisam ser positivos');
  if (def.control < 0 || def.control > 1) errors.push('controle fora de 0 a 1');
  if (def.rotation > 0 && def.axis === 'nenhuma') errors.push('rotação exige um eixo');
  if ((def.axis === 'giro' && def.rotation >= 180) && def.direction === 'nenhuma' && def.id !== '360-air' && def.id !== 'full-rotation') errors.push('giro sem direção');
  if (!def.body || !def.board || !def.landing || !def.howTo) errors.push('ficha incompleta');
  return errors;
}

export function buildManeuver(def: ManeuverDef): Maneuver {
  const errors = validateManeuver(def);
  if (errors.length) throw new Error(`Aéreo inválido "${def.id}": ${errors.join('; ')}`);
  return { ...def, weights: buildWeights(def), phaseWeights: buildPhaseWeights(def) };
}

export const MANEUVERS: Maneuver[] = MANEUVER_DEFS.map(buildManeuver);

export function findManeuver(id: string): Maneuver | undefined {
  return MANEUVERS.find((m) => m.id === id);
}

function byId(id: string): Maneuver {
  const m = findManeuver(id);
  if (!m) throw new Error(`Aéreo ${id} não existe`);
  return m;
}

export function directionLabel(m: Pick<ManeuverDef, 'direction'>): string {
  return m.direction === 'nenhuma' ? 'Reto' : m.direction === 'frontside' ? 'Frontside' : 'Backside';
}

export interface Recognized {
  /** Aéreo principal (a parte mais difícil). */
  primary: Maneuver;
  /** Segunda parte (grab, extensão ou giro), quando houver. */
  secondary: Maneuver | null;
  name: string;
  family: ManeuverFamily;
  difficulty: number;
  baseScore: number;
  /** Graus de giro reconhecidos (múltiplo de 180 quando fechou a meia volta). */
  rotation: number;
  direction: Direction;
  experimental: boolean;
  /** Ids de todas as partes, para a novidade e as descobertas. */
  ids: string[];
}

const GRAB_IDS: Record<GrabId, string> = {
  indy: 'indy-air',
  mute: 'grab-air',
  method: 'method-air',
  stalefish: 'stalefish-air',
  tail: 'tail-grab',
  japan: 'japan-air',
};

/** Grab principal do voo: o mais segurado acima do mínimo. */
export function mainGrab(r: AirRecord): GrabId | null {
  let best: GrabId | null = null;
  let t = GRAB_MIN;
  for (const [k, held] of Object.entries(r.grabs) as [Exclude<GrabId, 'japan'>, number][]) {
    if (held >= t) {
      best = k;
      t = held;
    }
  }
  if (best === 'mute' && r.japan) return 'japan';
  return best;
}

/** Reconhece o aéreo a partir do que aconteceu no voo. */
export function recognize(r: AirRecord, landing?: Pick<LandingResult, 'yawError'>): Recognized {
  const yawAbs = Math.abs(r.yaw);
  // Giro reconhecido: arredonda para a meia volta quando o pouso fechou perto dela.
  const half = Math.round(yawAbs / 180) * 180;
  const rot = landing && landing.yawError <= 60 && yawAbs >= FAKIE_MIN ? half : yawAbs;
  const fs = r.yaw >= 0;
  const approach = r.launch.approachDeg;
  let rotId: string | null = null;
  if (r.flip >= 270) rotId = yawAbs >= 135 ? 'rodeo-flip' : 'backflip';
  else if (rot >= 500) rotId = 'full-rotation';
  else if (rot >= 300) rotId = !fs && approach < 40 ? 'alley-oop' : approach >= 62 ? '360-air' : fs ? 'fs-360' : 'bs-360';
  else if (rot >= FAKIE_MIN) rotId = !fs && approach < 40 ? 'alley-oop' : fs ? 'air-reverse' : '180-air';

  const ext = (Object.entries(r.ext) as [string, number][]).filter(([, h]) => h >= GRAB_MIN).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const specialId = ext === 'christ' ? 'christ-air' : ext === 'superman' ? 'superman' : ext === 'superwoman' ? 'superwoman' : r.varial ? 'varial-air' : null;
  const grab = mainGrab(r);
  // Extensões já contêm o grab que as sustenta.
  const grabId = grab && !specialId ? GRAB_IDS[grab] : null;
  const baseId = r.maxYaw >= 40 && rot < FAKIE_MIN ? (r.peakYaw >= 0 ? 'fs-air' : 'bs-air') : null;

  let primary: Maneuver;
  let secondary: Maneuver | null = null;
  let name: string;
  if (rotId) {
    primary = byId(rotId);
    const second = specialId ?? grabId;
    secondary = second ? byId(second) : null;
    name = secondary ? `${primary.name} ${secondary.grab && !secondary.extension ? GRAB_LABELS[secondary.grab] : secondary.name}` : primary.name;
  } else if (specialId || grabId) {
    primary = byId((specialId ?? grabId)!);
    secondary = baseId ? byId(baseId) : null;
    name = secondary ? `${directionLabel(secondary)} ${primary.name}` : primary.name;
  } else {
    primary = byId(baseId ?? 'straight-air');
    name = primary.name;
  }
  const difficulty = Math.min(100, Math.round(primary.difficulty + (secondary ? secondary.difficulty * 0.45 : 0)));
  const baseScore = Math.round(primary.baseScore + (secondary ? secondary.baseScore * 0.5 : 0));
  const family: ManeuverFamily = secondary && rotId ? 'combo' : primary.family;
  return {
    primary,
    secondary,
    name,
    family,
    difficulty,
    baseScore,
    rotation: Math.round(rot),
    direction: yawAbs < 40 ? 'nenhuma' : fs ? 'frontside' : 'backside',
    experimental: primary.experimental || !!secondary?.experimental,
    ids: [primary.id, ...(secondary ? [secondary.id] : [])],
  };
}
