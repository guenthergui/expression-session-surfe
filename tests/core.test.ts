import { describe, expect, it } from 'vitest';
import { INITIAL_ATTRIBUTES } from '../src/data/attributes';
import { CATALOG } from '../src/data/cosmetics';
import { BOARDS, FINS, boardMeters, findBoard } from '../src/data/equipment';
import { MANEUVER_DEFS } from '../src/data/maneuvers';
import { clampSetup, defaultSetup } from '../src/core/conditions';
import { FALL_FINISH, HeatSession, WAVES_PER_HEAT } from '../src/core/heat';
import { MANEUVERS, findManeuver, recognize, validateManeuver } from '../src/core/maneuvers';
import { conditionFactor, fatigueFactor } from '../src/core/performance';
import { applyXp, refreshUnlocks, spendPoint, xpToNext } from '../src/core/progression';
import { applyHeatResult } from '../src/core/rewards';
import { seededRng } from '../src/core/rng';
import { pickManeuver } from '../src/core/roulette';
import { LEGACY_SAVE_KEY, SAVE_KEY, defaultSave, loadSave, sanitizeSave, writeSave, type KeyValueStore } from '../src/core/save';
import { LIMITS, comboMultiplier, nextCombo, scoreAerial, sequenceMultiplier, type AerialScoreInput } from '../src/core/scoring';
import type { Conditions } from '../src/core/types';
import { evaluateLanding } from '../src/sim/landing';
import { ride } from './helpers';

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

/** Aéreos de verdade, feitos pelo piloto automático na física do jogo. */
const flights = new Map<string, ReturnType<typeof ride>['lands'][number]>();
function flight(id: string, mistake?: 'instavel' | 'queda') {
  const key = `${id}:${mistake ?? ''}`;
  if (!flights.has(key)) flights.set(key, ride(id, { animate: false, plan: mistake ? { mistake } : {} }).lands[0]);
  return flights.get(key)!;
}

function scoreOf(id: string, mistake?: 'instavel' | 'queda', extra: Partial<AerialScoreInput> = {}) {
  const f = flight(id, mistake);
  return scoreAerial({
    record: f.record, recognized: recognize(f.record, f.landing), landing: f.landing, estilo: 40,
    timesLanded: 0, isNewDiscovery: false, indexInWave: 1, challenge: false, unlocked: true, ...extra,
  });
}

const BASICOS = ['Straight Air', 'Frontside Air', 'Backside Air', 'Grab Air', 'Indy Air', 'Method Air', 'Stalefish Air'];
const ROTACAO = ['180 Air', 'Air Reverse', '360 Air', 'Full Rotation', 'Frontside 360', 'Backside 360', 'Alley-oop'];
const AVANCADOS = ['Backflip', 'Rodeo Flip', 'Superwoman', 'Superman', 'Christ Air', 'Tail Grab', 'Japan Air', 'Varial Air'];

describe('repertório de aéreos', () => {
  it('tem os 22 aéreos pedidos, válidos, com ids únicos e ficha completa', () => {
    expect(MANEUVERS.length).toBe(22);
    expect(new Set(MANEUVERS.map((x) => x.id)).size).toBe(22);
    for (const def of MANEUVER_DEFS) expect(validateManeuver(def), def.id).toEqual([]);
    const byTier = (t: string) => MANEUVERS.filter((x) => x.tier === t).map((x) => x.name).sort();
    expect(byTier('basico')).toEqual([...BASICOS].sort());
    expect(byTier('rotacao')).toEqual([...ROTACAO].sort());
    expect(byTier('avancado')).toEqual([...AVANCADOS].sort());
    for (const x of MANEUVERS) {
      expect(x.minSpeed, x.id).toBeGreaterThan(4);
      expect(x.approach[1], x.id).toBeGreaterThan(x.approach[0]);
      expect(x.height * x.airTime, x.id).toBeGreaterThan(0);
      expect(x.body && x.board && x.landing && x.howTo, x.id).toBeTruthy();
    }
  });

  it('cada aéreo tem identidade própria: dificuldade e exigências crescem com a complexidade', () => {
    const d = (id: string) => m(id).difficulty;
    expect(d('straight-air')).toBeLessThan(d('air-reverse'));
    expect(d('air-reverse')).toBeLessThan(d('fs-360'));
    expect(d('fs-360')).toBeLessThan(d('full-rotation'));
    expect(d('fs-360')).toBeLessThan(d('backflip'));
    expect(m('full-rotation').minSpeed).toBeGreaterThan(m('straight-air').minSpeed);
    expect(m('full-rotation').airTime).toBeGreaterThan(m('straight-air').airTime);
    // Mesmo giro e direção só se distinguem pela aproximação (180 Air × Alley-oop).
    const signatures = MANEUVERS.map((x) => `${x.direction}|${x.rotation}|${x.axis}|${x.grab}|${x.extension}|${x.approach}`);
    expect(new Set(signatures).size).toBe(22);
  });

  it('recusa fichas incoerentes', () => {
    const base = MANEUVER_DEFS[0];
    expect(validateManeuver({ ...base, rotation: 180, axis: 'nenhuma' })).not.toEqual([]);
    expect(validateManeuver({ ...base, id: 'x', rotation: 180, axis: 'giro', direction: 'nenhuma' })).not.toEqual([]);
    expect(validateManeuver({ ...base, approach: [70, 40] })).not.toEqual([]);
    expect(validateManeuver({ ...base, howTo: '' })).not.toEqual([]);
  });

  it('o nome sai do que foi feito no ar, incluindo combinações', () => {
    const f = ride('air-reverse', { animate: false, plan: { grab: 'indy' } }).lands[0];
    expect(recognize(f.record, f.landing).name).toBe('Air Reverse Indy');
  });
});

