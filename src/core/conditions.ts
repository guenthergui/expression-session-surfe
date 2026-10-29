import { findLocation } from '../data/locations';
import { clamp, type Rng } from './rng';
import type { Conditions, WindType } from './types';

/** O que o jogador escolhe na tela de preparação. */
export interface HeatSetup {
  boardId: string;
  finId: string;
  locationId: string;
  /** Previsão escolhida. Cada onda varia um pouco em torno dela. */
  height: number;
  power: number;
  windType: WindType;
  windSpeed: number;
  sectionQuality: number;
}

export const STEPS = { height: 0.25, power: 5, windSpeed: 5, sectionQuality: 5 } as const;

function roundStep(v: number, step: number): number {
  return Math.round(v / step) * step;
}

export function defaultSetup(locationId = 'pico-leste'): HeatSetup {
  const loc = findLocation(locationId);
  const mid = (r: [number, number], step: number) => roundStep((r[0] + r[1]) / 2, step);
  return {
    boardId: 'standard',
    finId: 'thruster',
    locationId: loc.id,
    height: mid(loc.heightRange, STEPS.height),
    power: mid(loc.powerRange, STEPS.power),
    windType: loc.windTypes[0],
    windSpeed: loc.windAffects ? 10 : 0,
    sectionQuality: mid(loc.sectionRange, STEPS.sectionQuality),
  };
}

/** Ajusta a previsão escolhida para ficar dentro dos limites do local. */
export function clampSetup(setup: HeatSetup): HeatSetup {
  const loc = findLocation(setup.locationId);
  const fit = (v: number, r: [number, number], step: number) => clamp(roundStep(v, step), r[0], r[1]);
  return {
    ...setup,
    locationId: loc.id,
    height: fit(setup.height, loc.heightRange, STEPS.height),
    power: fit(setup.power, loc.powerRange, STEPS.power),
    windType: loc.windTypes.includes(setup.windType) ? setup.windType : loc.windTypes[0],
    windSpeed: loc.windAffects ? fit(setup.windSpeed, loc.windSpeedRange, STEPS.windSpeed) : 0,
    sectionQuality: fit(setup.sectionQuality, loc.sectionRange, STEPS.sectionQuality),
  };
}

/** Condições de uma onda: variam um pouco em torno da previsão escolhida. */
export function generateWaveConditions(setup: HeatSetup, rng: Rng): Conditions {
  const loc = findLocation(setup.locationId);
  const jitter = (amount: number) => (rng() - 0.5) * 2 * amount;
  const height = clamp(setup.height + jitter(0.15), loc.heightRange[0], loc.heightRange[1]);
  const power = clamp(setup.power + jitter(5), loc.powerRange[0], loc.powerRange[1]);
  const windSpeed = loc.windAffects
    ? clamp(setup.windSpeed + jitter(3), loc.windSpeedRange[0], loc.windSpeedRange[1])
    : 0;
  const sectionQuality = clamp(setup.sectionQuality + jitter(loc.sectionVariance), 5, 100);
  return {
    height: Math.round(height * 100) / 100,
    power: Math.round(power),
    windType: setup.windType,
    windSpeed: Math.round(windSpeed),
    sectionQuality: Math.round(sectionQuality),
  };
}

export function sectionLabel(q: number): string {
  if (q >= 80) return 'Rampa perfeita';
  if (q >= 60) return 'Boa seção';
  if (q >= 40) return 'Seção média';
  if (q >= 20) return 'Seção fraca';
  return 'Fechando';
}
