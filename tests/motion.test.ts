import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GRAB_CONTACT } from '../src/anim/choreography';
import { grabPoseId } from '../src/anim/airPose';
import { spinInertia } from '../src/anim/rotation';
import { BODY, LEG_MIN_REACH, LEG_REACH, deckAnchors, deckSlope, kneeFlexion } from '../src/anim/stance';
import { MANEUVERS } from '../src/core/maneuvers';
import type { AnimFrame } from '../src/game/AerialAnimator';
import { L, board, ride, standing, toBoard } from './helpers';

// Validação biomecânica do movimento: contato dos pés, alcance das pernas,
// continuidade (sem teletransporte nem giro instantâneo), física na face,
// giro em cadeia e contato dos grabs. Roda a onda inteira com o piloto
// automático, que aperta as mesmas teclas do jogador.

const anchors = deckAnchors(L);
const ALL = MANEUVERS.map((m) => m.id);
/** Aéreos em que os pés saem do deck de propósito. */
const FEET_OFF = ['superman', 'superwoman', 'varial-air'];

describe('base e contato dos pés', () => {
  it('as âncoras ficam no lugar certo do deck', () => {
    expect(anchors.backX).toBeGreaterThan(-L / 2 + 0.12);
    expect(anchors.backX).toBeLessThan(-L / 2 + 0.34);
    expect(Math.abs(anchors.backX - (-L / 2 + 0.29))).toBeLessThan(0.08);
    expect(anchors.stance).toBeGreaterThanOrEqual(0.52);
    expect(anchors.stance).toBeLessThanOrEqual(0.6);
    expect(Math.abs(anchors.frontX)).toBeLessThan(0.15);
  });

  for (const id of ALL) {
    it(`${id}: os pés ficam nas âncoras${FEET_OFF.includes(id) ? ', exceto quando saem de propósito' : ' durante toda a onda'}`, () => {
      let frames = 0;
      let maxOff = 0;
      ride(id, {}, ({ f }) => {
        if (!f || !standing(f)) return;
        maxOff = Math.max(maxOff, f.feetOff);
        if (f.feetOff > 0.01) return;
        frames++;
        const back = toBoard(f, f.pose.footLeft.pos);
        const front = toBoard(f, f.pose.footRight.pos);
        expect(Math.abs(back.y - board.deckY(back.x, back.z))).toBeLessThan(0.005);
        expect(Math.abs(front.y - board.deckY(front.x, front.z))).toBeLessThan(0.005);
        expect(Math.abs(back.x - anchors.backX)).toBeLessThan(0.005);
        expect(Math.abs(front.x - anchors.frontX)).toBeLessThan(0.005);
        expect(Math.abs(back.z)).toBeLessThan(0.06);
        expect(Math.abs(front.z)).toBeLessThan(0.06);
      });
      expect(frames).toBeGreaterThan(100);
      if (FEET_OFF.includes(id)) expect(maxOff).toBeGreaterThan(0.5);
      else expect(maxOff).toBe(0);
    });
  }

  it('o pé de trás acompanha a inclinação do kick da rabeta', () => {
    const slope = deckSlope((x, z) => board.deckY(x, z), anchors.backX);
    expect(slope).toBeLessThan(-0.02);
    let checked = 0;
    ride('fs-air', {}, ({ f }) => {
      if (!f || !standing(f)) return;
      const q = f.boardQuat.clone().invert().multiply(f.pose.footLeft.quat);
      const sole = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      const heelToToe = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
      expect(Math.abs(Math.atan2(-heelToToe.x, heelToToe.y) - slope)).toBeLessThan(0.02);
      expect(Math.abs(sole.y)).toBeLessThan(0.02);
      checked++;
    });
    expect(checked).toBeGreaterThan(100);
  });

  for (const id of ['fs-360', 'stalefish-air', 'bs-360', 'method-air', 'backflip', 'tail-grab']) {
    it(`${id}: as pernas alcançam o deck sem travar nem dobrar além do joelho`, () => {
      let minFlex = Infinity;
      let maxFlex = 0;
      ride(id, {}, ({ f }) => {
        if (!f || !standing(f) || f.feetOff > 0.01) return;
        for (const [side, foot] of [[1, f.pose.footLeft], [-1, f.pose.footRight]] as const) {
          const hip = new THREE.Vector3(side * BODY.hipHalfWidth, -BODY.hipDrop, 0).applyQuaternion(f.pose.pelvisQuat).add(f.pose.pelvisPos);
          const ankle = new THREE.Vector3(0, BODY.ankleHeight, -0.01).applyQuaternion(foot.quat).add(foot.pos);
          const d = hip.distanceTo(ankle);
          expect(d).toBeLessThanOrEqual(LEG_REACH + 1e-3);
          expect(d).toBeGreaterThanOrEqual(LEG_MIN_REACH);
          const flex = kneeFlexion(d);
          minFlex = Math.min(minFlex, flex);
          maxFlex = Math.max(maxFlex, flex);
        }
      });
      expect(minFlex).toBeGreaterThan(THREE.MathUtils.degToRad(12));
      expect(maxFlex).toBeLessThan(THREE.MathUtils.degToRad(146));
    });
  }
});