describe('pontuação por qualidade', () => {
  it('um aéreo difícil bem pousado vale mais que um simples', () => {
    expect(scoreOf('fs-360').total).toBeGreaterThan(scoreOf('straight-air').total);
    expect(scoreOf('air-reverse').total).toBeGreaterThan(scoreOf('fs-air').total);
  });

  it('pouso desequilibrado não ganha a nota máxima e queda vale zero', () => {
    const clean = scoreOf('indy-air');
    const shaky = scoreOf('indy-air', 'instavel');
    expect(flight('indy-air', 'instavel').landing.outcome).toBe('instavel');
    expect(shaky.total).toBeLessThan(clean.total * 0.8);
    expect(scoreOf('air-reverse', 'queda').total).toBe(0);
  });

  it('repetir rende menos, sem zerar; o desafio e a sequência na onda rendem mais', () => {
    const first = scoreOf('air-reverse').total;
    const again = scoreOf('air-reverse', undefined, { timesLanded: 3 }).total;
    expect(again).toBeLessThan(first);
    expect(again).toBeGreaterThan(0);
    expect(scoreOf('air-reverse', undefined, { challenge: true }).total).toBeGreaterThan(first);
    expect(scoreOf('air-reverse', undefined, { indexInWave: 2 }).total).toBeGreaterThan(first);
    expect(scoreOf('air-reverse', undefined, { unlocked: false }).total).toBeLessThan(first);
  });

  it('respeita os limites dos multiplicadores', () => {
    expect(sequenceMultiplier(1)).toBe(1);
    expect(sequenceMultiplier(20)).toBe(LIMITS.sequence[1]);
    expect(comboMultiplier(0)).toBe(1);
    expect(comboMultiplier(99)).toBeLessThanOrEqual(LIMITS.combo[1]);
    for (const id of ['straight-air', 'fs-360', 'backflip']) {
      const s = scoreOf(id);
      expect(s.execution).toBeGreaterThanOrEqual(LIMITS.execution[0]);
      expect(s.execution).toBeLessThanOrEqual(LIMITS.execution[1]);
    }
  });

  it('o combo entre ondas sobe com pousos e zera na queda', () => {
    expect(nextCombo(2, 'queda', 0)).toBe(0);
    expect(nextCombo(0, 'limpa', 0.9)).toBeGreaterThan(nextCombo(0, 'instavel', 0.9));
  });

  it('a altura e a velocidade da decolagem entram na execução', () => {
    const f = flight('straight-air');
    const low = { ...f.record, apex: f.record.apex * 0.5, airTime: f.record.airTime * 0.7, launch: { ...f.record.launch, speed: f.record.launch.speed * 0.7 } };
    const rec = recognize(f.record, f.landing);
    const base = { recognized: rec, landing: evaluateLanding(f.record, { equilibrio: 60, equipLanding: 1 }), estilo: 40, timesLanded: 0, isNewDiscovery: false, indexInWave: 1, challenge: false, unlocked: true };
    expect(scoreAerial({ ...base, record: low }).total).toBeLessThan(scoreAerial({ ...base, record: f.record }).total);
  });
});

