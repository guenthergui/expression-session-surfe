import { describe, expect, it } from 'vitest';
import { airPosition, airVelocity, planAerial } from '../src/sim/aerial';
import { DROP_TIME, STANDUP_TIME, WaveRun } from '../src/sim/waveRun';
import { createWave, crestHeight, foamAt, surfaceHeight, surfaceNormal } from '../src/sim/waveField';

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

describe('trajetória do aéreo', () => {
  const wave = createWave({ height: 1.6, power: 60, breakX0: -30 });
  const launch = { x: 0, y: surfaceHeight(wave, 0, 0.3), z: 0.3 };
  const base = { wave, launch, launchTime: 0, speed: 8, airTime: 1.27, amplitude: 25 };

  it('sai do lip e pousa no ponto planejado no tempo do comando de pouso', () => {
    const plan = planAerial({ ...base, takeoff: 1 });
    const end = airPosition(plan, plan.airTime);
    expect(end.x).toBeCloseTo(plan.landing.x, 6);
    expect(end.y).toBeCloseTo(plan.landing.y, 6);
    expect(end.z).toBeCloseTo(plan.landing.z, 6);
    expect(plan.apex).toBeGreaterThan(plan.launch.y + 0.8);
    expect(airVelocity(plan, plan.airTime).y).toBeLessThan(0);
  });

  it('decolagem melhor leva a um aéreo mais alto e pouso mais crítico', () => {
    const good = planAerial({ ...base, takeoff: 1 });
    const weak = planAerial({ ...base, takeoff: 0.4 });
    expect(good.apex).toBeGreaterThan(weak.apex);
    expect(good.landing.z).toBeLessThan(weak.landing.z);
  });

  it('mais velocidade na decolagem dá um aéreo mais alto', () => {
    const fast = planAerial({ ...base, takeoff: 1, speed: 9 });
    const slow = planAerial({ ...base, takeoff: 1, speed: 6.3 });
    expect(fast.apex).toBeGreaterThan(slow.apex);
  });
});

