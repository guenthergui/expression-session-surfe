import { describe, expect, it } from 'vitest';
import { GRAB_CODES, KeyReplay, KeyboardControls, RIDE_CODES, emptyInput, inputToKeys } from '../src/core/controls';
import type { WaveState } from '../src/sim/waveField';
import { generateWaveConditions, defaultSetup } from '../src/core/conditions';
import { HeatSession } from '../src/core/heat';
import { GUIDES, bonusLines, challengeHint, guideFor } from '../src/core/maneuverGuide';
import { MANEUVERS, findManeuver, recognize } from '../src/core/maneuvers';
import { sanitizeSave } from '../src/core/save';
import { INITIAL_ATTRIBUTES } from '../src/data/attributes';
import { LOCATIONS } from '../src/data/locations';
import { AutoPilot, planFor } from '../src/sim/autopilot';
import { createWave } from '../src/sim/waveField';
import { WaveRun } from '../src/sim/waveRun';
import { params, ride, testWave } from './helpers';

/** Onda inteira com o piloto passando pelo teclado (como na tela de treino). */
function digitalRide(id: string, wave: WaveState, level: number, sectionQuality = 60): boolean {
  const m = findManeuver(id)!;
  const run = new WaveRun(wave, params(level, { sectionQuality }));
  const pilot = new AutoPilot(planFor(m));
  pilot.dropAt = 0.9;
  pilot.maxAttempts = 1;
  const keys = new KeyReplay();
  let ok = false;
  for (let i = 0; i < 60 * 34 && !run.lastLanding && run.state !== 'fallen' && run.state !== 'finished'; i++) {
    run.setInput(keys.feed(pilot.input(run), run.state === 'airborne'));
    run.update(1 / 60);
    for (const e of run.drain()) {
      if (e.kind === 'launch') keys.takeoff();
      if (e.kind === 'land') ok = e.landing.outcome !== 'queda' && recognize(e.record, e.landing).ids.includes(m.id);
    }
  }
  return ok;
}

const WIND = { terral: { x: 0, z: -1 }, maral: { x: 0, z: 1 }, lateral: { x: 1, z: 0 } } as const;

describe('biblioteca de manobras (mesma fonte do jogo)', () => {
  it('tem um guia completo para cada um dos 22 aéreos', () => {
    expect(GUIDES.map((g) => g.id)).toEqual(MANEUVERS.map((m) => m.id));
    for (const g of GUIDES) {
      expect(g.steps.map((s) => s.phase)).toEqual(expect.arrayContaining(['aproximacao', 'posicao', 'compressao', 'pop', 'ar', 'pouso', 'recuperacao']));
      expect(g.errors.length).toBeGreaterThan(2);
      expect(g.tips.length).toBeGreaterThan(0);
      expect(g.labScene, g.id).not.toBe('');
      expect(g.stars).toBeGreaterThanOrEqual(1);
    }
  });

  it('só usa teclas que existem no jogo', () => {
    for (const g of GUIDES) for (const s of g.steps) for (const k of s.keys) expect(RIDE_CODES as readonly string[], `${g.id}: ${k}`).toContain(k);
  });

  it('as teclas do ar batem com o plano do piloto que faz a demonstração', () => {
    for (const m of MANEUVERS) {
      const p = planFor(m);
      const g = guideFor(m);
      if (p.grab) expect(g.airKeys, m.id).toContain(GRAB_CODES[p.grab]);
      if (p.yaw > 0) expect(g.airKeys, m.id).toContain('ArrowRight');
      if (p.yaw < 0) expect(g.airKeys, m.id).toContain('ArrowLeft');
      if (p.flip) expect(g.airKeys, m.id).toContain('ArrowUp');
      if (p.extension) expect(g.airKeys, m.id).toContain('KeyS');
    }
  });

  it('o bônus do desafio e o de descoberta aparecem só quando valem', () => {
    expect(bonusLines(findManeuver('backflip')!).join(' ')).toMatch(/descoberta/);
    expect(bonusLines(findManeuver('straight-air')!).join(' ')).not.toMatch(/descoberta/);
    expect(bonusLines(findManeuver('air-reverse')!)[0]).toMatch(/×1,5/);
  });
});