describe('condições, cansaço e equipamento', () => {
  it('condições ruins atrapalham a projeção e a leitura de onda atenua', () => {
    const bad: Conditions = { height: 0.75, power: 35, windType: 'terral', windSpeed: 25, sectionQuality: 15 };
    const ok = conditionFactor(calm, m('fs-360'), 'pico-leste', 30);
    const poor = conditionFactor(bad, m('fs-360'), 'pico-leste', 30);
    const reader = conditionFactor(bad, m('fs-360'), 'pico-leste', 100);
    expect(poor).toBeLessThan(ok);
    expect(reader).toBeGreaterThan(poor);
    expect(poor).toBeGreaterThanOrEqual(0.88);
  });

  it('o cansaço cresce ao longo da bateria', () => {
    expect(fatigueFactor(INITIAL_ATTRIBUTES, 4)).toBeGreaterThanOrEqual(fatigueFactor(INITIAL_ATTRIBUTES, 0));
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
    expect(save.unlockedManeuvers).toContain('backflip');
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
  /** Uma bateria em que cada onda tem os aéreos dados (ids, com erro opcional). */
  function runHeat(seed: number, plan: (wave: number) => [string, ('instavel' | 'queda')?][], end: 'fim' | 'queda' = 'fim') {
    const save = defaultSave();
    const heat = new HeatSession(defaultSetup(), INITIAL_ATTRIBUTES, save.unlockedManeuvers, [], seededRng(seed));
    while (!heat.isOver) {
      heat.spin();
      for (const [id, mistake] of plan(heat.waveIndex)) {
        const f = flight(id, mistake);
        heat.registerAerial(f.record, f.landing);
        if (f.landing.outcome !== 'queda') heat.rideAway();
      }
      heat.resolveWave(end);
    }
    return heat;
  }

  it('tem exatamente cinco ondas e soma o resultado', () => {
    const heat = runHeat(1, () => [['straight-air']]);
    expect(heat.results.length).toBe(WAVES_PER_HEAT);
    expect(() => heat.resolveWave('fim')).toThrow();
    const sum = heat.summary();
    expect(sum.total).toBe(heat.results.reduce((a, r) => a + r.total, 0));
    expect(sum.waveScores.length).toBe(5);
    expect(sum.landed).toBe(5);
    expect(sum.perfects).toBe(5);
  });

  it('emendar aéreos na mesma onda soma mais, e sair surfando dá bônus', () => {
    const one = runHeat(2, () => [['air-reverse']]).results[0];
    const two = runHeat(2, () => [['air-reverse'], ['fs-air']]).results[0];
    expect(two.aerials.length).toBe(2);
    expect(two.total).toBeGreaterThan(one.total);
    expect(two.aerials[1].score.sequence).toBeGreaterThan(1);
    expect(one.aerials[0].rodeAway).toBe(true);
    expect(one.aerials[0].points).toBeGreaterThan(one.aerials[0].score.total);
  });

  it('terminar a onda caindo custa parte dos pontos', () => {
    const fim = runHeat(4, () => [['air-reverse']]).results[0];
    const queda = runHeat(4, () => [['air-reverse']], 'queda').results[0];
    expect(queda.total).toBe(Math.round(queda.subtotal * queda.combo * FALL_FINISH));
    expect(queda.total).toBeLessThan(fim.total);
  });

  it('o desafio sorteado vale mais quando é cumprido', () => {
    const save = defaultSave();
    const heat = new HeatSession(defaultSetup(), INITIAL_ATTRIBUTES, save.unlockedManeuvers, [], seededRng(9));
    const challenge = heat.spin();
    const f = flight(challenge.id);
    const a = heat.registerAerial(f.record, f.landing);
    expect(a.challenge).toBe(true);
    expect(a.score.challenge).toBe(1.5);
  });

  it('o jogador progride mesmo caindo em tudo', () => {
    const heat = runHeat(3, () => [['air-reverse', 'queda']], 'queda');
    const sum = heat.summary();
    expect(sum.falls).toBeGreaterThanOrEqual(5);
    expect(sum.total).toBe(0);
    const save = defaultSave();
    const rewards = applyHeatResult(save, sum);
    expect(sum.xp).toBeGreaterThan(0);
    expect(rewards.pointsGained).toBeGreaterThanOrEqual(1);
  });

  it('boa execução pontua mais que execução fraca', () => {
    const good = runHeat(10, () => [['indy-air']]).total;
    const weak = runHeat(10, () => [['indy-air', 'instavel']]).total;
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
