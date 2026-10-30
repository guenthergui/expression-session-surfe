import { clamp } from '../core/rng';
import { S_LIP } from './surfPhysics';

// Preparação e projeção do aéreo.
//
// Segurar o espaço comprime o corpo (centro de massa baixo, peso no pé de
// trás) e trava a linha; ← e → nesse momento carregam a rotação. Soltar no lip
// é o pop. A velocidade vertical de saída soma três partes:
//   1. a subida: componente vertical da velocidade na face, que depende da
//      velocidade e do ângulo de ataque (subir na vertical projeta mais alto);
//   2. as pernas: impulsão, qualidade da compressão e tempo do pop;
//   3. o lip: a onda joga a prancha para cima, mais forte na parte crítica.
// Longe do lip, sem velocidade ou sem estar subindo, não há aéreo.

export const V_MIN_AIR = 4.6;
/** Distância máxima abaixo do lip para o pop ainda virar aéreo (m). */
export const LIP_REACH = 0.7;
/** Compressão completa (s). */
export const FULL_COMPRESS = 0.3;

export interface TakeoffParams {
  impulsao: number;
  amplitude: number;
  /** Prancha + quilhas, fase de impulsão (pontos). */
  equipImpulse: number;
  /** Multiplicador das condições (vento, seção), perto de 1. */
  conditions: number;
  power: number;
  sectionQuality: number;
}

export interface LaunchState {
  speed: number;
  /** Direção na face (rad): +π/2 subindo direto para o lip. */
  dir: number;
  s: number;
  /** Velocidade vertical recente da prancha subindo a face (m/s). */
  vyFace: number;
  /** Tempo segurando o espaço (s). */
  compressHeld: number;
  /** Carga de rotação (−1 backside a +1 frontside). */
  windup: number;
  criticality: number;
}

export type LaunchRefusal = 'velocidade' | 'posicao' | 'descendo';

export interface Launch {
  ok: true;
  /** Velocidades de saída (m/s): x ao longo da onda, y vertical, s na direção da praia (− para trás do lip). */
  vx: number;
  vy: number;
  vs: number;
  /** Qualidades de 0 a 1. */
  compress: number;
  timing: number;
  /** Ângulo de ataque em graus: 90 subindo na vertical, perto de 20 numa diagonal aberta. */
  approachDeg: number;
  speed: number;
  criticality: number;
  windup: number;
}

export function compressQuality(held: number): number {
  const u = clamp(held / FULL_COMPRESS, 0, 1);
  const ramp = u * u * (3 - 2 * u);
  // Segurar demais cansa as pernas e o pop perde força.
  const late = held > 1.4 ? clamp(1 - (held - 1.4) * 0.45, 0.6, 1) : 1;
  return ramp * late;
}

/** Tempo do pop: perfeito logo abaixo do lip, pior quanto mais cedo. */
export function popTiming(s: number): number {
  const d = s - S_LIP;
  if (d <= 0.22) return 1;
  return clamp(1 - ((d - 0.22) / (LIP_REACH - 0.22)) * 0.55, 0.4, 1);
}

export function tryLaunch(st: LaunchState, p: TakeoffParams): Launch | { ok: false; reason: LaunchRefusal } {
  const climb = Math.sin(st.dir);
  if (st.s > S_LIP + LIP_REACH) return { ok: false, reason: 'posicao' };
  if (climb < 0.18) return { ok: false, reason: 'descendo' };
  if (st.speed < V_MIN_AIR) return { ok: false, reason: 'velocidade' };
  const compress = compressQuality(st.compressHeld);
  const timing = popTiming(st.s);
  const legs = (0.78 + p.impulsao * 0.008 + p.equipImpulse * 0.045) * compress * (0.6 + 0.4 * timing);
  const lip = (0.3 + p.power / 120) * st.criticality * (0.7 + 0.3 * p.sectionQuality / 100);
  const face = Math.max(0, st.vyFace) * 0.4 + st.speed * climb * 0.2;
  const amp = (0.86 + p.amplitude / 260) * p.conditions;
  const vy = (face + legs + lip) * amp;
  return {
    ok: true,
    vx: st.speed * Math.cos(st.dir) * 0.92,
    vy,
    // Ainda indo um pouco por cima do lip; a onda alcança a prancha no voo.
    vs: -st.speed * climb * 0.22,
    compress,
    timing,
    approachDeg: (Math.asin(clamp(climb, 0, 1)) * 180) / Math.PI,
    speed: st.speed,
    criticality: st.criticality,
    windup: st.windup,
  };
}
