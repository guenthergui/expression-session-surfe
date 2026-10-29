import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { POSES, airKeys, landingKeys, sampleSequence } from '../src/anim/poses';
import { findManeuver } from '../src/core/maneuvers';
import { defaultSave, sanitizeSave } from '../src/core/save';
import { AerialAnimator, type BoardShapeInfo } from '../src/game/AerialAnimator';
import { planAerial } from '../src/sim/aerial';
import { Rope } from '../src/sim/rope';
import { WaveRun } from '../src/sim/waveRun';
import { createWave } from '../src/sim/waveField';

// Prancha simplificada com as mesmas funções que o animador usa do modelo 3D.
const board: BoardShapeInfo = {
  shape: { length: 1.778, width: 0.47, thickness: 0.057 },
  deckY: () => 0.03,
  halfWidth: () => 0.2,
};

interface Sim {
  a: AerialAnimator;
  run: WaveRun;
}

function makeAnimator(id: string, results: 'perfect' | 'missRotation' = 'perfect'): Sim & { results: ('perfect' | 'miss')[] } {
  const m = findManeuver(id)!;
  const wave = createWave({ height: 1.6, power: 60 });
  const run = new WaveRun(wave, { forca: 40, controleAereo: 40, equipImpulse: 2 });
  const a = new AerialAnimator(m, wave, board, run);
  return { a, run, results: m.sequence.map((s) => (results === 'missRotation' && s.phase === 'rotacao' ? 'miss' : 'perfect')) };
}

/**
 * Joga a onda inteira como o piloto automático do jogo: rema, aperta D, segura W,
 * decola no pico da subida e segue até o fim da saída, em passos de 1/60 s.
 */
function run(sim: ReturnType<typeof makeAnimator>, outcome: 'limpa' | 'instavel' | 'queda', fn: (t: number, f: ReturnType<AerialAnimator['update']>) => void, dt = 1 / 60) {
  const { a, run: r } = sim;
  const m = a.maneuver;
  let t = 0;
  while (t < Math.min(30, a.totalTime)) {
    t += dt;
    if (r.state === 'paddling' && t > 0.5) r.pressDrop();
    if (r.state === 'riding') {
      r.setAccelerate(true);
      if (r.takeoffReady && Math.abs(r.timeToPeak()) < 0.03) {
        r.tryTakeoff();
        const track = { steps: m.sequence, results: sim.results };
        const plan = planAerial({ wave: a.wave, launch: r.position(), launchTime: t, speed: r.speed, airTime: m.sequence[m.sequence.length - 1].time, takeoff: 1, amplitude: 40, topSpeed: r.vMax });
        a.beginAir(plan, track);
      }
    }
    r.update(dt);
    fn(t, a.update(t, dt, outcome));
  }
}

describe('biblioteca de poses', () => {
  it('as sequências são contínuas (sem saltos de pose)', () => {
    const seqs = [airKeys('rotacao', 1.27, 0.42, 0.74), airKeys('grab', 0.95, 0.5, 0.5), airKeys('aereo', 0.95, 0.3, 0.3), landingKeys('limpa'), landingKeys('instavel')];
    for (const keys of seqs) {
      let prev = sampleSequence(keys, 0);
      for (let t = 0.01; t < 2.5; t += 0.01) {
        const cur = sampleSequence(keys, t);
        for (const k of Object.keys(cur) as (keyof typeof cur)[]) expect(Math.abs(cur[k] - prev[k])).toBeLessThan(0.15); // a extensão da decolagem é rápida, mas não instantânea
        prev = cur;
      }
    }
  });

  it('famílias diferentes usam movimentos diferentes', () => {
    const rot = sampleSequence(airKeys('rotacao', 1.27, 0.42, 0.74), 0.6);
    const grab = sampleSequence(airKeys('grab', 0.95, 0.5, 0.5), 0.55);
    const basic = sampleSequence(airKeys('aereo', 0.95, 0.3, 0.3), 0.45);
    expect(grab.tuck).toBeGreaterThan(basic.tuck);
    expect(rot.spread).toBeLessThan(basic.spread);
    expect(grab.grip).toBeGreaterThan(rot.grip);
  });

  it('todas as poses ficam dentro das faixas válidas', () => {
    for (const p of Object.values(POSES)) {
      expect(p.crouch).toBeGreaterThanOrEqual(0);
      expect(p.crouch).toBeLessThanOrEqual(1);
      expect(p.tuck).toBeLessThanOrEqual(1);
      expect(Math.abs(p.twist)).toBeLessThan(1);
    }
  });
});

