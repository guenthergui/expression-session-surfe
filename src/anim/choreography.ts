import type { GrabId, ManeuverComponents } from '../core/types';
import type { Keyframe, PoseName } from './poses';

// Coreografia de cada aéreo: a sequência de poses no ar, o sentido do giro,
// quanto os ombros enrolam na compressão e onde a mão segura a prancha.
// Cada manobra tem a sua mecânica; elas compartilham componentes (compressão,
// extensão, preparação do pouso), mas não uma animação inteira.
//
// Sentido do giro na base do jogo (de frente para a onda, pé direito à frente):
//   - frontside: o peito lidera, abrindo para o bico (para a direita na tela);
//   - backside: as costas lideram, o surfista gira "cego" olhando por cima do
//     ombro de trás (para a esquerda na tela).
// Para adicionar um aéreo novo, basta criar uma entrada em choreoFor.

export type ChoreoId =
  | 'straight'
  | 'fsAir'
  | 'bsAir'
  | 'fsReverse'
  | 'bsReverse'
  | 'fs360'
  | 'bs360'
  | 'rodeo';

export interface Choreo {
  id: ChoreoId;
  label: string;
  /** −1 frontside (peito para o bico), +1 backside; 0 sem giro. */
  spinSign: number;
  /** Quanto os ombros enrolam ao contrário do giro durante a compressão (graus). */
  windup: number;
  /** Os ombros adiantam o quadril em tanto tempo (s). */
  shoulderLead: number;
  keys(airTime: number, moveStart: number, moveEnd: number, grab: GrabId | null, grabAt: number): Keyframe[];
}

/** Onde a mão segura cada grab, no referencial de base da prancha. */
export interface GrabContact {
  hand: 'frente' | 'tras';
  /** x relativo ao ponto médio entre os pés (m). */
  dx: number;
  /** Borda: +1 dedos, −1 calcanhares. */
  rail: 1 | -1;
}

export const GRAB_CONTACT: Record<GrabId, GrabContact> = {
  // Entre os pés, mais perto do pé de trás.
  indy: { hand: 'tras', dx: -0.06, rail: 1 },
  // Entre os pés, mais perto do pé da frente (a mão da frente cruza o corpo).
  mute: { hand: 'frente', dx: 0.07, rail: 1 },
  // Por trás da perna da frente.
  melon: { hand: 'frente', dx: 0.06, rail: -1 },
  // Por trás da perna de trás, perto da rabeta.
  stalefish: { hand: 'tras', dx: -0.22, rail: -1 },
};

export const GRAB_POSE: Record<GrabId, PoseName> = {
  indy: 'grabIndy',
  mute: 'grabMute',
  melon: 'grabMelon',
  stalefish: 'grabStalefish',
};

/** Fim da manobra e início da preparação do pouso, sem troca brusca. */
function prepAt(airTime: number, holdEnd: number): number {
  return Math.min(airTime - 0.05, Math.max(holdEnd + 0.18, airTime - 0.3));
}

/**
 * Insere o grab: a pose chega um pouco antes do comando e fica até a mão
 * soltar a borda, com tempo de transição suficiente de cada lado.
 */
function withGrab(keys: Keyframe[], grab: GrabId | null, grabAt: number, airTime: number): Keyframe[] {
  if (!grab) return keys;
  const start = Math.max(0.22, grabAt - 0.1);
  const before = keys.filter((k) => k.t <= start - 0.12);
  const t1 = Math.max(start + 0.02, before[before.length - 1].t + 0.12);
  const t2 = Math.max(t1 + 0.1, airTime - 0.3);
  const after = keys.filter((k) => k.t >= t2 + 0.12);
  return [...before, { t: t1, pose: GRAB_POSE[grab] }, { t: t2, pose: GRAB_POSE[grab] }, ...after];
}

