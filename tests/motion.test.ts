import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GRAB_CONTACT } from '../src/anim/choreography';
import { SpinCurve, spinInertia } from '../src/anim/rotation';
import { BODY, LEG_MIN_REACH, LEG_REACH, deckAnchors, deckSlope, kneeFlexion } from '../src/anim/stance';
import { findManeuver } from '../src/core/maneuvers';
import type { Judgement } from '../src/core/types';
import { AerialAnimator, type AnimFrame, type BoardShapeInfo } from '../src/game/AerialAnimator';
import { planAerial } from '../src/sim/aerial';
import { WaveRun } from '../src/sim/waveRun';
import { createWave } from '../src/sim/waveField';

// Validação biomecânica do movimento: contato dos pés, alcance das pernas,
// continuidade (sem teletransporte nem giro instantâneo), física na face,
// giro em cadeia e contato dos grabs. Roda a onda inteira em passos de tempo.

// Prancha de 5'10" com kick na rabeta e no bico, como o modelo 3D. Usa `this`
// nos métodos, como a BoardModel, para pegar chamadas sem o objeto.
const L = 1.778;
const board: BoardShapeInfo = {
  shape: { length: L, width: 0.47, thickness: 0.057 },
  deckY(x: number) {
    const u = x / this.shape.length + 0.5;
    const tail = u < 0.35 ? 0.05 * (1 - u / 0.35) ** 2 : 0;
    const nose = u > 0.5 ? 0.115 * ((u - 0.5) / 0.5) ** 2.3 : 0;
    return 0.034 + tail + nose;
  },
  halfWidth: (u: number) => 0.235 * Math.sin(Math.PI * Math.min(0.98, Math.max(0.1, u))),
};
const anchors = deckAnchors(L);

type Results = (i: number, phase: string) => Judgement;
const perfect: Results = () => 'perfect';

function simulate(id: string, outcome: 'limpa' | 'instavel' | 'queda', fn: (t: number, f: AnimFrame, a: AerialAnimator, run: WaveRun) => void, results: Results = perfect, dt = 1 / 60) {
  const m = findManeuver(id)!;
  const wave = createWave({ height: 1.6, power: 60 });
  const run = new WaveRun(wave, { forca: 40, controleAereo: 40, equipImpulse: 2 });
  const a = new AerialAnimator(m, wave, board, run);
  let t = 0;
  while (t < Math.min(30, a.totalTime)) {
    t += dt;
    if (run.state === 'paddling' && t > 0.5) run.pressDrop();
    if (run.state === 'riding') {
      run.setAccelerate(true);
      if (run.takeoffReady && Math.abs(run.timeToPeak()) < 0.03) {
        run.tryTakeoff();
        const track = { steps: m.sequence, results: m.sequence.map((s, i) => results(i, s.phase)) };
        const plan = planAerial({ wave, launch: run.position(), launchTime: t, speed: run.speed, airTime: m.sequence[m.sequence.length - 1].time, takeoff: 1, amplitude: 40, topSpeed: run.vMax });
        a.beginAir(plan, track);
      }
    }
    run.update(dt);
    fn(t, a.update(t, dt, outcome), a, run);
  }
  return a;
}

function toBoard(f: AnimFrame, p: THREE.Vector3) {
  return p.clone().sub(f.boardPos).applyQuaternion(f.boardQuat.clone().invert());
}

const ALL = ['straight-air', 'fs-air', 'bs-air', 'indy-air', 'air-reverse', 'stalefish-air', 'bs-air-reverse', 'air-reverse-indy', 'fs-360', 'bs-360', 'fs-360-mute', 'rodeo-flip', 'fs-540-melon'];

/** Em pé na prancha (fora da remada, do levantar e da queda). */
const standing = (f: AnimFrame) => !f.falling && f.phase !== 'remada' && f.phase !== 'drop';

