import { MANEUVER_DEFS } from '../data/maneuvers';
import type {
  Attributes,
  CommandKey,
  CommandStep,
  GrabId,
  Hand,
  Maneuver,
  ManeuverDef,
  ManeuverFamily,
  PhaseMods,
} from './types';

/** Mão que faz cada grab. A mão de trás usa Z e a da frente usa X. */
export const GRAB_HAND: Record<GrabId, Hand> = { indy: 'tras', stalefish: 'tras', mute: 'frente', melon: 'frente' };
export const HAND_KEY: Record<Hand, CommandKey> = { tras: 'Z', frente: 'X' };
export const GRAB_LABELS: Record<GrabId, string> = { indy: 'Indy', mute: 'Mute', melon: 'Melon', stalefish: 'Stalefish' };

/** Grabs possíveis em cada direção: o corpo não alcança todas as bordas em qualquer giro. */
export const GRABS_BY_DIRECTION: Record<'frontside' | 'backside' | 'nenhuma', GrabId[]> = {
  frontside: ['indy', 'mute', 'melon'],
  backside: ['stalefish', 'melon', 'indy'],
  nenhuma: ['indy', 'mute'],
};

export const KEY_SYMBOLS: Record<CommandKey, string> = {
  SPACE: 'Espaço',
  UP: '↑',
  DOWN: '↓',
  LEFT: '←',
  RIGHT: '→',
  Z: 'Z',
  X: 'X',
};

export const FAMILY_LABELS: Record<ManeuverFamily, string> = {
  aereo: 'Aéreo básico',
  rotacao: 'Rotação',
  grab: 'Grab',
  combo: 'Rotação + grab',
  experimental: 'Experimental',
};

export const ROTATION_GAP = 0.32;

/** Gera a sequência de comandos a partir dos componentes da manobra. */
export function buildSequence(def: ManeuverDef): CommandStep[] {
  const steps: CommandStep[] = [{ phase: 'impulsao', key: 'SPACE', time: 0, essential: true }];
  const dirKey: CommandKey = def.direction === 'backside' ? 'LEFT' : 'RIGHT';
  let t = 0;

  if (def.rotation === 0 && def.direction !== 'nenhuma') {
    // Ajuste de direção no ar: é o que diferencia o frontside do backside.
    t = 0.3;
    steps.push({ phase: 'impulsao', key: dirKey, time: t, essential: false });
  }

  const halfTurns = def.rotation / 180;
  for (let i = 0; i < halfTurns; i++) {
    t = 0.42 + i * ROTATION_GAP;
    // No flip, cada meia volta alterna "jogar o corpo" (↑) e a direção.
    const key: CommandKey = def.axis === 'flip' && i % 2 === 0 ? 'UP' : dirKey;
    steps.push({ phase: 'rotacao', key, time: t, essential: true });
  }

  if (def.grab) {
    t = halfTurns > 0 ? t + ROTATION_GAP : 0.5;
    steps.push({ phase: 'grab', key: HAND_KEY[GRAB_HAND[def.grab]], time: t, essential: false });
  }

  steps.push({ phase: 'aterrissagem', key: 'DOWN', time: Math.max(0.95, t + 0.45), essential: true });
  return steps;
}

function normalize<T extends string>(raw: Partial<Record<T, number>>): Partial<Record<T, number>> {
  const total = Object.values<number>(raw as Record<T, number>).reduce((a, b) => a + b, 0);
  const out: Partial<Record<T, number>> = {};
  for (const k of Object.keys(raw) as T[]) out[k] = (raw[k] ?? 0) / total;
  return out;
}

/** Atributos relevantes para a manobra, com pesos que somam 1. */
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
  if (def.experimental) w.criatividade = 0.2;
  return normalize(w);
}

