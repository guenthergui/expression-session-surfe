import type { ManeuverDef } from '../core/types';

// Catálogo de manobras. Cada entrada descreve os componentes e o balanceamento;
// a sequência de comandos, os pesos dos atributos e as fases são gerados pelo
// motor em core/maneuvers.ts, que também recusa combinações incompatíveis.
// Para adicionar uma manobra, basta acrescentar um objeto aqui.

type Base = Omit<ManeuverDef, 'id' | 'name' | 'difficulty' | 'baseScore'>;

const real = (b: Partial<Base>): Base => ({
  family: 'aereo',
  direction: 'nenhuma',
  rotation: 0,
  axis: 'giro',
  grab: null,
  unlockLevel: 1,
  experimental: false,
  recommended: {},
  variations: [],
  restrictions: [],
  ...b,
});

export const MANEUVER_DEFS: ManeuverDef[] = [
  {
    id: 'straight-air',
    name: 'Straight Air',
    difficulty: 15,
    baseScore: 300,
    ...real({ recommended: { impulsao: 25 }, variations: ['indy-air'] }),
  },
  {
    id: 'fs-air',
    name: 'Frontside Air',
    difficulty: 20,
    baseScore: 380,
    ...real({ direction: 'frontside', recommended: { impulsao: 30, equilibrio: 25 }, variations: ['air-reverse', 'indy-air'] }),
  },
  {
    id: 'bs-air',
    name: 'Backside Air',
    difficulty: 26,
    baseScore: 440,
    ...real({ direction: 'backside', recommended: { impulsao: 30, controleAereo: 30 }, variations: ['bs-air-reverse', 'stalefish-air'] }),
  },
  {
    id: 'indy-air',
    name: 'Indy Air',
    difficulty: 32,
    baseScore: 560,
    ...real({ family: 'grab', direction: 'frontside', grab: 'indy', recommended: { amplitude: 30, controleAereo: 35 }, variations: ['air-reverse-indy'] }),
  },
  {
    id: 'air-reverse',
    name: 'Air Reverse',
    difficulty: 36,
    baseScore: 640,
    ...real({ family: 'rotacao', direction: 'frontside', rotation: 180, recommended: { rotacao: 30, equilibrio: 35 }, variations: ['air-reverse-indy', 'fs-360'] }),
  },
  {
    id: 'stalefish-air',
    name: 'Stalefish Air',
    difficulty: 38,
    baseScore: 620,
    ...real({ family: 'grab', direction: 'backside', grab: 'stalefish', recommended: { amplitude: 35, controleAereo: 35 } }),
  },
  {
    id: 'bs-air-reverse',
    name: 'Backside Air Reverse',
    difficulty: 42,
    baseScore: 700,
    ...real({ family: 'rotacao', direction: 'backside', rotation: 180, recommended: { rotacao: 35, equilibrio: 35 }, variations: ['bs-360'] }),
  },
  {
    id: 'air-reverse-indy',
    name: 'Air Reverse Indy',
    difficulty: 50,
    baseScore: 900,
    ...real({ family: 'combo', direction: 'frontside', rotation: 180, grab: 'indy', unlockLevel: 2, recommended: { rotacao: 40, controleAereo: 40 } }),
  },
  {
    id: 'fs-360',
    name: 'Frontside 360 Air',
    difficulty: 58,
    baseScore: 1000,
    ...real({
      family: 'rotacao', direction: 'frontside', rotation: 360, unlockLevel: 2,
      recommended: { rotacao: 45, amplitude: 40 }, variations: ['fs-360-mute'],
      restrictions: ['Pede onda de pelo menos 1 m'], minWaveHeight: 1.0,
    }),
  },
  {
    id: 'bs-360',
    name: 'Backside 360 Air',
    difficulty: 64,
    baseScore: 1100,
    ...real({
      family: 'rotacao', direction: 'backside', rotation: 360, unlockLevel: 2,
      recommended: { rotacao: 50, amplitude: 45 },
      restrictions: ['Pede onda de pelo menos 1 m'], minWaveHeight: 1.0,
    }),
  },
  {
    id: 'fs-360-mute',
    name: 'Frontside 360 Mute',
    difficulty: 74,
    baseScore: 1400,
    ...real({
      family: 'combo', direction: 'frontside', rotation: 360, grab: 'mute', unlockLevel: 3,
      recommended: { rotacao: 55, controleAereo: 50, amplitude: 45 },
      restrictions: ['Pede onda de pelo menos 1,25 m'], minWaveHeight: 1.25,
    }),
  },
  {
    id: 'rodeo-flip',
    name: 'Rodeo Flip',
    difficulty: 85,
    baseScore: 1800,
    ...real({
      family: 'experimental', direction: 'backside', rotation: 360, axis: 'flip', experimental: true,
      origin: 'Snowboard', recommended: { amplitude: 60, rotacao: 55, criatividade: 50 },
      restrictions: ['Experimental: aparece raramente', 'Pede onda de pelo menos 1,25 m'], minWaveHeight: 1.25,
    }),
  },
  {
    id: 'fs-540-melon',
    name: 'Frontside 540 Melon',
    difficulty: 92,
    baseScore: 2200,
    ...real({
      family: 'experimental', direction: 'frontside', rotation: 540, grab: 'melon', experimental: true, unlockLevel: 3,
      origin: 'Skate de rampa', recommended: { rotacao: 70, controleAereo: 60, criatividade: 55 },
      restrictions: ['Experimental: aparece raramente', 'Pede onda de pelo menos 1,5 m'], minWaveHeight: 1.5,
    }),
  },
];