/** Ponto do mundo no referencial da prancha. */
function toBoard(f: ReturnType<AerialAnimator['update']>, p: THREE.Vector3) {
  return p.clone().sub(f.boardPos).applyQuaternion(f.boardQuat.clone().invert());
}

describe('remada, drop e base do surfista', () => {
  it('a onda começa com o surfista deitado e remando', () => {
    const sim = makeAnimator('straight-air');
    let checked = false;
    run(sim, 'limpa', (t, f) => {
      if (t < 0.45) {
        expect(f.phase).toBe('remada');
        // Pelve baixa sobre o deck e cabeça à frente: corpo deitado ao longo da prancha.
        const pelvis = toBoard(f, f.pose.pelvisPos);
        expect(pelvis.y).toBeLessThan(0.25);
        const spine = new THREE.Vector3(0, 1, 0).applyQuaternion(f.pose.pelvisQuat).applyQuaternion(f.boardQuat.clone().invert());
        expect(spine.x).toBeGreaterThan(0.7);
        checked = true;
      }
    });
    expect(checked).toBe(true);
  });

  it('o drop levanta o corpo sem saltos de posição', () => {
    const sim = makeAnimator('straight-air');
    let prev: THREE.Vector3 | null = null;
    let maxStep = 0;
    run(sim, 'limpa', (_, f) => {
      if (f.phase !== 'drop') return;
      const p = toBoard(f, f.pose.pelvisPos);
      if (prev) maxStep = Math.max(maxStep, p.distanceTo(prev));
      prev = p;
    });
    expect(prev).not.toBeNull();
    expect(maxStep).toBeLessThan(0.05); // no máximo 5 cm por quadro
  });

  it('em pé: pé direito à frente e costas para a câmera', () => {
    const sim = makeAnimator('straight-air');
    let checked = 0;
    run(sim, 'limpa', (_, f) => {
      if (f.phase !== 'surf' && f.phase !== 'aceleracao') return;
      const right = toBoard(f, f.pose.footRight.pos);
      const left = toBoard(f, f.pose.footLeft.pos);
      expect(right.x).toBeGreaterThan(left.x); // direito mais perto do bico
      // A frente do corpo aponta para -z (parede da onda); a câmera fica em +z.
      const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(f.pose.pelvisQuat);
      expect(facing.z).toBeLessThan(-0.5);
      checked++;
    });
    expect(checked).toBeGreaterThan(10);
  });
});

describe('animação do aéreo', () => {
  it('os pés ficam presos ao deck em toda a manobra (sem queda)', () => {
    const sim = makeAnimator('fs-360');
    run(sim, 'limpa', (_, f) => {
      if (f.phase === 'remada' || f.phase === 'drop') return;
      // O pé deve estar no plano do deck da prancha, a no máximo 1 cm.
      const local = toBoard(f, f.pose.footRight.pos);
      expect(Math.abs(local.y - board.deckY(0, 0))).toBeLessThan(0.01);
      expect(Math.abs(local.x - 0.24)).toBeLessThan(0.01);
    });
  });

  it('o corpo lidera o giro e a prancha segue com atraso limitado', () => {
    const a = makeAnimator('fs-360');
    let maxLag = 0;
    let lead = false;
    run(a, 'limpa', (_, f) => {
      maxLag = Math.max(maxLag, Math.abs(f.bodyBoardLag));
      if (f.bodyBoardLag > 3) lead = true;
    });
    expect(lead).toBe(true);
    expect(maxLag).toBeLessThanOrEqual(50);
  });

  it('a prancha sobe em direção ao corpo quando ele encolhe no grab', () => {
    const a = makeAnimator('indy-air');
    let minGap = Infinity;
    let startGap = 0;
    run(a, 'limpa', (t, f) => {
      const gap = f.pose.pelvisPos.distanceTo(f.boardPos);
      if (f.airborne && startGap === 0) startGap = gap;
      if (f.airborne) minGap = Math.min(minGap, gap);
    });
    expect(minGap).toBeLessThan(startGap - 0.1);
  });

  it('sem os comandos de rotação a prancha não completa o giro', () => {
    const ok = makeAnimator('air-reverse');
    const miss = makeAnimator('air-reverse', 'missRotation');
    const yaw = (sim: ReturnType<typeof makeAnimator>) => {
      let last = 0;
      run(sim, 'limpa', (t, f) => {
        if (f.airborne && t < sim.a.airEnd - 0.03) last = new THREE.Euler().setFromQuaternion(f.boardQuat, 'YXZ').y;
      });
      return Math.abs(last);
    };
    expect(yaw(ok)).toBeGreaterThan(2.5); // perto de 180°
    expect(yaw(miss)).toBeLessThan(0.6);
  });

  it('na queda corpo e prancha se separam', () => {
    const a = makeAnimator('air-reverse', 'missRotation');
    let maxGap = 0;
    run(a, 'queda', (_, f) => {
      if (f.falling) maxGap = Math.max(maxGap, f.pose.pelvisPos.distanceTo(f.boardPos));
    });
    expect(maxGap).toBeGreaterThan(1);
  });

  it('a animação depende do tempo, não da taxa de quadros', () => {
    // Mesmo instante da onda (2,5 s), simulado a 30 e a 120 quadros por segundo.
    const sample = (fps: number) => {
      const sim = makeAnimator('fs-360');
      let pos = new THREE.Vector3();
      let done = false;
      run(sim, 'limpa', (t, f) => {
        if (!done && t >= 2.5 - 1e-9) {
          pos = f.boardPos.clone();
          done = true;
        }
      }, 1 / fps);
      return pos;
    };
    expect(sample(30).distanceTo(sample(120))).toBeLessThan(0.15);
  });
});