describe('continuidade do movimento', () => {
  for (const id of ALL) {
    it(`${id}: sem teletransporte nem giro instantâneo da prancha e da pelve`, () => {
      let prev: { pos: THREE.Vector3; quat: THREE.Quaternion; pelvis: THREE.Vector3; pq: THREE.Quaternion; varial: number } | null = null;
      let worst = -Infinity;
      ride(id, {}, ({ f, run }) => {
        if (!f) return;
        const varial = run.air?.varial ?? 0;
        if (prev) {
          expect(f.boardPos.distanceTo(prev.pos)).toBeLessThan(14 / 60 + 0.05);
          // O que o giro físico pede neste quadro (giro, flip e a prancha do varial)
          // mais uma folga de 14° para o pop e os ajustes do corpo.
          const air = run.air;
          const physical = air ? (Math.abs(air.yawRate) + Math.abs(air.flipRate)) / 60 : 0;
          const allow = physical + 14;
          const board = THREE.MathUtils.radToDeg(f.boardQuat.angleTo(prev.quat)) - Math.abs(varial - prev.varial);
          worst = Math.max(worst, board - allow);
          if (standing(f)) {
            expect(f.pose.pelvisPos.distanceTo(prev.pelvis)).toBeLessThan(14 / 60 + 0.06);
            worst = Math.max(worst, THREE.MathUtils.radToDeg(f.pose.pelvisQuat.angleTo(prev.pq)) - allow);
          }
        }
        prev = { pos: f.boardPos.clone(), quat: f.boardQuat.clone(), pelvis: f.pose.pelvisPos.clone(), pq: f.pose.pelvisQuat.clone(), varial };
      });
      expect(worst).toBeLessThan(0);
    });
  }
});

describe('física na face da onda', () => {
  it('a prancha aponta para a trajetória: sobe a face com o bico para o lip e desce no drop', () => {
    let climbNose = 0;
    let dropNose = 0;
    ride('straight-air', {}, ({ f, run }) => {
      if (!f) return;
      const nose = new THREE.Vector3(1, 0, 0).applyQuaternion(f.boardQuat);
      if (run.state === 'dropping') dropNose = Math.max(dropNose, nose.z);
      if (run.lineSegment() === 'subida') climbNose = Math.min(climbNose, nose.z);
    });
    expect(dropNose).toBeGreaterThan(0.3);
    expect(climbNose).toBeLessThan(-0.2);
  });

  it('a curva de base é feita na borda, com inclinação de equilíbrio progressiva', () => {
    let maxRoll = 0;
    let frames = 0;
    ride('fs-360', {}, ({ f, run }) => {
      if (!f || run.state !== 'riding' || run.standing < 1) return;
      const r = Math.abs(f.debug.roll);
      if (r > 10) frames++;
      maxRoll = Math.max(maxRoll, r);
      // Na base da onda o deck fica de frente para o céu mesmo na borda (na subida vertical, não).
      if (run.lineSegment() === 'base') expect(new THREE.Vector3(0, 1, 0).applyQuaternion(f.boardQuat).y).toBeGreaterThan(0.3);
    });
    expect(maxRoll).toBeGreaterThan(20);
    expect(frames).toBeGreaterThan(20);
  });
});

