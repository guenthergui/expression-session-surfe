import { describe, expect, it } from 'vitest';
import { INITIAL_ATTRIBUTES } from '../src/data/attributes';
import { CATALOG } from '../src/data/cosmetics';
import { BOARDS, FINS, boardMeters, findBoard, findFin } from '../src/data/equipment';
import { MANEUVER_DEFS } from '../src/data/maneuvers';
import { clampSetup, defaultSetup } from '../src/core/conditions';
import { HeatSession, WAVES_PER_HEAT } from '../src/core/heat';
import { MANEUVERS, buildSequence, findManeuver, validateManeuver, validateVariations } from '../src/core/maneuvers';
import { computeChance, resolveOutcome, P_MAX, P_MIN } from '../src/core/performance';
import { applyXp, refreshUnlocks, spendPoint, xpToNext } from '../src/core/progression';
import { applyHeatResult } from '../src/core/rewards';
import { seededRng } from '../src/core/rng';
import { pickManeuver } from '../src/core/roulette';
import { LEGACY_SAVE_KEY, SAVE_KEY, defaultSave, loadSave, sanitizeSave, writeSave, type KeyValueStore } from '../src/core/save';
import { computeScore, comboMultiplier, nextCombo, LIMITS } from '../src/core/scoring';
import { CommandTrack, LATE_WINDOW_MS, summarizeExecution } from '../src/core/timing';
import type { Conditions, Judgement, StepResult } from '../src/core/types';

const calm: Conditions = { height: 1.5, power: 50, windType: 'lateral', windSpeed: 0, sectionQuality: 50 };
const m = (id: string) => findManeuver(id)!;

function memoryStore(): KeyValueStore {
  const data: Record<string, string> = {};
  return {
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => { data[k] = v; },
    removeItem: (k) => { delete data[k]; },
  };
}

function runHeat(seed: number, judge: (i: number) => Judgement = () => 'perfect') {
  const save = defaultSave();
  const heat = new HeatSession(defaultSetup(), INITIAL_ATTRIBUTES, save.unlockedManeuvers, [], seededRng(seed));
  while (!heat.isOver) {
    const man = heat.spin();
    heat.resolve(man.sequence.map((step, i) => ({ step, judgement: judge(i) })));
  }
  return heat;
}

describe('catálogo de manobras', () => {
  it('tem as manobras pedidas, válidas e com ids únicos', () => {
    expect(MANEUVERS.length).toBeGreaterThanOrEqual(8);
    expect(new Set(MANEUVERS.map((x) => x.id)).size).toBe(MANEUVERS.length);
    for (const def of MANEUVER_DEFS) expect(validateManeuver(def), def.id).toEqual([]);
    const names = MANEUVERS.map((x) => x.name);
    for (const n of ['Straight Air', 'Air Reverse', 'Frontside Air', 'Backside Air', 'Frontside 360 Air', 'Backside 360 Air']) {
      expect(names).toContain(n);
    }
    expect(MANEUVERS.some((x) => x.family === 'grab')).toBe(true);
    expect(MANEUVERS.some((x) => x.family === 'combo')).toBe(true);
    expect(MANEUVERS.filter((x) => x.experimental).every((x) => x.origin)).toBe(true);
  });

  it('recusa combinações incompatíveis', () => {
    const base = MANEUVER_DEFS[0];
    expect(validateManeuver({ ...base, rotation: 90 })).not.toEqual([]);
    expect(validateManeuver({ ...base, rotation: 180, family: 'rotacao' })).not.toEqual([]); // giro sem direção
    expect(validateManeuver({ ...base, axis: 'flip', rotation: 360, direction: 'backside' })).not.toEqual([]); // flip não experimental
    expect(validateManeuver({ ...base, family: 'grab', direction: 'nenhuma', grab: 'stalefish' })).not.toEqual([]); // grab fora de alcance
    expect(validateVariations([{ ...base, variations: ['nao-existe'] }])).not.toEqual([]);
    const fs = m('fs-air');
    expect(validateVariations([{ ...fs, variations: ['bs-360'] }, m('bs-360')])).not.toEqual([]); // muda a direção
  });

  it('gera a sequência a partir dos componentes', () => {
    const seq = buildSequence(m('fs-360-mute'));
    expect(seq.map((s) => s.key)).toEqual(['SPACE', 'RIGHT', 'RIGHT', 'X', 'DOWN']);
    expect(seq[0].essential && seq[seq.length - 1].essential).toBe(true);
    expect(seq.find((s) => s.phase === 'grab')!.essential).toBe(false);
    expect(buildSequence(m('stalefish-air')).map((s) => s.key)).toEqual(['SPACE', 'LEFT', 'Z', 'DOWN']);
  });
});