describe('aproximação: remada, drop, velocidade e decolagem', () => {
  const params = { forca: 30, controleAereo: 30, equipImpulse: 2 };
  const newRun = () => new WaveRun(createWave({ height: 1.5, power: 60, peelSpeed: 7 }), params);
  const step = (r: WaveRun, seconds: number, each?: (r: WaveRun) => void) => {
    for (let t = 0; t < seconds; t += 1 / 60) {
      each?.(r);
      r.update(1 / 60);
    }
  };
  /** Faz o drop e espera ficar em pé. */
  const standUp = (r: WaveRun) => {
    r.pressDrop();
    step(r, Math.max(DROP_TIME, STANDUP_TIME) + 0.05);
  };

  it('começa remando, deitado, e só sai disso com o D', () => {
    const r = newRun();
    expect(r.state).toBe('paddling');
    expect(r.standing).toBe(0);
    step(r, 3);
    expect(r.state).toBe('paddling'); // não levanta sozinho
    expect(r.speed).toBeLessThan(2);
  });

  it('o D inicia o drop uma vez só e o surfista levanta de forma contínua', () => {
    const r = newRun();
    expect(r.pressDrop()).toBe(true);
    expect(r.pressDrop()).toBe(false); // repetido é ignorado
    let last = 0;
    for (let t = 0; t < DROP_TIME + 0.1; t += 1 / 60) {
      r.update(1 / 60);
      expect(r.standing - last).toBeLessThan(0.05); // sem troca instantânea de pose
      last = r.standing;
    }
    expect(r.state).toBe('riding');
    expect(r.standing).toBe(1);
    expect(r.pressDrop()).toBe(false);
  });

  it('o W acelera aos poucos, respeita o limite e para quando solto', () => {
    const r = newRun();
    standUp(r);
    const v0 = r.speed;
    let maxJump = 0;
    let prev = r.speed;
    r.setAccelerate(true);
    step(r, 4, (x) => {
      maxJump = Math.max(maxJump, x.speed - prev);
      prev = x.speed;
    });
    expect(r.speed).toBeGreaterThan(v0 + 1.5);
    expect(r.speed).toBeLessThanOrEqual(r.vMax + 1e-9);
    expect(maxJump).toBeLessThan(0.1); // por quadro: aceleração gradual
    step(r, 20);
    expect(r.speed).toBeLessThanOrEqual(r.vMax + 1e-9); // nunca passa do limite
    r.setAccelerate(false);
    const vHeld = r.speed;
    step(r, 1);
    expect(r.speed).toBeLessThan(vHeld); // sem W, volta aos poucos ao cruzeiro
    expect(r.speed).toBeGreaterThan(r.vCruise);
  });

  it('o W não acelera enquanto o surfista está deitado', () => {
    const r = newRun();
    r.setAccelerate(true);
    step(r, 2);
    expect(r.speed).toBeLessThan(2);
  });

  it('o espaço antes da hora explica o motivo e não gasta a tentativa', () => {
    const r = newRun();
    expect(r.tryTakeoff()).toMatchObject({ ok: false, reason: 'deitado' });
    r.pressDrop();
    step(r, 0.2);
    expect(r.tryTakeoff()).toMatchObject({ ok: false, reason: 'levantando' });
    step(r, 1);
    expect(r.tryTakeoff()).toMatchObject({ ok: false, reason: 'velocidade' });
    expect(r.state).toBe('riding');
  });

  it('com velocidade, decola perto do lip; no pico é Perfect', () => {
    const r = newRun();
    standUp(r);
    r.setAccelerate(true);
    let attempt: ReturnType<WaveRun['tryTakeoff']> | null = null;
    step(r, 8, (x) => {
      if (!attempt && x.takeoffReady && Math.abs(x.timeToPeak()) < 0.02) attempt = x.tryTakeoff();
    });
    expect(attempt).toMatchObject({ ok: true, judgement: 'perfect' });
    expect(r.state).toBe('airborne');
    expect(r.tryTakeoff()).toMatchObject({ ok: false, reason: 'jaDecolou' });
  });

  it('longe do lip a decolagem é recusada, mesmo rápido', () => {
    const r = newRun();
    standUp(r);
    r.setAccelerate(true);
    let refused: ReturnType<WaveRun['tryTakeoff']> | null = null;
    step(r, 6, (x) => {
      if (!refused && x.speed > x.vMinTakeoff && Math.abs(x.timeToPeak()) > 0.6) refused = x.tryTakeoff();
    });
    expect(refused).toMatchObject({ ok: false, reason: 'posicao' });
  });

  it('com espera configurada, só decola depois do tempo da barra começar', () => {
    const r = new WaveRun(createWave({ height: 1.5, power: 60, peelSpeed: 7 }), { ...params, takeoffDelay: 3 });
    r.pressDrop();
    r.setAccelerate(true);
    let firstOk = Infinity;
    let refusedEarly = false;
    step(r, 10, (x) => {
      if (x.state !== 'riding' || firstOk < Infinity) return;
      if (x.t - x.dropAt! < 3 && x.speed > x.vMinTakeoff && Math.abs(x.timeToPeak()) < 0.1) {
        expect(x.takeoffReady).toBe(false);
        expect(x.tryTakeoff()).toMatchObject({ ok: false, reason: 'aguarde' });
        refusedEarly = true;
      }
      if (x.takeoffReady && Math.abs(x.timeToPeak()) < 0.02 && x.tryTakeoff().ok) firstOk = x.t - x.dropAt!;
    });
    expect(firstOk).toBeGreaterThanOrEqual(3);
    expect(firstOk).toBeLessThan(10);
    void refusedEarly;
  });

  it('o próximo pico do lip está sempre à frente ou dentro da janela', () => {
    const r = newRun();
    standUp(r);
    step(r, 6, (x) => {
      expect(x.nextPeakIn()).toBeGreaterThanOrEqual(-0.45 - 1e-9);
    });
  });

  it('quem fica lento é alcançado pela quebra', () => {
    const r = newRun();
    standUp(r);
    step(r, 40);
    expect(r.state).toBe('fallen');
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