describe('leash', () => {
  it('fica preso nas pontas, estável e sem passar do comprimento folgado', () => {
    const rope = new Rope(1.83, 16);
    const a = { x: 0, y: 1, z: 0 };
    const b = { x: 0.6, y: 0.9, z: 0.2 };
    rope.reset(a, b);
    for (let i = 0; i < 400; i++) {
      const t = i / 60;
      const bb = { x: 0.6 + Math.sin(t * 3) * 0.3, y: 0.9, z: 0.2 + Math.cos(t * 2) * 0.2 };
      rope.step(1 / 60, a, bb, () => 0);
      for (const p of rope.points) {
        expect(Number.isFinite(p.x + p.y + p.z)).toBe(true);
        expect(p.y).toBeGreaterThanOrEqual(0);
      }
      expect(rope.points[0]).toEqual(a);
      expect(rope.points[rope.count - 1]).toEqual(bb);
      // Com folga, a corda pende entre as pontas (cada trecho no máximo do tamanho do segmento + tolerância).
      for (let k = 0; k < rope.count - 1; k++) {
        const p = rope.points[k];
        const q = rope.points[k + 1];
        expect(Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z)).toBeLessThan(rope.segment * 1.6);
      }
    }
  });

  it('avisa quando a prancha estica a corda além do comprimento', () => {
    const rope = new Rope(1.83, 16);
    const a = { x: 0, y: 0, z: 0 };
    expect(rope.step(1 / 60, a, { x: 1, y: 0, z: 0 })).toBe(0);
    expect(rope.step(1 / 60, a, { x: 3, y: 0, z: 0 })).toBeGreaterThan(1);
  });
});

describe('configurações', () => {
  it('aceita a qualidade Ultra e o modo de câmera, e corrige valores inválidos', () => {
    const s = sanitizeSave({ ...defaultSave(), prefs: { quality: 'ultra', sound: false, camera: 'proxima' } });
    expect(s.prefs).toEqual({ quality: 'ultra', sound: false, camera: 'proxima' });
    expect(sanitizeSave({ prefs: { quality: 'x', camera: 'y' } }).prefs).toMatchObject({ quality: 'alta', camera: 'lateral' });
  });
});

describe('terminologia', () => {
  it('a parte de cima da onda se chama Lip em todo o código e na interface', () => {
    const sources = import.meta.glob('../src/**/*.{ts,css}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    expect(Object.keys(sources).length).toBeGreaterThan(20);
    for (const [f, raw] of Object.entries(sources)) {
      // "lábios" da boca do personagem é outra palavra e continua permitido.
      const text = raw.replace(/L[áa]bios \(boca\)/g, '');
      expect(/l[áa]bio/i.test(text), f).toBe(false);
    }
  });
});
