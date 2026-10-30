import { INITIAL_ATTRIBUTES, MAX_ATTRIBUTE } from '../data/attributes';
import { CATALOG, DEFAULT_LOOK, LEGACY_STARTER, cloneLook, migrateLoadout, type LegacyLoadout, type Look } from '../data/cosmetics';
import { BOARDS, FINS } from '../data/equipment';
import { LOCATIONS } from '../data/locations';
import { clampSetup, defaultSetup, type HeatSetup } from './conditions';
import { MANEUVERS } from './maneuvers';
import { clamp } from './rng';
import { sanitizeLook } from './unlocks';
import { ATTRIBUTE_KEYS, type Attributes, type ManeuverFamily } from './types';

export const SAVE_KEY = 'expression-session-save-v3';
/** Versão anterior (aparência por espaços). Lida uma vez e migrada. */
export const V2_SAVE_KEY = 'expression-session-save-v2';
/** Chave da versão 2D anterior. Lida uma vez para migrar o progresso. */
export const LEGACY_SAVE_KEY = 'expression-session-save-v1';
export const SAVE_VERSION = 3;

export const FAMILIES: ManeuverFamily[] = ['aereo', 'rotacao', 'grab', 'combo', 'experimental'];
export type Quality = 'baixa' | 'media' | 'alta' | 'ultra';
export type CameraMode = 'lateral' | 'proxima';
export const QUALITIES: Quality[] = ['baixa', 'media', 'alta', 'ultra'];

export interface Records {
  bestHeatScore: number;
  bestWaveScore: number;
  bestCombo: number;
  heatsPlayed: number;
  /** Melhor qualidade de execução numa onda, de 0 a 100. */
  bestExecution: number;
}

export interface Stats {
  waves: number;
  landed: number;
  falls: number;
  perfects: number;
}

export interface Prefs {
  quality: Quality;
  sound: boolean;
  /** Volume da música tema, de 0 (desligada) a 100. */
  music: number;
  camera: CameraMode;
}

export interface SaveData {
  version: number;
  attributes: Attributes;
  level: number;
  /** Experiência acumulada dentro do nível atual. */
  xp: number;
  skillPoints: number;
  /** Domínio técnico por família de manobras, 0 a 100. */
  mastery: Record<ManeuverFamily, number>;
  unlockedBoards: string[];
  unlockedFins: string[];
  unlockedLocations: string[];
  unlockedManeuvers: string[];
  /** Itens de aparência liberados por conquista, nível ou herdados da versão anterior. */
  unlockedCosmetics: string[];
  look: Look;
  discoveries: string[];
  records: Records;
  stats: Stats;
  prefs: Prefs;
  lastSetup: HeatSetup;
}

/** Armazenamento mínimo: localStorage no jogo, um objeto em memória nos testes. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    attributes: { ...INITIAL_ATTRIBUTES },
    level: 1,
    xp: 0,
    skillPoints: 0,
    mastery: { aereo: 0, rotacao: 0, grab: 0, combo: 0, experimental: 0 },
    unlockedBoards: BOARDS.filter((b) => b.unlockLevel <= 1).map((b) => b.id),
    unlockedFins: FINS.filter((f) => f.unlockLevel <= 1).map((f) => f.id),
    unlockedLocations: LOCATIONS.filter((l) => l.unlockLevel <= 1).map((l) => l.id),
    unlockedManeuvers: MANEUVERS.filter((m) => m.unlockLevel <= 1).map((m) => m.id),
    unlockedCosmetics: [],
    look: cloneLook(DEFAULT_LOOK),
    discoveries: [],
    records: { bestHeatScore: 0, bestWaveScore: 0, bestCombo: 0, heatsPlayed: 0, bestExecution: 0 },
    stats: { waves: 0, landed: 0, falls: 0, perfects: 0 },
    prefs: { quality: 'alta', sound: true, music: 60, camera: 'lateral' },
    lastSetup: defaultSetup(),
  };
}

function num(v: unknown, fallback: number, min: number, max: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? clamp(v, min, max) : fallback;
}

function int(v: unknown, fallback: number, min: number, max: number): number {
  return Math.round(num(v, fallback, min, max));
}

/** Mantém apenas ids conhecidos e garante os itens que o padrão já libera. */
function ids(v: unknown, known: string[], base: string[]): string[] {
  const list = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && known.includes(x)) : [];
  return [...new Set([...base, ...list])];
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

/** Mantém do equipamento antigo só o que estava liberado naquele salvamento. */
function legacyEquipped(old: LegacyLoadout, unlocked: unknown): LegacyLoadout {
  const list = Array.isArray(unlocked) ? unlocked : [];
  const out: LegacyLoadout = {};
  for (const [slot, id] of Object.entries(old) as [keyof LegacyLoadout, unknown][]) {
    if (typeof id === 'string' && (LEGACY_STARTER.includes(id) || list.includes(id))) out[slot] = id;
  }
  return out;
}

