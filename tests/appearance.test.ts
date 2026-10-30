import { describe, expect, it } from 'vitest';
import {
  CATALOG,
  DEFAULT_LOOK,
  GARMENTS,
  REGION_PLACE,
  TATTOO_REGIONS,
  activeGarments,
  cloneLook,
  coverageOf,
  findItem,
  itemsOf,
  lookItemIds,
  migrateLoadout,
  tattooCovered,
  type Category,
} from '../src/data/cosmetics';
import { BOARDS, boardMeters } from '../src/data/equipment';
import { HeatSession } from '../src/core/heat';
import { applyXp, xpToNext } from '../src/core/progression';
import { seededRng } from '../src/core/rng';
import { SAVE_KEY, V2_SAVE_KEY, defaultSave, loadSave, sanitizeSave, writeSave, type KeyValueStore } from '../src/core/save';
import { isUnlocked, refreshCosmetics, sanitizeLook, unlockText } from '../src/core/unlocks';
import { limbV } from '../src/render/SurferRig';
import { TATTOO_DESIGNS } from '../src/render/paint';

function memoryStore(): KeyValueStore {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

describe('catálogo de aparência', () => {
  it('tem ids únicos e estáveis', () => {
    const ids = CATALOG.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Ids usados por salvamentos: não podem mudar de nome.
    for (const id of ['pele-01', 'pele-12', 'curto', 'blackpower', 'cabelo-azul', 'neo-completo', 'top-lycra-curta', 'bermuda-media', 'estampa-floral', 'cor-preto', 'tattoo-tribal', 'arte-faixa', 'acab-fosco', 'perfil-reto']) {
      expect(findItem(id), id).toBeDefined();
    }
  });

  it('oferece variedade de verdade em cada categoria', () => {
    const min: Partial<Record<Category, number>> = { pele: 12, cabelo: 10, corCabelo: 14, olhos: 6, barba: 5, neoprene: 5, parteCima: 4, bermuda: 3, estampa: 8, cor: 20, tatuagem: 12, arte: 6 };
    for (const [cat, n] of Object.entries(min)) expect(itemsOf(cat as Category).length, cat).toBeGreaterThanOrEqual(n!);
    expect(TATTOO_REGIONS.length).toBeGreaterThanOrEqual(12);
  });

  it('todo tom de pele, olho e cor natural de cabelo está liberado desde o início', () => {
    const s = defaultSave();
    for (const c of [...itemsOf('pele'), ...itemsOf('olhos'), ...itemsOf('corCabelo').filter((i) => i.tags.includes('natural'))]) {
      expect(isUnlocked(c.id, s), c.id).toBe(true);
    }
    // Os tons vão do mais claro ao mais escuro.
    const lum = itemsOf('pele').map((c) => ((c.color! >> 16) & 255) * 0.3 + ((c.color! >> 8) & 255) * 0.59 + (c.color! & 255) * 0.11);
    for (let i = 1; i < lum.length; i++) expect(lum[i]).toBeLessThan(lum[i - 1]);
  });

  it('a maior parte começa liberada e o padrão só usa itens liberados', () => {
    const s = defaultSave();
    const open = CATALOG.filter((c) => isUnlocked(c.id, s)).length;
    expect(open / CATALOG.length).toBeGreaterThan(0.65);
    for (const id of lookItemIds(DEFAULT_LOOK)) expect(isUnlocked(id, s), id).toBe(true);
  });

  it('cada tatuagem do catálogo tem desenho', () => {
    for (const t of itemsOf('tatuagem')) expect(TATTOO_DESIGNS).toContain(t.id.replace('tattoo-', ''));
  });

  it('não tem campos de desempenho: aparência não muda atributo, chance nem física', () => {
    for (const c of CATALOG) expect(Object.keys(c).sort()).toEqual(expect.arrayContaining(['category', 'id', 'name', 'tags', 'unlock']));
    for (const c of CATALOG) expect(c).not.toHaveProperty('mods');
    const dims = BOARDS.map((b) => boardMeters(b.dims));
    // Duas aparências muito diferentes: mesma bateria, mesmos números.
    const run = () => {
      const h = new HeatSession({ boardId: 'standard', finId: 'thruster', locationId: 'pico-leste', height: 1.5, power: 60, windType: 'terral', windSpeed: 10, sectionQuality: 60 }, defaultSave().attributes, defaultSave().unlockedManeuvers, [], seededRng(5));
      h.spin();
      return h.estimate();
    };
    const a = run();
    const look = cloneLook(DEFAULT_LOOK);
    look.board = { deck: 'cor-rosa', bottom: 'cor-preto', art: 'arte-listras', artColor: 'cor-lima', noseTail: 'cor-azul', finish: 'acab-fosco' };
    look.fins = { ...look.fins, transparent: true, profile: 'perfil-inclinado' };
    expect(run()).toEqual(a);
    expect(BOARDS.map((b) => boardMeters(b.dims))).toEqual(dims);
  });
});

describe('desbloqueios', () => {
  it('libera por nível, conquista e domínio, e mostra o requisito', () => {
    const s = defaultSave();
    expect(isUnlocked('cabelo-azul', s)).toBe(false);
    expect(unlockText(findItem('cabelo-azul')!.unlock)).toBe('Nível 2');
    applyXp(s, xpToNext(1));
    expect(isUnlocked('cabelo-azul', s)).toBe(true);

    expect(isUnlocked('cabelo-roxo', s)).toBe(false);
    expect(unlockText(findItem('cabelo-roxo')!.unlock)).toBe('Conquista: Primeiro pouso');
    s.stats.landed = 1;
    expect(isUnlocked('cabelo-roxo', s)).toBe(true);

    expect(isUnlocked('cabelo-laranja', s)).toBe(false);
    expect(unlockText(findItem('cabelo-laranja')!.unlock)).toMatch(/Domínio rotação 30/);
    s.mastery.rotacao = 30;
    expect(isUnlocked('cabelo-laranja', s)).toBe(true);
  });

  it('avisa cada item novo uma vez só', () => {
    const s = defaultSave();
    s.level = 3;
    const fresh = refreshCosmetics(s).map((c) => c.id);
    expect(fresh).toContain('cabelo-rosa');
    expect(fresh).toContain('moicano');
    expect(refreshCosmetics(s)).toEqual([]);
  });

  it('não equipa item bloqueado vindo do salvamento', () => {
    const s = defaultSave();
    const look = sanitizeLook({ ...DEFAULT_LOOK, hair: 'moicano', hairColor: 'cabelo-laranja', board: { ...DEFAULT_LOOK.board, art: 'arte-chamas' } }, s);
    expect(look.hair).toBe(DEFAULT_LOOK.hair);
    expect(look.hairColor).toBe(DEFAULT_LOOK.hairColor);
    expect(look.board.art).toBe(DEFAULT_LOOK.board.art);
    expect(sanitizeLook({ ...DEFAULT_LOOK, fins: { ...DEFAULT_LOOK.fins, transparent: true } }, s).fins.transparent).toBe(false);
  });
});

describe('tatuagens', () => {
  it('ficam presas a uma região do corpo, com tamanho e rotação limitados', () => {
    const s = defaultSave();
    const look = sanitizeLook({
      ...DEFAULT_LOOK,
      tattoos: [
        { design: 'tattoo-sol', region: 'peito', size: 9, rotation: 400 },
        { design: 'tattoo-lua', region: 'peito', size: 1, rotation: 0 }, // região repetida
        { design: 'tattoo-ondas', region: 'joelho', size: 1, rotation: 0 }, // região inexistente
        { design: 'tattoo-ancora', region: 'antebracoDir', size: 0.1, rotation: -30 },
      ],
    }, s);
    expect(look.tattoos).toEqual([
      { design: 'tattoo-sol', region: 'peito', size: 1.4, rotation: 180 },
      { design: 'tattoo-ancora', region: 'antebracoDir', size: 0.6, rotation: -30 },
    ]);
  });

  it('a roupa cobre a tatuagem só onde chega', () => {
    const look = cloneLook(DEFAULT_LOOK);
    look.tattoos = [
      { design: 'tattoo-ondas', region: 'panturrilhaEsq', size: 1, rotation: 0 },
      { design: 'tattoo-tribal', region: 'antebracoDir', size: 1, rotation: 0 },
      { design: 'tattoo-sol', region: 'pernaEsq', size: 1, rotation: 0 },
    ];
    look.suit = 'neo-completo';
    expect(look.tattoos.every((t) => tattooCovered(look, t))).toBe(true);
    look.suit = 'neo-spring';
    expect(look.tattoos.map((t) => tattooCovered(look, t))).toEqual([false, false, true]);
    look.suit = 'neo-nenhum';
    look.top = 'top-nenhum';
    look.bottom = 'bermuda-curta';
    expect(look.tattoos.map((t) => tattooCovered(look, t))).toEqual([false, false, false]);
    look.bottom = 'bermuda-longa';
    expect(tattooCovered(look, look.tattoos[2])).toBe(true);
  });

  it('cada região aponta para uma parte do corpo que existe na roupa', () => {
    const roles = new Set(Object.values(GARMENTS).flatMap((g) => Object.keys(g.coverage)));
    for (const r of TATTOO_REGIONS) expect(roles.has(REGION_PLACE[r].role), r).toBe(true);
    // Posição ao longo do membro: v cai do topo para baixo e fica dentro da textura.
    let last = 2;
    for (let t = 0; t <= 1; t += 0.1) {
      expect(limbV(t)).toBeLessThan(last);
      expect(limbV(t)).toBeGreaterThanOrEqual(0);
      expect(limbV(t)).toBeLessThanOrEqual(1);
      last = limbV(t);
    }
  });
});

describe('roupas', () => {
  it('neoprene substitui as peças avulsas; sem neoprene, bermuda e parte de cima', () => {
    const look = cloneLook(DEFAULT_LOOK);
    expect(activeGarments(look).map((g) => g.id)).toEqual(['neo-completo']);
    look.suit = 'neo-nenhum';
    look.top = 'top-lycra-longa';
    expect(activeGarments(look).map((g) => g.id)).toEqual(['bermuda-media', 'top-lycra-longa']);
    expect(coverageOf(look, 'forearm')).toBeGreaterThan(0.9);
    expect(coverageOf(look, 'shin')).toBe(0);
    look.top = 'top-nenhum';
    expect(coverageOf(look, 'chest')).toBe(0);
  });

  it('bermudas têm comprimentos diferentes', () => {
    expect(GARMENTS['bermuda-curta'].coverage.thigh!).toBeLessThan(GARMENTS['bermuda-media'].coverage.thigh!);
    expect(GARMENTS['bermuda-media'].coverage.thigh!).toBeLessThan(GARMENTS['bermuda-longa'].coverage.thigh!);
  });
});

describe('migração do salvamento', () => {
  it('converte o equipamento da versão 2 sem perder nada', () => {
    const store = memoryStore();
    store.setItem(V2_SAVE_KEY, JSON.stringify({
      version: 2, level: 4, xp: 10, attributes: { rotacao: 55 },
      unlockedCosmetics: ['bermuda-coral', 'cabelo-coque', 'cor-ruivo', 'tattoo-tribal', 'acess-relogio', 'prancha-vermelha', 'graf-xadrez'],
      loadout: { roupa: 'bermuda-coral', cabelo: 'cabelo-coque', corCabelo: 'cor-ruivo', tatuagem: 'tattoo-tribal', acessorio: 'acess-relogio', corPrancha: 'prancha-vermelha', grafismo: 'graf-xadrez' },
    }));
    const s = loadSave(store);
    expect(s).toMatchObject({ version: 3, level: 4, xp: 10, attributes: { rotacao: 55 } });
    expect(s.look).toMatchObject({
      suit: 'neo-nenhum', bottom: 'bermuda-media', hair: 'coque', hairColor: 'cabelo-ruivo', accessory: 'acess-relogio',
      board: { deck: 'cor-vermelho', art: 'arte-xadrez' },
      tattoos: [{ design: 'tattoo-tribal', region: 'antebracoEsq', size: 1, rotation: 0 }],
    });
    expect(s.look.bottomStyle.colors[0]).toBe('cor-coral');
    // Bico xadrez libera no nível 5, mas quem já usava continua com ele depois de salvar de novo.
    writeSave(store, s);
    expect(store.getItem(SAVE_KEY)).not.toBeNull();
    expect(loadSave(store).look.board.art).toBe('arte-xadrez');
  });

  it('cada traje antigo vira um traje equivalente', () => {
    expect(migrateLoadout({ roupa: 'long-preto' }).look.suit).toBe('neo-completo');
    expect(migrateLoadout({ roupa: 'spring-azul' }).look.suit).toBe('neo-spring');
    expect(migrateLoadout({ roupa: 'spring-neon' }).look.suitStyle.colors[2]).toBe('cor-lima');
    expect(migrateLoadout({ tatuagem: 'tattoo-ondas' }).look.tattoos[0].region).toBe('panturrilhaEsq');
  });

  it('dados quebrados na aparência voltam ao padrão sem apagar o resto', () => {
    const s = sanitizeSave({ level: 3, look: { skin: 'pele-11', hair: 42, tattoos: 'x', board: null, fins: { profile: 'perfil-inclinado' } } });
    expect(s.level).toBe(3);
    expect(s.look.skin).toBe('pele-11');
    expect(s.look.hair).toBe(DEFAULT_LOOK.hair);
    expect(s.look.tattoos).toEqual([]);
    expect(s.look.board).toEqual(DEFAULT_LOOK.board);
    expect(s.look.fins.profile).toBe('perfil-inclinado');
  });
});

describe('interface', () => {
  const sources = import.meta.glob('../src/ui/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

  it('não usa emoji como ícone (ícones são SVG)', () => {
    for (const [file, text] of Object.entries(sources)) expect(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}]/u.test(text), file).toBe(false);
  });

  it('todo botão do vestiário tem uma ação tratada', () => {
    const text = sources['../src/ui/locker.ts'];
    const actions = new Set([...text.matchAll(/data-action="([a-zA-Z]+)"/g)].map((m) => m[1]));
    for (const a of actions) expect(new RegExp(`\\b${a}\\s*[:,]`).test(text), a).toBe(true);
  });
});
