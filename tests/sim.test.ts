import { describe, expect, it } from 'vitest';
import { emptyInput, type SurferInput } from '../src/core/controls';
import { MANEUVERS, findManeuver, recognize } from '../src/core/maneuvers';
import { AutoPilot, planFor } from '../src/sim/autopilot';
import { AirBody } from '../src/sim/airPhysics';
import { evaluateLanding } from '../src/sim/landing';
import { S_LIP } from '../src/sim/surfPhysics';
import { tryLaunch, type Launch } from '../src/sim/takeoff';
import { DROP_TIME, STANDUP_TIME, WaveRun } from '../src/sim/waveRun';
import { createWave, crestHeight, faceWidth, foamAt, surfaceHeight, surfaceNormal } from '../src/sim/waveField';
import { params, ride, testWave } from './helpers';
describe('campo de ondas', () => {
  const w = createWave({ height: 1.5, time: 1, breakX0: -10, peelSpeed: 6 });

  it('a crista fica perto da altura pedida e a face sobe até ela', () => {
    const crest = surfaceHeight(w, 30, 0);
    expect(crest).toBeGreaterThan(1.1);
    expect(crest).toBeLessThan(1.8);
    expect(surfaceHeight(w, 30, 2)).toBeLessThan(crest);
    expect(surfaceHeight(w, 30, 6)).toBeLessThan(0.5);
  });

  it('a parte quebrada é mais baixa e tem mais espuma', () => {
    expect(crestHeight(w, -30)).toBeLessThan(crestHeight(w, 0));
    expect(foamAt(w, -30, 1)).toBeGreaterThan(foamAt(w, 20, 3));
  });

  it('a normal aponta para cima e para a praia na face', () => {
    const n = surfaceNormal(w, 20, 1.5);
    expect(n.y).toBeGreaterThan(0);
    expect(n.z).toBeGreaterThan(0);
  });
});

/** Uma onda guiada por uma função de entrada, em passos fixos. */
function drive(seconds: number, input: (run: WaveRun, t: number) => Partial<SurferInput>, opts: { level?: number; dt?: number } = {}) {
  const run = new WaveRun(testWave(), params(opts.level ?? 60));
  const dt = opts.dt ?? 1 / 120;
  const events: string[] = [];
  let t = 0;
  while (t < seconds - 1e-9) {
    t += dt;
    if (run.state === 'paddling' && t > 0.3) run.pressDrop();
    run.setInput({ ...emptyInput(), ...input(run, t) });
    run.update(dt);
    for (const e of run.drain()) events.push(e.kind === 'refused' ? `refused:${e.reason}` : e.kind);
  }
  return { run, events };
}

const RIDE_START = 0.3 + DROP_TIME + STANDUP_TIME + 0.1;

describe('remada e drop', () => {
  it('começa remando, deitado, e só sai disso com o D', () => {
    const run = new WaveRun(testWave(), params());
    for (let i = 0; i < 120; i++) run.update(1 / 60);
    expect(run.state).toBe('paddling');
    expect(run.standing).toBe(0);
    expect(run.pressDrop()).toBe(true);
    expect(run.pressDrop()).toBe(false);
    expect(run.state).toBe('dropping');
  });

  it('o surfista levanta de forma contínua e entra surfando', () => {
    const run = new WaveRun(testWave(), params());
    run.pressDrop();
    let prev = 0;
    for (let i = 0; i < 180; i++) {
      run.update(1 / 60);
      expect(run.standing - prev).toBeLessThan(0.05);
      prev = run.standing;
    }
    expect(run.state).toBe('riding');
    expect(run.standing).toBe(1);
  });
});

