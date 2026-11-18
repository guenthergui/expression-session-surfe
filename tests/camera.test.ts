import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CameraRig, FOV_SPEED_GAIN } from '../src/render/CameraRig';
import { apexSlowStrength } from '../src/sim/airPhysics';

// Peso da câmera: campo de visão com a velocidade, tranco nos impactos e
// câmera lenta curta no ápice de um aéreo grande.

function rig() {
  const cam = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 100);
  const r = new CameraRig(cam);
  r.motion = true;
  return { cam, r };
}

const run = (r: CameraRig, speed: number, seconds: number, airborne = false) => {
  const t = new THREE.Vector3(0, 0.5, 0);
  for (let i = 0; i < seconds * 60; i++) {
    t.x += speed / 60;
    r.update(t, 0, 1.6, 1 / 60, airborne, speed);
  }
};

describe('câmera com peso', () => {
  it('abre o campo de visão com a velocidade e volta ao normal parado', () => {
    const { cam, r } = rig();
    r.snap(new THREE.Vector3(), 1.6);
    run(r, 2, 2);
    expect(cam.fov).toBeCloseTo(42, 1);
    run(r, 14, 4);
    expect(cam.fov).toBeGreaterThan(42 + FOV_SPEED_GAIN * 0.9);
    expect(cam.fov).toBeLessThanOrEqual(42 + FOV_SPEED_GAIN + 1e-6);
    run(r, 2, 6);
    expect(cam.fov).toBeLessThan(42.3);
  });

  it('o tranco do pouso aparece e some em menos de um segundo', () => {
    const { r } = rig();
    r.snap(new THREE.Vector3(), 1.6);
    r.kick(0.6);
    expect(r.shake).toBeGreaterThan(0.3);
    run(r, 6, 0.7);
    expect(r.shake).toBe(0);
  });

  it('sem movimento (acessibilidade) não há tranco nem campo de visão variável', () => {
    const { cam, r } = rig();
    r.motion = false;
    r.snap(new THREE.Vector3(), 1.6);
    r.kick(1);
    expect(r.shake).toBe(0);
    run(r, 14, 3);
    expect(cam.fov).toBe(42);
  });

  it('snap zera o tranco e o campo de visão', () => {
    const { cam, r } = rig();
    run(r, 14, 3);
    r.kick(0.8);
    r.snap(new THREE.Vector3(), 1.6);
    expect(r.shake).toBe(0);
    expect(cam.fov).toBe(42);
  });

  it('câmera lenta só no ápice de pops fortes', () => {
    expect(apexSlowStrength(4.3, 0)).toBe(0);
    expect(apexSlowStrength(5.6, 0)).toBeCloseTo(1, 6);
    expect(apexSlowStrength(5.6, 3)).toBe(0);
    expect(apexSlowStrength(5, 0.3)).toBeGreaterThan(0);
    expect(apexSlowStrength(5, 0.3)).toBeLessThan(1);
  });
});