describe('comandos e janelas de tempo', () => {
  const steps = buildSequence(m('air-reverse'));

  it('classifica Perfect, Good, Late e Miss', () => {
    const track = new CommandTrack(steps, 1000, 70);
    expect(track.press('SPACE', 1030)!.judgement).toBe('perfect');
    expect(track.press('RIGHT', 1000 + 420 + 110)!.judgement).toBe('good');
    expect(track.press('DOWN', 1000 + 950 - 200)!.judgement).toBe('late'); // cedo, mas dentro da janela
    expect(track.done).toBe(true);

    const t2 = new CommandTrack(steps, 1000, 70);
    expect(t2.press('SPACE', 0)).toBeNull(); // cedo demais, ignorado
    expect(t2.press('LEFT', 1000)!.judgement).toBe('miss'); // tecla errada
    expect(t2.update(1000 + 420 + LATE_WINDOW_MS + 1)).toEqual([1]);
  });

  it('Miss em comando essencial reprova a execução', () => {
    const all = (j: Judgement): StepResult[] => steps.map((step) => ({ step, judgement: j }));
    expect(summarizeExecution(all('perfect'))).toMatchObject({ quality: 1, essentialFailed: false });
    expect(summarizeExecution(all('late')).essentialFailed).toBe(false);
    expect(summarizeExecution(all('miss')).essentialFailed).toBe(true);
  });
});

describe('avaliação das manobras', () => {
  const base = { attributes: INITIAL_ATTRIBUTES, board: findBoard('standard'), fin: findFin('thruster'), conditions: calm, locationId: 'pico-leste', waveIndex: 0 };

  it('fica sempre entre os limites', () => {
    const maxed = Object.fromEntries(Object.keys(INITIAL_ATTRIBUTES).map((k) => [k, 100])) as typeof INITIAL_ATTRIBUTES;
    expect(computeChance({ ...base, attributes: maxed, maneuver: m('straight-air'), executionQuality: 1 }).P).toBe(P_MAX);
    expect(computeChance({ ...base, maneuver: m('fs-540-melon'), executionQuality: 0 }).P).toBe(P_MIN);
  });

  it('manobras fáceis são acessíveis e as avançadas exigem habilidade', () => {
    const p = (id: string, q: number) => computeChance({ ...base, maneuver: m(id), executionQuality: q }).P;
    expect(p('straight-air', 0.8)).toBeGreaterThan(65);
    expect(p('air-reverse', 0.8)).toBeLessThan(p('straight-air', 0.8));
    expect(p('fs-360', 1)).toBeLessThan(p('air-reverse', 1));
    expect(p('rodeo-flip', 0.5)).toBeLessThan(15);
  });

  it('a execução é o fator principal', () => {
    const run = (q: number) => computeChance({ ...base, maneuver: m('air-reverse'), executionQuality: q });
    const swing = run(1).P - run(0.2).P;
    const maxed = { ...INITIAL_ATTRIBUTES, impulsao: 60, amplitude: 55, forca: 60, equilibrio: 60, rotacao: 55, controleAereo: 60 };
    const attrSwing = computeChance({ ...base, attributes: maxed, maneuver: m('air-reverse'), executionQuality: 0.6 }).P -
      computeChance({ ...base, maneuver: m('air-reverse'), executionQuality: 0.6 }).P;
    expect(swing).toBeGreaterThan(attrSwing);
    expect(swing).toBeGreaterThanOrEqual(40);
  });

  it('condições ruins reduzem a chance e a leitura de onda atenua', () => {
    const bad: Conditions = { height: 0.75, power: 35, windType: 'terral', windSpeed: 25, sectionQuality: 15 };
    const ok = computeChance({ ...base, maneuver: m('fs-360') }).C;
    const poor = computeChance({ ...base, maneuver: m('fs-360'), conditions: bad }).C;
    const reader = computeChance({ ...base, maneuver: m('fs-360'), conditions: bad, attributes: { ...INITIAL_ATTRIBUTES, leituraOnda: 100 } }).C;
    expect(poor).toBeLessThan(ok);
    expect(reader).toBeGreaterThan(poor);
  });

  it('domínio técnico ajuda, com limite', () => {
    const a = computeChance({ ...base, maneuver: m('air-reverse'), mastery: 0 });
    const b = computeChance({ ...base, maneuver: m('air-reverse'), mastery: 500 });
    expect(b.masteryBonus).toBe(10);
    expect(b.P).toBeGreaterThan(a.P);
  });

  it('nenhuma prancha ou quilha é melhor em todas as fases', () => {
    for (const list of [BOARDS, FINS] as const) {
      for (const eq of list) {
        const others = list.filter((o) => o.id !== eq.id);
        const dominates = others.every((o) =>
          (Object.keys(eq.mods) as (keyof typeof eq.mods)[]).every((p) => eq.mods[p] >= o.mods[p]),
        );
        expect(dominates, eq.name).toBe(false);
      }
    }
  });

  it('medidas das pranchas viram metros reais', () => {
    const std = boardMeters(findBoard('standard').dims);
    expect(std.length).toBeCloseTo(1.778, 3);
    expect(std.width).toBeCloseTo(0.4699, 3);
    expect(std.thickness).toBeCloseTo(0.05715, 4);
  });

  it('pouso depende da rolagem e de comandos essenciais', () => {
    expect(resolveOutcome(97, 0, true, 1)).toBe('queda');
    expect(resolveOutcome(80, 75, false, 1)).toBe('instavel');
    expect(resolveOutcome(80, 10, false, 1)).toBe('limpa');
    expect(resolveOutcome(80, 10, false, 0.5)).toBe('concluida');
    expect(resolveOutcome(50, 60, false, 1)).toBe('queda');
  });
});