describe('navegação livre na face', () => {
  it('subir até a crista perde velocidade e descer dela ganha, sem pontuar nada', () => {
    let top = Infinity;
    let below = 0;
    let atLip = false;
    drive(RIDE_START + 2.2, (r) => {
      if (!r.rider || r.standing < 1) return {};
      if (!atLip && r.s < S_LIP + 0.15) atLip = true;
      if (atLip) {
        top = Math.min(top, r.speed);
        if (r.s > faceWidth(r.waveNow) * 0.6) below = Math.max(below, r.speed);
      }
      return atLip ? { aimX: 1, aimY: -1 } : { aimX: 0.5, aimY: 1 };
    });
    expect(atLip).toBe(true);
    expect(below).toBeGreaterThan(top + 0.8);
    // Curvas, subidas e descidas são navegação: nenhum evento de manobra.
    const weave = drive(12, (r, t) => ({ aimX: 1, aimY: Math.sin(t * 2.2), pump: true }));
    expect(weave.events.filter((e) => e === 'launch' || e === 'land')).toEqual([]);
    expect(weave.run.state).toBe('riding');
  });

  it('o pocket (meio da face) segura a velocidade; fora da face ela morre', () => {
    const hold = (frac: number) => drive(8, (r) => ({ aimX: 1, aimY: r.rider ? Math.max(-0.7, Math.min(0.7, (r.s - frac * faceWidth(r.waveNow)) * 0.9)) : 0 })).run.speed;
    const flats = drive(6, () => ({ aimX: 1, aimY: -1 })).run.speed;
    expect(hold(0.4)).toBeGreaterThan(6.5);
    expect(hold(0.4)).toBeGreaterThan(flats + 2);
  });

  it('a bombeada acelera até um limite', () => {
    const pump = drive(RIDE_START + 4, () => ({ aimX: 1, aimY: 0, pump: true }));
    const coast = drive(RIDE_START + 4, () => ({ aimX: 1, aimY: 0 }));
    expect(pump.run.speed).toBeGreaterThan(coast.run.speed);
    let max = 0;
    drive(14, (r) => {
      max = Math.max(max, r.speed / r.vMax);
      return { aimX: 1, aimY: -0.3, pump: true };
    });
    expect(max).toBeLessThanOrEqual(1.0001);
  });

  it('quanto mais rápido, mais aberta a curva (aceleração lateral limitada)', () => {
    let fastest = 0;
    drive(10, (r, t) => {
      if (r.rider && r.standing >= 1) fastest = Math.max(fastest, Math.abs(r.rider.omega) * r.rider.v);
      return { aimX: t % 2 < 1 ? 1 : -1, aimY: t % 2 < 1 ? 1 : -1, pump: true };
    });
    // a_lat = v·ω fica no limite físico da borda, não cresce sem fim.
    expect(fastest).toBeGreaterThan(5);
    expect(fastest).toBeLessThan(26);
  });

  it('a simulação é a mesma a 30 e a 144 quadros por segundo', () => {
    const at = (fps: number) => drive(5, (r, t) => ({ aimX: 1, aimY: t < 3 ? 0.4 : -0.4, pump: true }), { dt: 1 / fps }).run.position();
    const a = at(30);
    const b = at(144);
    expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeLessThan(0.05);
  });

  it('quem fica parado é alcançado pela quebra', () => {
    const r = drive(14, () => ({ aimX: -0.2, aimY: -1 }));
    expect(r.events).toContain('fall');
    expect(r.run.fallCause).toBe('fechou');
  });
});

