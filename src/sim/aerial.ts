import { crestOffset, faceWidth, surfaceHeight, type WaveState } from './waveField';

// Voo e saída do surfista, em metros e segundos. A aproximação (remada, drop
// e surf até o lip) fica em waveRun.ts; aqui começa no instante da decolagem.
//   1. Voo: balística simples (gravidade 9,81 m/s²) do lip até o ponto de pouso.
//   2. Saída: desce a face depois do pouso.
// O tempo de voo é fixo pela sequência de comandos (o pouso tem um tempo-alvo).
// A qualidade da decolagem e a velocidade mudam onde o surfista pousa: quanto
// melhor e mais rápido, mais perto do lip, o que exige subir mais alto no mesmo tempo.

export const GRAVITY = 9.81;
export const RIDE_OUT_TIME = 1.7;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface AerialPlan {
  launch: Vec3;
  velocity: Vec3;
  airTime: number;
  landing: Vec3;
  apex: number;
  /** Velocidade horizontal ao longo da onda. */
  speed: number;
  /** Tempo de onda em que a decolagem aconteceu. */
  launchTime: number;
}

export interface PlanInput {
  wave: WaveState;
  /** Posição e tempo de onda no instante da decolagem. */
  launch: Vec3;
  launchTime: number;
  /** Velocidade ao longo da onda na decolagem (m/s). */
  speed: number;
  airTime: number;
  /** Qualidade da decolagem, 0 a 1. */
  takeoff: number;
  amplitude: number;
  /** Velocidade de referência para o melhor aéreo (m/s). */
  topSpeed?: number;
}

function waveAt(w: WaveState, time: number): WaveState {
  return { ...w, time };
}

export function planAerial(i: PlanInput): AerialPlan {
  const w = i.wave;
  const top = i.topSpeed ?? 9;
  // Velocidade relativa: 0 lenta, 1 no máximo.
  const speedFactor = Math.min(1, Math.max(0, (i.speed - 5) / (top - 5)));
  const launch: Vec3 = { ...i.launch };
  // O pouso é medido a partir da crista (a área de aterrissagem fica logo abaixo do lip).
  const sL = 0.7 + (1 - i.takeoff) * 1.2 + (1 - i.amplitude / 100) * 0.4 + (1 - speedFactor) * 0.5;
  const xL = launch.x + (i.speed * 0.95 + i.takeoff * 0.6) * i.airTime;
  const wL = waveAt(w, i.launchTime + i.airTime);
  const zL = crestOffset(wL, xL) + sL;
  const landing: Vec3 = { x: xL, y: surfaceHeight(wL, xL, zL) + 0.04, z: zL };
  const T = i.airTime;
  const velocity: Vec3 = {
    x: (landing.x - launch.x) / T,
    y: (landing.y - launch.y + (GRAVITY * T * T) / 2) / T,
    z: (landing.z - launch.z) / T,
  };
  const apex = launch.y + (velocity.y * velocity.y) / (2 * GRAVITY);
  return { launch, velocity, airTime: T, landing, apex, speed: i.speed, launchTime: i.launchTime };
}

function smooth(u: number): number {
  const t = Math.min(1, Math.max(0, u));
  return t * t * (3 - 2 * t);
}

/** Posição no voo, com t de 0 até airTime. */
export function airPosition(plan: AerialPlan, t: number): Vec3 {
  const v = plan.velocity;
  return {
    x: plan.launch.x + v.x * t,
    y: plan.launch.y + v.y * t - (GRAVITY * t * t) / 2,
    z: plan.launch.z + v.z * t,
  };
}

export function airVelocity(plan: AerialPlan, t: number): Vec3 {
  return { x: plan.velocity.x, y: plan.velocity.y - GRAVITY * t, z: plan.velocity.z };
}

/**
 * Posição na saída (t desde o pouso), descendo a face. keep é a fração da
 * velocidade que sobra depois do impacto: um pouso instável perde mais.
 */
export function rideOutPosition(plan: AerialPlan, w: WaveState, t: number, waveTime: number, keep = 0.85): Vec3 {
  const u = Math.min(1, t / RIDE_OUT_TIME);
  const x = plan.landing.x + Math.max(4.5, plan.speed * keep) * t;
  const sLand = plan.landing.z - crestOffset(waveAt(w, plan.launchTime + plan.airTime), plan.landing.x);
  const z = crestOffset(waveAt(w, waveTime), x) + sLand + (faceWidth(w) * 0.9 - sLand) * smooth(u);
  return { x, y: surfaceHeight(waveAt(w, waveTime), x, z) + 0.04, z };
}