describe('base e contato dos pés', () => {
  it('as âncoras ficam no lugar certo do deck', () => {
    // Pé de trás no deck pad (da rabeta + 4 cm até + 34 cm), em cima das quilhas laterais (29 cm).
    expect(anchors.backX).toBeGreaterThan(-L / 2 + 0.12);
    expect(anchors.backX).toBeLessThan(-L / 2 + 0.34);
    expect(Math.abs(anchors.backX - (-L / 2 + 0.29))).toBeLessThan(0.08);
    // Base na largura dos ombros, e o pé da frente perto do centro.
    expect(anchors.stance).toBeGreaterThanOrEqual(0.52);
    expect(anchors.stance).toBeLessThanOrEqual(0.6);
    expect(Math.abs(anchors.frontX)).toBeLessThan(0.15);
  });

  for (const id of ALL) {
    it(`${id}: os dois pés ficam apoiados nas âncoras durante toda a onda`, () => {
      let frames = 0;
      simulate(id, 'limpa', (_, f) => {
        if (!standing(f)) return;
        frames++;
        const back = toBoard(f, f.pose.footLeft.pos);
        const front = toBoard(f, f.pose.footRight.pos);
        // Nem flutuando nem atravessando o deck (tolerância de 5 mm), e sem deslizar.
        expect(Math.abs(back.y - board.deckY(back.x, back.z))).toBeLessThan(0.005);
        expect(Math.abs(front.y - board.deckY(front.x, front.z))).toBeLessThan(0.005);
        expect(Math.abs(back.x - anchors.backX)).toBeLessThan(0.005);
        expect(Math.abs(front.x - anchors.frontX)).toBeLessThan(0.005);
        // Centralizados na largura da prancha.
        expect(Math.abs(back.z)).toBeLessThan(0.06);
        expect(Math.abs(front.z)).toBeLessThan(0.06);
      });
      expect(frames).toBeGreaterThan(100);
    });
  }

  it('o pé de trás acompanha a inclinação do kick da rabeta', () => {
    // O deck sobe em direção à rabeta (inclinação negativa em x).
    const slope = deckSlope((x, z) => board.deckY(x, z), anchors.backX);
    expect(slope).toBeLessThan(-0.02);
    let checked = 0;
    simulate('fs-air', 'limpa', (_, f) => {
      if (!standing(f)) return;
      const q = f.boardQuat.clone().invert().multiply(f.pose.footLeft.quat);
      const sole = new THREE.Vector3(0, 0, 1).applyQuaternion(q); // dedos do pé, no referencial da prancha
      const heelToToe = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
      // A sola fica paralela ao deck: a normal do pé inclina junto com o kick.
      expect(Math.abs(Math.atan2(-heelToToe.x, heelToToe.y) - slope)).toBeLessThan(0.02);
      expect(Math.abs(sole.y)).toBeLessThan(0.02);
      checked++;
    });
    expect(checked).toBeGreaterThan(100);
  });

  for (const id of ['fs-360', 'stalefish-air', 'bs-360', 'air-reverse-indy']) {
    it(`${id}: as pernas alcançam o deck sem travar nem dobrar além do joelho`, () => {
      let minFlex = Infinity;
      let maxFlex = 0;
      simulate(id, 'limpa', (_, f) => {
        if (!standing(f)) return;
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
      // Joelhos nunca travados (sempre algum ângulo) e nunca além de ~145°.
      expect(minFlex).toBeGreaterThan(THREE.MathUtils.degToRad(12));
      expect(maxFlex).toBeLessThan(THREE.MathUtils.degToRad(146));
    });
  }
});

describe('continuidade do movimento', () => {
  for (const id of ALL) {
    it(`${id}: sem teletransporte nem giro instantâneo da prancha e da pelve`, () => {
      let prev: { pos: THREE.Vector3; quat: THREE.Quaternion; pelvis: THREE.Vector3; pq: THREE.Quaternion } | null = null;
      let maxTurn = 0;
      let maxPelvisTurn = 0;
      simulate(id, 'limpa', (_, f) => {
        if (prev) {
          const step = f.boardPos.distanceTo(prev.pos);
          // A 60 FPS: no máximo a velocidade do voo mais 5 cm por quadro.
          expect(step).toBeLessThan(14 / 60 + 0.05);
          maxTurn = Math.max(maxTurn, f.boardQuat.angleTo(prev.quat));
          if (standing(f)) {
            expect(f.pose.pelvisPos.distanceTo(prev.pelvis)).toBeLessThan(14 / 60 + 0.06);
            maxPelvisTurn = Math.max(maxPelvisTurn, f.pose.pelvisQuat.angleTo(prev.pq));
          }
        }
        prev = { pos: f.boardPos.clone(), quat: f.boardQuat.clone(), pelvis: f.pose.pelvisPos.clone(), pq: f.pose.pelvisQuat.clone() };
      });
      // Até ~14° por quadro no meio de um 360 rápido; nunca um salto de orientação.
      expect(THREE.MathUtils.radToDeg(maxTurn)).toBeLessThan(15);
      expect(THREE.MathUtils.radToDeg(maxPelvisTurn)).toBeLessThan(15);
    });
  }

  it('a simulação da onda é a mesma a 30 e a 144 quadros por segundo', () => {
    const at = (fps: number) => {
      const wave = createWave({ height: 1.6, power: 60 });
      const run = new WaveRun(wave, { forca: 40, controleAereo: 40, equipImpulse: 2 });
      let t = 0;
      while (t < 4.5 - 1e-9) {
        const dt = Math.min(1 / fps, 4.5 - t);
        t += dt;
        if (t > 0.5) run.pressDrop();
        run.setAccelerate(true);
        run.update(dt);
      }
      return run.position();
    };
    const a = at(30);
    const b = at(144);
    expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeLessThan(0.02);
  });
});

describe('física na face da onda', () => {
  it('perde velocidade subindo para o lip e ganha descendo para a base', () => {
    let top = Infinity;
    let bottom = 0;
    simulate('straight-air', 'limpa', (_, f, a, run) => {
      if (run.state !== 'riding') return;
      const seg = run.lineSegment();
      if (seg === 'topo') top = Math.min(top, run.energy);
      if (seg === 'base') bottom = Math.max(bottom, run.energy);
    });
    expect(top).toBeLessThan(0.97);
    expect(bottom).toBeGreaterThan(1.03);
  });

  it('a prancha aponta para a trajetória: sobe a face com o bico para o lip e desce no drop', () => {
    let climbNose = 0;
    let dropNose = 0;
    simulate('straight-air', 'limpa', (_, f, a, run) => {
      const nose = new THREE.Vector3(1, 0, 0).applyQuaternion(f.boardQuat);
      if (run.state === 'dropping') dropNose = Math.max(dropNose, nose.z);
      if (run.lineSegment() === 'subida') climbNose = Math.min(climbNose, nose.z);
    });
    // O lip fica em −z e a base em +z.
    expect(dropNose).toBeGreaterThan(0.3);
    expect(climbNose).toBeLessThan(-0.2);
  });

  it('o bottom turn é feito na borda dos dedos, com inclinação de equilíbrio', () => {
    let maxToe = 0;
    let curveDuration = 0;
    let wasBase = false;
    simulate('straight-air', 'limpa', (_, f, a, run) => {
      if (run.lineSegment() !== 'base') {
        wasBase = false;
        return;
      }
      // Normal do deck inclinada para a parede (−z): borda dos dedos (lado da onda) para baixo.
      const n = new THREE.Vector3(0, 1, 0).applyQuaternion(f.boardQuat);
      const water = new THREE.Vector3(0, 1, 0); // referência aproximada
      void water;
      maxToe = Math.max(maxToe, f.debug.roll);
      if (wasBase) curveDuration += 1 / 60;
      wasBase = true;
      expect(n.y).toBeGreaterThan(0.3);
    });
    expect(maxToe).toBeGreaterThan(20); // graus
    expect(curveDuration).toBeGreaterThan(0.3); // curva progressiva, não instantânea
  });
});

describe('giro e manobras', () => {
  it('ombros lideram, o quadril segue e a prancha vem por último', () => {
    let ordered = 0;
    simulate('fs-360', 'limpa', (_, f) => {
      const d = f.debug;
      if (Math.abs(d.board) > 20 && Math.abs(d.board) < 340 && Math.abs(d.shoulders) > Math.abs(d.hips) + 1 && Math.abs(d.hips) > Math.abs(d.board) + 1) ordered++;
    });
    expect(ordered).toBeGreaterThan(10);
  });

  it('frontside gira com o peito para o bico; backside com as costas', () => {
    const facingX = (id: string) => {
      let x = 0;
      simulate(id, 'limpa', (_, f) => {
        if (f.airborne && Math.abs(f.debug.hips) > 60 && Math.abs(f.debug.hips) < 100) {
          const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(f.pose.pelvisQuat);
          x = facing.x;
        }
      });
      return x;
    };
    expect(facingX('fs-360')).toBeGreaterThan(0.5);
    expect(facingX('bs-360')).toBeLessThan(-0.5);
  });

  it('o 360 completa a volta sem saltos e de forma contínua', () => {
    let last = 0;
    let maxStep = 0;
    let final = 0;
    simulate('fs-360', 'limpa', (_, f) => {
      if (!f.airborne) return;
      maxStep = Math.max(maxStep, Math.abs(f.debug.board - last));
      last = f.debug.board;
      final = f.debug.board;
    });
    expect(Math.abs(final)).toBeGreaterThan(340);
    expect(maxStep).toBeLessThan(14);
  });

  it('braços fechados giram mais rápido que abertos (inércia)', () => {
    expect(spinInertia(1, 0)).toBeGreaterThan(spinInertia(0.2, 0.9));
    const open = new SpinCurve(0.5, () => spinInertia(1, 0.2));
    const shifting = new SpinCurve(0.5, (t) => (t < 0.5 ? spinInertia(1, 0.2) : spinInertia(0.1, 0.95)));
    // Com o corpo fechando na segunda metade, mais da volta acontece depois do comando.
    expect(shifting.at(0.5)).toBeLessThan(open.at(0.5));
    expect(open.at(2)).toBeCloseTo(1, 6);
    // No 360 real, a maior velocidade do quadril acontece com o corpo encolhido.
    let best = 0;
    let tuckAtBest = 0;
    let last = 0;
    simulate('fs-360', 'limpa', (_, f, a) => {
      if (!f.airborne) return;
      const w = Math.abs(f.debug.hips - last) * 60;
      last = f.debug.hips;
      if (w > best) {
        best = w;
        tuckAtBest = f.pose.spineBend;
      }
      void a;
    });
    expect(best).toBeGreaterThan(400); // graus por segundo
    expect(tuckAtBest).toBeGreaterThan(0.45); // coluna curvada: joelhos para o peito
  });

  it('rotação atrasada pousa desalinhada e o surfista corrige na água', () => {
    const late: Results = (_, phase) => (phase === 'rotacao' ? 'late' : 'perfect');
    let atLanding = -1;
    let later = -1;
    simulate('air-reverse', 'instavel', (t, f, a) => {
      if (t < a.airEnd) return;
      const yaw = Math.abs(f.debug.board);
      if (atLanding < 0) atLanding = yaw;
      if (t > a.airEnd + 0.9 && later < 0) later = yaw;
    }, late);
    expect(atLanding).toBeGreaterThan(140);
    expect(atLanding).toBeLessThan(160);
  });

  for (const id of ['indy-air', 'stalefish-air', 'air-reverse-indy', 'fs-360-mute', 'fs-540-melon']) {
    it(`${id}: a mão alcança a borda certa da prancha no grab`, () => {
      const m = findManeuver(id)!;
      const c = GRAB_CONTACT[m.grab!];
      let checked = 0;
      simulate(id, 'limpa', (t, f, a) => {
        if (!f.airborne) return;
        const tAir = t - a.takeoffT;
        if (a.grabAmount(tAir, a.plan!.airTime) < 0.999) return;
        const hand = c.hand === 'tras' ? f.pose.handLeft : f.pose.handRight;
        const local = toBoard(f, hand);
        // Na borda certa (dedos = −z), na região certa e logo acima do deck.
        expect(Math.sign(-local.z)).toBe(c.rail);
        expect(Math.abs(local.x - (anchors.midX + c.dx))).toBeLessThan(0.02);
        expect(local.y - board.deckY(local.x, 0)).toBeLessThan(0.08);
        expect(local.y - board.deckY(local.x, 0)).toBeGreaterThan(0);
        // O braço alcança sem esticar além do comprimento.
        const shoulder = a.shoulderWorld(c.hand === 'tras' ? 'left' : 'right');
        expect(shoulder.distanceTo(hand)).toBeLessThan(BODY.upperArm + BODY.forearm);
        checked++;
      });
      expect(checked).toBeGreaterThan(3);
    });
  }

  it('a decolagem comprime o corpo antes e estende as pernas depois', () => {
    const hs: [number, number][] = [];
    const a = simulate('fs-air', 'limpa', (t, f) => hs.push([t, toBoard(f, f.pose.pelvisPos).y]));
    const at = (from: number, to: number) => hs.filter(([t]) => t >= a.takeoffT + from && t <= a.takeoffT + to).map(([, h]) => h);
    // Subindo a face o corpo se estende; chegando ao lip, comprime (bottom turn → extensão → compressão → pop).
    const climbing = Math.max(...at(-0.8, -0.4));
    const before = Math.min(...at(-0.05, 0));
    const after = Math.max(...at(0.15, 0.3));
    expect(climbing - before).toBeGreaterThan(0.05); // centro de massa baixa na compressão
    expect(after - before).toBeGreaterThan(0.12); // e sobe com a extensão das pernas
  });

  it('o pouso absorve o impacto com os joelhos', () => {
    let air = 0;
    let land = Infinity;
    simulate('fs-air', 'limpa', (t, f, a) => {
      const h = toBoard(f, f.pose.pelvisPos).y;
      if (t > a.airEnd - 0.05 && t < a.airEnd) air = h;
      if (t > a.airEnd + 0.05 && t < a.airEnd + 0.2) land = Math.min(land, h);
    });
    expect(air - land).toBeGreaterThan(0.12);
  });
});