/** Valida dados salvos campo a campo. Qualquer coisa inválida volta ao padrão. */
export function sanitizeSave(raw: unknown): SaveData {
  const d = defaultSave();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;

  const attrsRaw = obj(r.attributes);
  const attributes = { ...d.attributes };
  for (const k of ATTRIBUTE_KEYS) attributes[k] = int(attrsRaw[k], d.attributes[k], 0, MAX_ATTRIBUTE);

  const masteryRaw = obj(r.mastery);
  const mastery = { ...d.mastery };
  for (const f of FAMILIES) mastery[f] = num(masteryRaw[f], 0, 0, 100);

  const unlockedLocations = ids(r.unlockedLocations, LOCATIONS.map((l) => l.id), d.unlockedLocations);
  // Versão 2: equipamento por espaços. Vira a aparência nova e o que estava equipado continua liberado.
  const legacy = !r.look && r.loadout && typeof r.loadout === 'object' ? migrateLoadout(legacyEquipped(r.loadout as LegacyLoadout, r.unlockedCosmetics)) : null;
  const unlockedCosmetics = ids([...(Array.isArray(r.unlockedCosmetics) ? r.unlockedCosmetics : []), ...(legacy?.granted ?? [])], CATALOG.map((c) => c.id), d.unlockedCosmetics);

  const setupRaw = obj(r.lastSetup) as Partial<HeatSetup>;
  let lastSetup = d.lastSetup;
  if (typeof setupRaw.locationId === 'string' && unlockedLocations.includes(setupRaw.locationId)) {
    const base = defaultSetup(setupRaw.locationId);
    lastSetup = clampSetup({
      boardId: BOARDS.some((b) => b.id === setupRaw.boardId) ? String(setupRaw.boardId) : base.boardId,
      finId: FINS.some((f) => f.id === setupRaw.finId) ? String(setupRaw.finId) : base.finId,
      locationId: setupRaw.locationId,
      height: num(setupRaw.height, base.height, 0, 10),
      power: num(setupRaw.power, base.power, 0, 100),
      windType: setupRaw.windType === 'terral' || setupRaw.windType === 'maral' || setupRaw.windType === 'lateral'
        ? setupRaw.windType
        : base.windType,
      windSpeed: num(setupRaw.windSpeed, base.windSpeed, 0, 60),
      sectionQuality: num(setupRaw.sectionQuality, base.sectionQuality, 0, 100),
    });
  }

  const rec = obj(r.records);
  const st = obj(r.stats);
  const pr = obj(r.prefs);
  const out: SaveData = {
    version: SAVE_VERSION,
    attributes,
    level: int(r.level, 1, 1, 99),
    xp: int(r.xp, 0, 0, 1e6),
    skillPoints: int(r.skillPoints, 0, 0, 1000),
    mastery,
    unlockedBoards: ids(r.unlockedBoards, BOARDS.map((b) => b.id), d.unlockedBoards),
    unlockedFins: ids(r.unlockedFins, FINS.map((f) => f.id), d.unlockedFins),
    unlockedLocations,
    unlockedManeuvers: ids(r.unlockedManeuvers, MANEUVERS.map((m) => m.id), d.unlockedManeuvers),
    unlockedCosmetics,
    look: d.look,
    discoveries: ids(r.discoveries, MANEUVERS.filter((m) => m.experimental).map((m) => m.id), []),
    records: {
      bestHeatScore: int(rec.bestHeatScore, 0, 0, 1e9),
      bestWaveScore: int(rec.bestWaveScore, 0, 0, 1e9),
      bestCombo: int(rec.bestCombo, 0, 0, 1000),
      heatsPlayed: int(rec.heatsPlayed, 0, 0, 1e6),
      bestExecution: int(rec.bestExecution, 0, 0, 100),
    },
    stats: {
      waves: int(st.waves, 0, 0, 1e7),
      landed: int(st.landed, 0, 0, 1e7),
      falls: int(st.falls, 0, 0, 1e7),
      perfects: int(st.perfects, 0, 0, 1e8),
    },
    prefs: {
      quality: QUALITIES.includes(pr.quality as Quality) ? (pr.quality as Quality) : d.prefs.quality,
      sound: typeof pr.sound === 'boolean' ? pr.sound : d.prefs.sound,
      music: int(pr.music, d.prefs.music, 0, 100),
      camera: pr.camera === 'proxima' ? 'proxima' : 'lateral',
    },
    lastSetup,
  };
  out.look = sanitizeLook(legacy ? legacy.look : r.look, out);
  return out;
}

export function loadSave(store: KeyValueStore | null): SaveData {
  if (!store) return defaultSave();
  try {
    const text = store.getItem(SAVE_KEY) ?? store.getItem(V2_SAVE_KEY) ?? store.getItem(LEGACY_SAVE_KEY);
    return text ? sanitizeSave(JSON.parse(text)) : defaultSave();
  } catch {
    return defaultSave();
  }
}

export function writeSave(store: KeyValueStore | null, save: SaveData): void {
  if (!store) return;
  try {
    store.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Sem espaço ou armazenamento bloqueado: o jogo continua sem salvar.
  }
}

export function clearSave(store: KeyValueStore | null): void {
  if (!store) return;
  try {
    store.removeItem(SAVE_KEY);
    store.removeItem(V2_SAVE_KEY);
    store.removeItem(LEGACY_SAVE_KEY);
  } catch {
    // Ignora: o progresso em memória já foi reiniciado.
  }
}

export function browserStore(): KeyValueStore | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}