const CHOREOS: Record<ChoreoId, Choreo> = {
  straight: {
    id: 'straight',
    label: 'Straight Air',
    spinSign: 0,
    windup: 0,
    shoulderLead: 0,
    keys(T, ms, me, grab, ga) {
      const prep = prepAt(T, grab ? ga + 0.22 : 0.4);
      return withGrab([
        { t: 0, pose: 'compressao' },
        { t: 0.1, pose: 'extensao' },
        { t: Math.min(T * 0.4, 0.38), pose: 'straightFlutua' },
        { t: prep, pose: 'preparaPouso' },
        { t: T, pose: 'preparaPouso' },
      ], grab, ga, T);
    },
  },
  fsAir: {
    id: 'fsAir',
    label: 'Frontside Air',
    spinSign: -1,
    windup: 8,
    shoulderLead: 0.05,
    keys(T, ms, me, grab, ga) {
      const prep = prepAt(T, grab ? ga + 0.22 : Math.max(0.42, ms + 0.1));
      return withGrab([
        { t: 0, pose: 'compressao' },
        { t: 0.11, pose: 'fsExtensao' },
        { t: Math.max(0.3, ms), pose: 'fsPico' },
        { t: Math.max(0.36, prep - 0.1), pose: 'fsPico' },
        { t: prep, pose: 'preparaPouso' },
        { t: T, pose: 'preparaPouso' },
      ], grab, ga, T);
    },
  },
  bsAir: {
    id: 'bsAir',
    label: 'Backside Air',
    spinSign: 1,
    windup: 10,
    shoulderLead: 0.06,
    keys(T, ms, me, grab, ga) {
      const prep = prepAt(T, grab ? ga + 0.22 : Math.max(0.42, ms + 0.1));
      return withGrab([
        { t: 0, pose: 'compressao' },
        { t: 0.12, pose: 'bsExtensao' },
        { t: Math.max(0.32, ms), pose: 'bsPico' },
        { t: Math.max(0.38, prep - 0.1), pose: 'bsPico' },
        { t: prep, pose: 'preparaPouso' },
        { t: T, pose: 'preparaPouso' },
      ], grab, ga, T);
    },
  },
  fsReverse: {
    id: 'fsReverse',
    label: 'Frontside Air Reverse',
    spinSign: -1,
    windup: 22,
    shoulderLead: 0.07,
    keys(T, ms, me, grab, ga) {
      const prep = prepAt(T, grab ? Math.max(me, ga) + 0.12 : me + 0.05);
      return withGrab([
        { t: 0, pose: 'compressao' },
        { t: 0.1, pose: 'fsExtensao' },
        { t: Math.max(0.2, ms - 0.12), pose: 'fsReverseInicio' },
        { t: Math.max(0.3, ms + 0.08), pose: 'reverseMeio' },
        { t: Math.max(0.36, me + 0.05), pose: 'giroAbreFinal' },
        { t: prep, pose: 'preparaPouso' },
        { t: T, pose: 'preparaPouso' },
      ], grab, ga, T);
    },
  },
  bsReverse: {
    id: 'bsReverse',
    label: 'Backside Air Reverse',
    spinSign: 1,
    windup: 25,
    shoulderLead: 0.08,
    keys(T, ms, me, grab, ga) {
      const prep = prepAt(T, grab ? Math.max(me, ga) + 0.12 : me + 0.05);
      return withGrab([
        { t: 0, pose: 'compressao' },
        { t: 0.12, pose: 'bsExtensao' },
        { t: Math.max(0.2, ms - 0.12), pose: 'bsReverseInicio' },
        { t: Math.max(0.3, ms + 0.08), pose: 'reverseMeio' },
        { t: Math.max(0.36, me + 0.05), pose: 'giroAbreFinal' },
        { t: prep, pose: 'preparaPouso' },
        { t: T, pose: 'preparaPouso' },
      ], grab, ga, T);
    },
  },
  fs360: {
    id: 'fs360',
    label: 'Frontside 360',
    spinSign: -1,
    windup: 35,
    shoulderLead: 0.08,
    keys(T, ms, me, grab, ga) {
      const prep = prepAt(T, grab ? Math.max(me, ga) + 0.12 : me + 0.12);
      return withGrab([
        { t: 0, pose: 'compressao' },
        { t: 0.1, pose: 'extensao' },
        { t: Math.max(0.2, ms - 0.14), pose: 'fs360Abre' },
        { t: Math.max(0.3, ms + 0.1), pose: 'giroFechado' },
        { t: Math.max(0.34, me - 0.02), pose: 'giroFechado' },
        { t: Math.max(0.4, me + 0.2), pose: 'giroAbreFinal' },
        { t: prep, pose: 'preparaPouso' },
        { t: T, pose: 'preparaPouso' },
      ], grab, ga, T);
    },
  },
  bs360: {
    id: 'bs360',
    label: 'Backside 360',
    spinSign: 1,
    windup: 40,
    shoulderLead: 0.1,
    keys(T, ms, me, grab, ga) {
      const prep = prepAt(T, grab ? Math.max(me, ga) + 0.12 : me + 0.12);
      return withGrab([
        { t: 0, pose: 'compressao' },
        { t: 0.12, pose: 'bsExtensao' },
        { t: Math.max(0.2, ms - 0.14), pose: 'bs360Abre' },
        { t: Math.max(0.3, ms + 0.1), pose: 'giroFechado' },
        { t: Math.max(0.34, me - 0.02), pose: 'giroFechado' },
        { t: Math.max(0.4, me + 0.2), pose: 'giroAbreFinal' },
        { t: prep, pose: 'preparaPouso' },
        { t: T, pose: 'preparaPouso' },
      ], grab, ga, T);
    },
  },
  rodeo: {
    id: 'rodeo',
    label: 'Rodeo Flip',
    spinSign: 1,
    windup: 30,
    shoulderLead: 0.1,
    keys(T, ms, me, grab, ga) {
      const prep = prepAt(T, me + 0.12);
      return withGrab([
        { t: 0, pose: 'compressao' },
        { t: 0.12, pose: 'bsExtensao' },
        { t: Math.max(0.2, ms - 0.12), pose: 'bs360Abre' },
        { t: Math.max(0.3, ms + 0.08), pose: 'giroFechado' },
        { t: Math.max(0.34, me), pose: 'giroFechado' },
        { t: Math.max(0.4, me + 0.18), pose: 'giroAbreFinal' },
        { t: prep, pose: 'preparaPouso' },
        { t: T, pose: 'preparaPouso' },
      ], grab, ga, T);
    },
  },
};

/** Escolhe a coreografia pelos componentes da manobra (não pelo nome). */
export function choreoFor(m: Pick<ManeuverComponents, 'direction' | 'rotation' | 'axis'>): Choreo {
  const bs = m.direction === 'backside';
  if (m.axis === 'flip') return CHOREOS.rodeo;
  if (m.rotation >= 360) return bs ? CHOREOS.bs360 : CHOREOS.fs360;
  if (m.rotation >= 180) return bs ? CHOREOS.bsReverse : CHOREOS.fsReverse;
  if (m.direction === 'nenhuma') return CHOREOS.straight;
  return bs ? CHOREOS.bsAir : CHOREOS.fsAir;
}

export function allChoreos(): Choreo[] {
  return Object.values(CHOREOS);
}
