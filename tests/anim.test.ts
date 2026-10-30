import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { airPose, type AirPoseInput } from '../src/anim/airPose';
import { POSES, landingKeys, sampleSequence } from '../src/anim/poses';
import { defaultSave, sanitizeSave } from '../src/core/save';
import { Rope } from '../src/sim/rope';
import { ride, standing, toBoard } from './helpers';

const still: AirPoseInput = { t: 0.5, toTouch: 0.5, yaw: 0, yawRate: 0, flip: 0, flipRate: 0, grab: null, japan: 0, christ: 0, superman: 0, superwoman: 0, varial: null, prep: 0, windup: 0 };

describe('biblioteca de poses', () => {
  it('as sequências de pouso são contínuas (sem saltos de pose)', () => {
    for (const keys of [landingKeys('limpa'), landingKeys('concluida'), landingKeys('instavel')]) {
      let prev = sampleSequence(keys, 0);
      for (let t = 0.01; t < 2.5; t += 0.01) {
        const cur = sampleSequence(keys, t);
        for (const k of Object.keys(cur) as (keyof typeof cur)[]) expect(Math.abs(cur[k] - prev[k])).toBeLessThan(0.15);
        prev = cur;
      }
    }
  });

  it('a pose no ar sai do estado do voo: frontside e backside abrem para lados opostos', () => {
    const fs = airPose({ ...still, yaw: 70, yawRate: 20 });
    const bs = airPose({ ...still, yaw: -70, yawRate: -20 });
    expect(Math.sign(fs.twist)).not.toBe(Math.sign(bs.twist));
    // Girando rápido, o corpo fecha (inércia menor).
    const spin = airPose({ ...still, yaw: 200, yawRate: 500 });
    expect(spin.tuck).toBeGreaterThan(airPose(still).tuck);
    // O flip encolhe ainda mais.
    expect(airPose({ ...still, flip: 150, flipRate: 400 }).tuck).toBeGreaterThan(airPose(still).tuck);
  });

  it('cada grab e cada extensão têm a sua pose', () => {
    const poses = [
      airPose(still),
      ...(['indy', 'mute', 'method', 'stalefish', 'tail'] as const).map((id) => airPose({ ...still, grab: { id, amount: 1 } })),
      airPose({ ...still, grab: { id: 'mute', amount: 1 }, japan: 1 }),
      airPose({ ...still, christ: 1 }),
      airPose({ ...still, superman: 1, grab: { id: 'indy', amount: 1 } }),
      airPose({ ...still, superwoman: 1 }),
      airPose({ ...still, varial: 0.5 }),
    ];
    const key = (b: ReturnType<typeof airPose>) => Object.values(b).map((v) => v.toFixed(2)).join(',');
    expect(new Set(poses.map(key)).size).toBe(poses.length);
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

describe('remada, drop e base do surfista', () => {
  it('a onda começa com o surfista deitado e remando', () => {
    let checked = false;
    ride('straight-air', {}, ({ t, f }) => {
      if (t >= 0.45 || !f) return;
      expect(f.phase).toBe('remada');
      const pelvis = toBoard(f, f.pose.pelvisPos);
      expect(pelvis.y).toBeLessThan(0.25);
      const spine = new THREE.Vector3(0, 1, 0).applyQuaternion(f.pose.pelvisQuat).applyQuaternion(f.boardQuat.clone().invert());
      expect(spine.x).toBeGreaterThan(0.7);
      checked = true;
    });
    expect(checked).toBe(true);
  });

  it('o drop levanta o corpo sem saltos de posição', () => {
    let prev: THREE.Vector3 | null = null;
    let maxStep = 0;
    ride('straight-air', {}, ({ f }) => {
      if (!f || f.phase !== 'drop') return;
      const p = toBoard(f, f.pose.pelvisPos);
      if (prev) maxStep = Math.max(maxStep, p.distanceTo(prev));
      prev = p;
    });
    expect(prev).not.toBeNull();
    expect(maxStep).toBeLessThan(0.05);
  });

  it('em pé: pé direito à frente e costas para a câmera', () => {
    let checked = 0;
    ride('straight-air', {}, ({ f }) => {
      if (!f || (f.phase !== 'surf' && f.phase !== 'aceleracao')) return;
      const right = toBoard(f, f.pose.footRight.pos);
      const left = toBoard(f, f.pose.footLeft.pos);
      expect(right.x).toBeGreaterThan(left.x);
      const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(f.pose.pelvisQuat);
      expect(facing.z).toBeLessThan(-0.3);
      checked++;
    });
    expect(checked).toBeGreaterThan(10);
  });
});

describe('animação do aéreo', () => {
  it('na queda corpo e prancha se separam', () => {
    let maxGap = 0;
    const r = ride('air-reverse', { plan: { mistake: 'queda' } }, ({ f }) => {
      if (f?.falling) maxGap = Math.max(maxGap, f.pose.pelvisPos.distanceTo(f.boardPos));
    });
    expect(r.run.state).toBe('fallen');
    expect(maxGap).toBeGreaterThan(1);
  });

  it('a animação depende do tempo, não da taxa de quadros', () => {
    const sample = (fps: number) => {
      let pos = new THREE.Vector3();
      let done = false;
      ride('fs-360', { dt: 1 / fps }, ({ t, f }) => {
        if (!done && f && t >= 2.2 - 1e-9) {
          pos = f.boardPos.clone();
          done = true;
        }
      });
      return pos;
    };
    expect(sample(30).distanceTo(sample(120))).toBeLessThan(0.12);
  });

  it('depois do pouso o surfista segue surfando em pé', () => {
    let after = 0;
    const r = ride('air-reverse', { after: 1.2 }, ({ run, f }) => {
      if (f && run.lastLanding && run.t - run.lastLanding.t > 0.8 && standing(f)) after++;
    });
    expect(r.run.state).toBe('riding');
    expect(after).toBeGreaterThan(10);
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
    const s = sanitizeSave({ ...defaultSave(), prefs: { quality: 'ultra', sound: false, music: 25, camera: 'proxima' } });
    expect(s.prefs).toEqual({ quality: 'ultra', sound: false, music: 25, camera: 'proxima' });
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