describe('giro, grabs e pouso', () => {
  it('ombros lideram, o quadril segue e a prancha vem por último', () => {
    let ordered = 0;
    ride('fs-360', {}, ({ f }) => {
      if (!f) return;
      const d = f.debug;
      if (Math.abs(d.board) > 20 && Math.abs(d.board) < 340 && Math.abs(d.shoulders) > Math.abs(d.hips) + 1 && Math.abs(d.hips) > Math.abs(d.board) + 1) ordered++;
    });
    expect(ordered).toBeGreaterThan(5);
  });

  it('frontside gira com o peito para o bico; backside com as costas', () => {
    const facingX = (id: string) => {
      let x = 0;
      ride(id, {}, ({ f }) => {
        if (f?.airborne && Math.abs(f.debug.hips) > 60 && Math.abs(f.debug.hips) < 100) x = new THREE.Vector3(0, 0, 1).applyQuaternion(f.pose.pelvisQuat).x;
      });
      return x;
    };
    expect(facingX('fs-360')).toBeGreaterThan(0.4);
    expect(facingX('bs-360')).toBeLessThan(-0.4);
  });

  it('o 360 completa a volta sem saltos', () => {
    let last = 0;
    let maxStep = 0;
    let peak = 0;
    ride('fs-360', {}, ({ f }) => {
      if (!f?.airborne) return;
      if (last) maxStep = Math.max(maxStep, Math.abs(f.debug.board - last));
      last = f.debug.board;
      peak = Math.max(peak, Math.abs(f.debug.board));
    });
    expect(peak).toBeGreaterThan(320);
    expect(maxStep).toBeLessThan(16);
  });

  it('corpo fechado gira mais rápido que aberto (inércia)', () => {
    expect(spinInertia(1, 0)).toBeGreaterThan(spinInertia(0.2, 0.9));
    const rate = (id: string) => {
      let best = 0;
      ride(id, { animate: false }, ({ run }) => {
        if (run.air) best = Math.max(best, Math.abs(run.air.yawRate));
      });
      return best;
    };
    expect(rate('full-rotation')).toBeGreaterThan(rate('180-air'));
  });

  for (const id of ['indy-air', 'grab-air', 'method-air', 'stalefish-air', 'tail-grab', 'japan-air', 'christ-air']) {
    it(`${id}: a mão alcança a borda certa da prancha no grab`, () => {
      let checked = 0;
      ride(id, {}, ({ f, a }) => {
        if (!f?.airborne || !f.grab || f.grabAmount < 0.999 || f.feetOff > 0.01) return;
        const c = GRAB_CONTACT[f.grab];
        const hand = c.hand === 'tras' ? f.pose.handLeft : f.pose.handRight;
        const local = toBoard(f, hand);
        if (c.rail !== 0) expect(Math.sign(-local.z)).toBe(c.rail);
        expect(Math.abs(local.x - (anchors.midX + c.dx))).toBeLessThan(0.03);
        expect(local.y - board.deckY(local.x, 0)).toBeLessThan(0.1);
        const shoulder = a!.shoulderWorld(c.hand === 'tras' ? 'left' : 'right');
        expect(shoulder.distanceTo(hand)).toBeLessThan(BODY.upperArm + BODY.forearm + 1e-3);
        checked++;
      });
      expect(checked).toBeGreaterThan(3);
    });
  }

  it('o Japan é o Grab Air puxado', () => {
    expect(grabPoseId('mute', 0.9)).toBe('japan');
    expect(grabPoseId('mute', 0.1)).toBe('mute');
  });

  it('a decolagem comprime o corpo antes e estende as pernas depois', () => {
    const hs: [number, number][] = [];
    const r = ride('fs-air', {}, ({ run, f }) => {
      if (f) hs.push([run.t, toBoard(f, f.pose.pelvisPos).y]);
    });
    const t0 = r.run.takeoffAt!;
    const at = (from: number, to: number) => hs.filter(([t]) => t >= t0 + from && t <= t0 + to).map(([, h]) => h);
    const before = Math.min(...at(-0.08, 0));
    const after = Math.max(...at(0.15, 0.35));
    const cruise = Math.max(...at(-1.6, -1.0));
    expect(cruise - before).toBeGreaterThan(0.04);
    expect(after - before).toBeGreaterThan(0.06);
  });

  it('o pouso absorve o impacto com os joelhos', () => {
    let air = 0;
    let land = Infinity;
    let t0 = Infinity;
    ride('fs-air', {}, ({ run, f, events }) => {
      if (!f) return;
      if (events.some((e) => e.kind === 'land')) t0 = run.t;
      const h = toBoard(f, f.pose.pelvisPos).y;
      if (run.air && run.air.timeToTouch() < 0.06) air = h;
      if (run.t > t0 + 0.05 && run.t < t0 + 0.3) land = Math.min(land, h);
    });
    expect(air - land).toBeGreaterThan(0.06);
  });

  it('no pouso fakie o surfista completa o giro na água', () => {
    let fakie = false;
    let yawAtTouch = 0;
    let yawLater = 0;
    let t0 = Infinity;
    ride('180-air', { after: 1.6 }, ({ run, f, events }) => {
      if (!f) return;
      for (const e of events) if (e.kind === 'land') {
        fakie = e.landing.fakie;
        t0 = run.t;
      }
      const yaw = Math.abs(((f.debug.board % 360) + 360) % 360);
      if (run.t - t0 < 0.03 && run.t >= t0) yawAtTouch = Math.min(yaw, 360 - yaw);
      if (run.t - t0 > 1.2 && run.t - t0 < 1.25) yawLater = Math.min(yaw, 360 - yaw);
    });
    expect(fakie).toBe(true);
    expect(yawAtTouch).toBeGreaterThan(120);
    expect(yawLater).toBeLessThan(25);
  });
});

void ({} as AnimFrame);