export function buildPhaseWeights(def: ManeuverDef): PhaseMods {
  const n = normalize<keyof PhaseMods>({
    impulsao: 0.3,
    rotacao: def.rotation > 0 ? 0.3 : 0,
    grab: def.grab ? 0.15 : 0,
    aterrissagem: 0.3,
  });
  return { impulsao: n.impulsao ?? 0, rotacao: n.rotacao ?? 0, grab: n.grab ?? 0, aterrissagem: n.aterrissagem ?? 0 };
}

/** Lista os problemas de uma definição. Lista vazia significa válida. */
export function validateManeuver(def: ManeuverDef): string[] {
  const errors: string[] = [];
  if (!def.id) errors.push('sem id');
  if (def.rotation < 0 || def.rotation > 720 || def.rotation % 180 !== 0)
    errors.push('rotação deve ser múltiplo de 180 entre 0 e 720');
  if (def.rotation > 0 && def.direction === 'nenhuma') errors.push('rotação exige direção');
  if (def.axis === 'flip' && !def.experimental) errors.push('flip só existe como experimental');
  if (def.axis === 'flip' && def.rotation === 0) errors.push('flip exige rotação');
  if (def.axis === 'flip' && def.grab) errors.push('flip com grab não é suportado nesta versão');
  if (def.rotation > 360 && !def.experimental) errors.push('acima de 360 só como experimental');
  if (def.grab && !GRABS_BY_DIRECTION[def.direction].includes(def.grab))
    errors.push(`grab ${def.grab} não combina com a direção ${def.direction}`);
  if (def.difficulty < 1 || def.difficulty > 100) errors.push('dificuldade fora de 1 a 100');
  if (def.baseScore <= 0) errors.push('pontuação-base deve ser positiva');
  if (def.unlockLevel < 1) errors.push('nível de desbloqueio inválido');
  const familyOk: Record<ManeuverFamily, boolean> = {
    aereo: def.rotation === 0 && !def.grab && !def.experimental,
    rotacao: def.rotation > 0 && !def.grab && !def.experimental,
    grab: def.rotation === 0 && !!def.grab && !def.experimental,
    combo: def.rotation > 0 && !!def.grab && !def.experimental,
    experimental: def.experimental,
  };
  if (!familyOk[def.family]) errors.push(`componentes não combinam com a família ${def.family}`);
  return errors;
}

/**
 * Confere as variações declaradas: cada uma precisa existir e ser esta manobra
 * com mais rotação e/ou um grab, na mesma direção (ou partindo de um aéreo reto).
 */
export function validateVariations(defs: ManeuverDef[]): string[] {
  const errors: string[] = [];
  for (const d of defs) {
    for (const vid of d.variations) {
      const v = defs.find((x) => x.id === vid);
      if (!v) {
        errors.push(`${d.id}: variação ${vid} não existe`);
        continue;
      }
      const sameDir = d.direction === 'nenhuma' || v.direction === d.direction;
      const adds = v.rotation > d.rotation || (!d.grab && !!v.grab);
      const keeps = v.rotation >= d.rotation && (!d.grab || v.grab === d.grab);
      if (!sameDir || !adds || !keeps) errors.push(`${d.id}: ${vid} não é uma variação compatível`);
    }
  }
  return errors;
}

export function buildManeuver(def: ManeuverDef): Maneuver {
  const errors = validateManeuver(def);
  if (errors.length) throw new Error(`Manobra inválida "${def.id}": ${errors.join('; ')}`);
  return {
    ...def,
    weights: buildWeights(def),
    phaseWeights: buildPhaseWeights(def),
    sequence: buildSequence(def),
  };
}

const variationErrors = validateVariations(MANEUVER_DEFS);
if (variationErrors.length) throw new Error(`Catálogo inválido: ${variationErrors.join('; ')}`);

export const MANEUVERS: Maneuver[] = MANEUVER_DEFS.map(buildManeuver);

export function findManeuver(id: string): Maneuver | undefined {
  return MANEUVERS.find((m) => m.id === id);
}

export function directionLabel(m: ManeuverDef): string {
  return m.direction === 'nenhuma' ? 'Reto' : m.direction === 'frontside' ? 'Frontside' : 'Backside';
}