describe('pontuação e combos', () => {
  const input = {
    maneuver: m('air-reverse'), outcome: 'concluida' as const, executionQuality: 0.8, grabMissed: false,
    estilo: 20, timesLandedThisHeat: 0, isNewDiscovery: false, comboAfter: 1,
  };

  it('queda vale zero e zera o combo; pouso limpo excepcional soma 2', () => {
    expect(computeScore({ ...input, outcome: 'queda' }).total).toBe(0);
    expect(nextCombo(4, 'queda', 1)).toBe(0);
    expect(nextCombo(2, 'limpa', 0.95)).toBe(4);
    expect(nextCombo(2, 'instavel', 0.5)).toBe(2);
  });

  it('repetir rende menos, sem zerar', () => {
    const first = computeScore(input).total;
    const third = computeScore({ ...input, timesLandedThisHeat: 2 }).total;
    expect(third).toBeLessThan(first);
    expect(third).toBeGreaterThan(first * 0.5);
  });

  it('pouso limpo vale mais que instável', () => {
    expect(computeScore({ ...input, outcome: 'limpa' }).total).toBeGreaterThan(computeScore({ ...input, outcome: 'instavel' }).total);
  });

  it('respeita os limites dos multiplicadores', () => {
    expect(comboMultiplier(100)).toBe(LIMITS.combo[1]);
    const s = computeScore({ ...input, maneuver: m('fs-540-melon'), outcome: 'limpa', executionQuality: 1, estilo: 100, isNewDiscovery: true, comboAfter: 50 });
    expect(s.execution).toBeLessThanOrEqual(LIMITS.execution[1]);
    expect(s.total).toBeLessThanOrEqual(2200 * 1.4 * 1.25 * 2 * 1.5 * 2.5);
  });
});

describe('roleta', () => {
  const save = defaultSave();
  const pool = MANEUVERS.filter((x) => save.unlockedManeuvers.includes(x.id));

  it('desafios acima da capacidade são raros no começo', () => {
    const rng = seededRng(42);
    let hard = 0;
    for (let i = 0; i < 2000; i++) if (pickManeuver(pool, INITIAL_ATTRIBUTES, [], rng).difficulty >= 60) hard++;
    expect(hard / 2000).toBeLessThan(0.05);
  });

  it('só sorteia manobras desbloqueadas', () => {
    const rng = seededRng(7);
    for (let i = 0; i < 500; i++) expect(save.unlockedManeuvers).toContain(pickManeuver(pool, INITIAL_ATTRIBUTES, [], rng).id);
  });
});