describe('teclas da demonstração', () => {
  it('inputToKeys desfaz a leitura do teclado', () => {
    const sets = [['KeyW', 'ArrowRight'], ['ArrowDown'], ['Space', 'ArrowLeft', 'ArrowUp'], ['ArrowRight', 'KeyZ', 'KeyS'], ['ArrowUp', 'ArrowDown'], ['KeyX', 'KeyC']];
    for (const airborne of [false, true]) {
      for (const set of sets) {
        const k = new KeyboardControls();
        for (const c of set) k.press(c);
        const inp = k.read(airborne);
        const back = new KeyboardControls();
        for (const c of inputToKeys(inp, airborne)) back.press(c);
        expect(back.read(airborne), `${airborne} ${set}`).toEqual(inp);
      }
    }
  });

  it('com as teclas mostradas na tela (só as setas, sem ajuste fino), cada aéreo sai', () => {
    const fails: string[] = [];
    for (const m of MANEUVERS) if (!digitalRide(m.id, testWave(), 60)) fails.push(m.id);
    expect(fails).toEqual([]);
  });

  it('tecla segurada de antes da onda não entra pela repetição automática', () => {
    const k = new KeyboardControls();
    k.press('Space', true);
    expect(k.isDown('Space')).toBe(false);
    k.press('Space');
    k.press('Space', true);
    expect(k.isDown('Space')).toBe(true);
    expect(k.read(false).compress).toBe(true);
  });
});

describe('demonstração na onda real', () => {
  it('a demonstração (pelo teclado) pousa cada aéreo nas condições de cada local', () => {
    const fails: string[] = [];
    for (const loc of LOCATIONS) for (const r of [0.1, 0.5, 0.9]) {
      const c = generateWaveConditions(defaultSetup(loc.id), () => r);
      for (const m of MANEUVERS) {
        const wave = createWave({ height: c.height, power: c.power, windSpeed: loc.windAffects ? c.windSpeed : 0, windDir: WIND[c.windType], pool: !loc.windAffects, peelSpeed: 3.8 + c.power / 40 });
        const ok = digitalRide(m.id, wave, 62, c.sectionQuality);
        if (!ok) fails.push(`${loc.id}@${r}:${m.id}`);
      }
    }
    expect(fails).toEqual([]);
  });
});

describe('dica quando o aéreo não foi o desafio', () => {
  it('não aparece quando o aéreo foi o desafio', () => {
    for (const m of MANEUVERS) {
      const l = ride(m.id, { animate: false }).lands[0];
      expect(challengeHint(recognize(l.record, l.landing), m), m.id).toBeNull();
    }
  });

  it('explica o que faltou', () => {
    const land = (id: string) => {
      const l = ride(id, { animate: false }).lands[0];
      return recognize(l.record, l.landing);
    };
    expect(challengeHint(land('straight-air'), findManeuver('air-reverse')!)).toMatch(/giro/i);
    expect(challengeHint(land('180-air'), findManeuver('air-reverse')!)).toMatch(/lado errado/);
    expect(challengeHint(land('straight-air'), findManeuver('indy-air')!)).toMatch(/Z/);
    expect(challengeHint(land('360-air'), findManeuver('backflip')!)).toMatch(/flip/);
    expect(challengeHint(land('grab-air'), findManeuver('japan-air')!)).toMatch(/meio segundo/);
  });
});

describe('modo de treino', () => {
  it('fixa o aéreo sem a roleta e reconhece o desafio, sem mexer no salvamento', () => {
    const save = sanitizeSave({});
    const before = JSON.stringify(save);
    const heat = new HeatSession(defaultSetup(), { ...INITIAL_ATTRIBUTES }, save.unlockedManeuvers, save.discoveries, () => 0.5);
    heat.setChallenge(findManeuver('fs-air')!);
    const l = ride('fs-air', { animate: false }).lands[0];
    const a = heat.registerAerial(l.record, l.landing);
    expect(a.challenge).toBe(true);
    const r = heat.resolveWave('fim');
    expect(r.challengeDone).toBe(true);
    expect(JSON.stringify(save)).toBe(before);
  });

  it('preferências do treino são salvas e validadas', () => {
    const s = sanitizeSave({ prefs: { tutorial: 'experiente', skipTrained: true }, trained: ['air-reverse', 'nao-existe'] });
    expect(s.prefs.tutorial).toBe('experiente');
    expect(s.prefs.skipTrained).toBe(true);
    expect(s.trained).toEqual(['air-reverse']);
    expect(sanitizeSave({ prefs: { tutorial: 'x' } }).prefs.tutorial).toBe('iniciante');
  });
});

it('emptyInput não aperta nada', () => {
  expect(inputToKeys(emptyInput(), false)).toEqual([]);
  expect(inputToKeys(emptyInput(), true)).toEqual([]);
});