describe('decolagem', () => {
  const base = { speed: 8, dir: 1.2, s: S_LIP + 0.1, vyFace: 3, compressHeld: 0.3, windup: 0, criticality: 0.6 };
  const tp = { impulsao: 60, amplitude: 60, equipImpulse: 1, conditions: 1, power: 65, sectionQuality: 60 };

  it('recusa sem velocidade, longe do lip ou descendo', () => {
    expect(tryLaunch({ ...base, speed: 3 }, tp)).toMatchObject({ ok: false, reason: 'velocidade' });
    expect(tryLaunch({ ...base, s: 2.5 }, tp)).toMatchObject({ ok: false, reason: 'posicao' });
    expect(tryLaunch({ ...base, dir: -0.8 }, tp)).toMatchObject({ ok: false, reason: 'descendo' });
    expect(tryLaunch(base, tp).ok).toBe(true);
  });

  it('mais velocidade, subida mais vertical e compressão completa dão mais projeção', () => {
    const vy = (st: Partial<typeof base>) => (tryLaunch({ ...base, ...st }, tp) as Launch).vy;
    expect(vy({ speed: 10 })).toBeGreaterThan(vy({ speed: 6 }));
    expect(vy({ dir: 1.45 })).toBeGreaterThan(vy({ dir: 0.5 }));
    expect(vy({ compressHeld: 0.3 })).toBeGreaterThan(vy({ compressHeld: 0.05 }));
  });

  it('soltar o espaço no meio da face explica o motivo e não decola', () => {
    const r = drive(RIDE_START + 1.2, (run, t) => ({ aimX: 1, aimY: 0, compress: t > RIDE_START && t < RIDE_START + 0.5 }));
    expect(r.events.some((e) => e.startsWith('refused'))).toBe(true);
    expect(r.events).not.toContain('launch');
  });
});

describe('voo', () => {
  const wave = createWave({ height: 1.6, power: 65 });
  const launch: Launch = { ok: true, vx: 6, vy: 4.2, vs: -0.4, compress: 1, timing: 1, approachDeg: 60, speed: 8, criticality: 0.6, windup: 0 };
  const air = { rotacao: 60, controleAereo: 60, equipRotation: 1, equipGrab: 1 };
  const fly = (input: (b: AirBody) => Partial<SurferInput>) => {
    const b = new AirBody(wave, launch, 0, 0, 1.6, S_LIP, air);
    for (let i = 0; i < 400; i++) if (b.step(1 / 120, { ...emptyInput(), ...input(b) })) break;
    return b;
  };

  it('sem comando não gira; o giro vem das setas e do tempo de voo', () => {
    expect(Math.abs(fly(() => ({})).yaw)).toBeLessThan(5);
    const fs = fly((b) => ({ spin: b.t < 0.3 ? 1 : 0 }));
    const bs = fly((b) => ({ spin: b.t < 0.3 ? -1 : 0 }));
    expect(fs.yaw).toBeGreaterThan(100);
    expect(bs.yaw).toBeLessThan(-100);
  });

  it('o flip só acontece com ↑ e o voo é balístico', () => {
    expect(Math.abs(fly(() => ({})).flip)).toBeLessThan(5);
    expect(fly((b) => ({ flip: b.t < 0.4 })).flip).toBeGreaterThan(180);
    const b = fly(() => ({}));
    expect(b.t).toBeGreaterThan(0.5);
    expect(b.t).toBeLessThan(1.4);
  });

  it('o grab leva um tempo para a mão chegar à borda', () => {
    const b = new AirBody(wave, launch, 0, 0, 1.6, S_LIP, air);
    const inp = { ...emptyInput() };
    inp.grabs.indy = true;
    b.step(1 / 120, inp);
    expect(b.activeGrab()?.amount ?? 0).toBeLessThan(0.3);
    for (let i = 0; i < 40; i++) b.step(1 / 120, inp);
    expect(b.activeGrab()?.id).toBe('indy');
    expect(b.activeGrab()!.amount).toBeGreaterThan(0.9);
  });
});