describe('atributos, nível e desbloqueios', () => {
  it('sobe de nível, ganha pontos e libera conteúdo e cosméticos', () => {
    const save = defaultSave();
    const r = applyXp(save, xpToNext(1) + xpToNext(2));
    expect(save.level).toBe(3);
    expect(r.pointsGained).toBe(8);
    expect(save.unlockedLocations).toContain('lagoa-azul');
    expect(save.unlockedManeuvers).toContain('fs-360-mute');
    expect(save.unlockedCosmetics).toContain('cabelo-rosa');
    expect(r.unlocks.length).toBeGreaterThan(0);
    expect(refreshUnlocks(save)).toEqual([]); // nada liberado em dobro
    expect(CATALOG.every((c) => c.unlock.kind !== 'level' || c.unlock.level >= 2)).toBe(true);
  });

  it('não gasta além do saldo nem passa de 100', () => {
    const save = defaultSave();
    expect(spendPoint(save, 'forca')).toBe(false);
    save.skillPoints = 5;
    save.attributes.forca = 99;
    expect(spendPoint(save, 'forca')).toBe(true);
    expect(spendPoint(save, 'forca')).toBe(false);
    expect(save.skillPoints).toBe(4);
  });
});

describe('bateria de cinco ondas', () => {
  it('tem exatamente cinco ondas e soma o resultado', () => {
    const heat = runHeat(1);
    expect(heat.results.length).toBe(WAVES_PER_HEAT);
    expect(() => heat.resolve([])).toThrow();
    const sum = heat.summary();
    expect(sum.total).toBe(heat.results.reduce((a, r) => a + r.score.total, 0));
    expect(sum.waveScores.length).toBe(5);
    expect(sum.landed + sum.falls).toBe(5);
    expect(sum.successRate).toBeCloseTo(sum.landed / 5);
  });

  it('o jogador progride mesmo caindo em tudo', () => {
    const heat = runHeat(3, () => 'miss');
    const sum = heat.summary();
    expect(sum.falls).toBe(5);
    const save = defaultSave();
    const rewards = applyHeatResult(save, sum);
    expect(sum.xp).toBeGreaterThan(0);
    expect(rewards.pointsGained).toBeGreaterThanOrEqual(1);
    expect(save.mastery[heat.results[0].maneuver.family]).toBeGreaterThan(0);
  });

  it('boa execução pontua mais que execução fraca, em média', () => {
    let good = 0;
    let weak = 0;
    for (let s = 0; s < 30; s++) {
      good += runHeat(100 + s, () => 'perfect').total;
      weak += runHeat(100 + s, (i) => (i === 0 ? 'late' : 'good')).total;
    }
    expect(good).toBeGreaterThan(weak);
  });
});

describe('salvamento', () => {
  it('salva e recupera', () => {
    const store = memoryStore();
    const save = defaultSave();
    save.level = 4;
    save.attributes.rotacao = 77;
    save.mastery.rotacao = 33;
    save.look.board.deck = 'cor-amarelo';
    writeSave(store, save);
    expect(loadSave(store)).toMatchObject({ level: 4, attributes: { rotacao: 77 }, mastery: { rotacao: 33 }, look: { board: { deck: 'cor-amarelo' } } });
  });

  it('sobrevive a dados inválidos e migra o salvamento antigo', () => {
    const store = memoryStore();
    store.setItem(SAVE_KEY, '{quebrado');
    expect(loadSave(store).level).toBe(1);

    const weird = sanitizeSave({
      level: 'x', attributes: { forca: 500, rotacao: -3 }, unlockedLocations: ['nada'],
      lastSetup: { locationId: 'lagoa-azul' }, loadout: { roupa: 'spring-neon' }, prefs: { quality: 'super' },
    });
    expect(weird.level).toBe(1);
    expect(weird.attributes.forca).toBe(100);
    expect(weird.attributes.rotacao).toBe(0);
    expect(weird.unlockedLocations).not.toContain('nada');
    expect(weird.lastSetup.locationId).toBe('pico-leste'); // local bloqueado volta ao padrão
    expect(weird.look.suit).toBe('neo-completo'); // item não liberado não é equipado
    expect(weird.look.suitStyle.colors[0]).toBe('cor-preto');
    expect(weird.prefs.quality).toBe('alta');

    const legacy = memoryStore();
    legacy.setItem(LEGACY_SAVE_KEY, JSON.stringify({ level: 2, xp: 50, attributes: { rotacao: 40 } }));
    const migrated = loadSave(legacy);
    expect(migrated).toMatchObject({ version: 3, level: 2, xp: 50, attributes: { rotacao: 40 } });
  });

  it('ajusta a previsão aos limites do local', () => {
    const s = clampSetup({ ...defaultSetup('lagoa-azul'), height: 9, windSpeed: 40, sectionQuality: 100 });
    expect(s.height).toBe(1.75);
    expect(s.windSpeed).toBe(0);
    expect(s.sectionQuality).toBe(80);
  });
});
