import * as THREE from 'three';
import { findManeuver } from '../src/core/maneuvers';
import { AerialAnimator, type AnimFrame, type BoardShapeInfo } from '../src/game/AerialAnimator';
import { AutoPilot, planFor, type PilotPlan } from '../src/sim/autopilot';
import { WaveRun, type RunEvent, type RunParams } from '../src/sim/waveRun';
import { createWave, type WaveState } from '../src/sim/waveField';

// Ferramentas comuns dos testes: uma prancha com o mesmo formato do modelo 3D
// e uma onda inteira surfada pelo piloto automático, com as mesmas teclas
// (intenções) que o jogador aperta.

// Prancha de 5'10" com kick na rabeta e no bico, como o modelo 3D. Usa `this`
// nos métodos, como a BoardModel, para pegar chamadas sem o objeto.
export const L = 1.778;
export const board: BoardShapeInfo = {
  shape: { length: L, width: 0.47, thickness: 0.057 },
  deckY(x: number) {
    const u = x / this.shape.length + 0.5;
    const tail = u < 0.35 ? 0.05 * (1 - u / 0.35) ** 2 : 0;
    const nose = u > 0.5 ? 0.115 * ((u - 0.5) / 0.5) ** 2.3 : 0;
    return 0.034 + tail + nose;
  },
  halfWidth: (u: number) => 0.235 * Math.sin(Math.PI * Math.min(0.98, Math.max(0.1, u))),
};

export function testWave(): WaveState {
  return createWave({ height: 1.6, power: 65, peelSpeed: 3.8 + 65 / 40 });
}

export function params(level = 60, extra: Partial<RunParams> = {}): RunParams {
  return {
    forca: level, impulsao: level, amplitude: level, rotacao: level, controleAereo: level, equilibrio: level, leituraOnda: level,
    fatigue: 0,
    equip: { impulsao: 1, rotacao: 1, grab: 1, aterrissagem: 1 },
    conditions: 1,
    sectionQuality: 60,
    rng: () => 0.5,
    ...extra,
  };
}

export interface RideOptions {
  level?: number;
  dt?: number;
  plan?: Partial<PilotPlan>;
  /** Aéreos que o piloto tenta (padrão 1). */
  attempts?: number;
  /** Para depois de tantos segundos do último pouso (padrão 1,5). */
  after?: number;
  /** Simula também a animação. */
  animate?: boolean;
  extra?: Partial<RunParams>;
}

export interface RideStep {
  t: number;
  run: WaveRun;
  f: AnimFrame | null;
  a: AerialAnimator | null;
  events: RunEvent[];
}

/** Surfa uma onda com o piloto automático fazendo o aéreo pedido. */
export function ride(id: string, opts: RideOptions = {}, fn?: (s: RideStep) => void) {
  const m = findManeuver(id)!;
  const wave = testWave();
  const run = new WaveRun(wave, params(opts.level ?? 60, opts.extra));
  const pilot = new AutoPilot({ ...planFor(m), ...opts.plan });
  pilot.dropAt = 0.5;
  pilot.maxAttempts = opts.attempts ?? 1;
  const a = opts.animate === false ? null : new AerialAnimator(wave, board, run);
  const dt = opts.dt ?? 1 / 60;
  const events: RunEvent[] = [];
  const after = opts.after ?? 1.5;
  let t = 0;
  while (t < 34) {
    t += dt;
    run.setInput(pilot.input(run));
    run.update(dt);
    const ev = run.drain();
    events.push(...ev);
    const f = a ? a.update(t, dt) : null;
    fn?.({ t, run, f, a, events: ev });
    if (run.state === 'fallen' && run.t - run.fallAt! > 2) break;
    if (run.state === 'finished') break;
    if (pilot.attempts >= pilot.maxAttempts && run.lastLanding && run.state === 'riding' && run.t - run.lastLanding.t > after) break;
  }
  const lands = events.filter((e): e is Extract<RunEvent, { kind: 'land' }> => e.kind === 'land');
  return { run, animator: a, events, lands, pilot };
}

/** Ponto do mundo no referencial da prancha. */
export function toBoard(f: AnimFrame, p: THREE.Vector3) {
  return p.clone().sub(f.boardPos).applyQuaternion(f.boardQuat.clone().invert());
}

/** Em pé na prancha (fora da remada, do levantar e da queda). */
export const standing = (f: AnimFrame) => !f.falling && f.phase !== 'remada' && f.phase !== 'drop';