describe('pouso', () => {
  const rec = ride('air-reverse', { animate: false }).lands[0].record;
  const p = { equilibrio: 60, equipLanding: 1 };

  it('alinhado é limpo; desalinhado é queda; o grab segurado no toque piora', () => {
    expect(evaluateLanding(rec, p).outcome).toBe('limpa');
    expect(evaluateLanding({ ...rec, yaw: rec.yaw - 90, maxYaw: rec.maxYaw - 90 }, p).outcome).toBe('queda');
    expect(evaluateLanding({ ...rec, grabAtTouch: 1 }, p).quality).toBeLessThan(evaluateLanding(rec, p).quality);
    expect(evaluateLanding({ ...rec, landedBehind: true }, p).outcome).toBe('queda');
  });

  it('pouso pior guarda menos velocidade e demora mais para recuperar', () => {
    const good = evaluateLanding(rec, p);
    const bad = evaluateLanding({ ...rec, prepAtTouch: 0, grabAtTouch: 0.8 }, p);
    expect(bad.speedKeep).toBeLessThanOrEqual(good.speedKeep);
    expect(bad.recovery).toBeGreaterThanOrEqual(good.recovery);
  });
});

describe('repertório pelo jogo inteiro (piloto automático)', () => {
  for (const m of MANEUVERS) {
    it(`${m.id}: a aproximação, o controle no ar e o pouso fazem o ${m.name}`, () => {
      const r = ride(m.id, { animate: false });
      expect(r.lands.length).toBe(1);
      const l = r.lands[0];
      expect(l.landing.outcome).not.toBe('queda');
      expect(recognize(l.record, l.landing).ids).toContain(m.id);
    });
  }

  it('aéreos difíceis exigem habilidade: com atributos baixos o piloto cai mais', () => {
    const hard = ['full-rotation', 'backflip', 'rodeo-flip', 'superman'];
    const falls = (level: number) => hard.filter((id) => {
      const l = ride(id, { animate: false, level }).lands[0];
      return !l || l.landing.outcome === 'queda' || !recognize(l.record, l.landing).ids.includes(id);
    }).length;
    expect(falls(28)).toBeGreaterThan(falls(60));
  });

  it('dá para emendar aéreos na mesma onda, com recuperação entre eles', () => {
    const r = ride('180-air', { animate: false, attempts: 3 });
    expect(r.lands.length).toBeGreaterThanOrEqual(2);
    const launches = r.events.filter((e) => e.kind === 'launch').length;
    expect(launches).toBe(r.lands.length);
  });

  it('logo depois do pouso ainda não dá para comprimir', () => {
    const run = new WaveRun(testWave(), params());
    const pilot = new AutoPilot(planFor(findManeuver('straight-air')!));
    pilot.maxAttempts = 1;
    const reasons: string[] = [];
    for (let i = 0; i < 120 * 20 && run.state !== 'fallen'; i++) {
      // Depois do pouso, aperta o espaço por cima do piloto.
      const inp = run.lastLanding && run.recovering ? { ...emptyInput(), aimX: 1, compress: true } : pilot.input(run);
      run.setInput(inp);
      run.update(1 / 120);
      for (const e of run.drain()) if (e.kind === 'refused') reasons.push(e.reason);
      if (run.lastLanding && !run.recovering) break;
    }
    expect(run.lastLanding).not.toBeNull();
    expect(reasons).toContain('recuperando');
  });
});

describe('amostragem rápida do oceano', () => {
  it('bate com a função exata usada na física', async () => {
    const m = await import('../src/sim/waveField');
    const w = m.createWave({ height: 1.8, power: 70, windSpeed: 20, time: 2.3, breakX0: -15 });
    const S = new m.FieldSampler(w);
    const amp = m.swellAmplitudes(w);
    const c = new Float64Array(12);
    const r = new Float64Array(12);
    for (const [x, z] of [[0, 0], [5, 1.2], [-12, 3], [20, -4], [8, 7]]) {
      m.swellColumn(w, x, c);
      m.swellRow(w, z, r);
      const col = S.column(x);
      const fast = S.height(col.crestH, z - col.offset, m.swellFrom(amp, c, r));
      expect(Math.abs(fast - m.surfaceHeight(w, x, z))).toBeLessThan(0.01);
      expect(Math.abs(S.foam(col, z - col.offset, m.streakFrom(c, r)) - m.foamAt(w, x, z))).toBeLessThan(0.02);
    }
  });
});
