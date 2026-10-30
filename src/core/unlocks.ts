import { ACHIEVEMENTS, CATALOG, DEFAULT_LOOK, TATTOO_REGIONS, cloneLook, findItem, type AchievementId, type CatalogItem, type Look, type Unlock } from '../data/cosmetics';
import { FAMILY_LABELS } from './maneuvers';
import type { SaveData } from './save';

// Regras de liberação dos itens de aparência: por nível, por conquista ou por
// domínio de uma família de manobras. Tudo é calculado a partir do progresso,
// então nada se perde ao mudar o catálogo; itens herdados de versões antigas
// ficam em save.unlockedCosmetics e continuam valendo.

type Progress = Pick<SaveData, 'level' | 'mastery' | 'stats' | 'records' | 'discoveries' | 'unlockedCosmetics'>;

export function achievementMet(id: AchievementId, s: Progress): boolean {
  switch (id) {
    case 'primeira-bateria': return s.records.heatsPlayed >= 1;
    case 'primeiro-pouso': return s.stats.landed >= 1;
    case 'perfeccionista': return s.stats.perfects >= 25;
    case 'combo-4': return s.records.bestCombo >= 4;
    case 'veterano': return s.stats.waves >= 50;
    case 'execucao-90': return s.records.bestExecution >= 90;
    case 'descobridor': return s.discoveries.length >= 1;
  }
}

export function unlockMet(u: Unlock, s: Progress): boolean {
  switch (u.kind) {
    case 'base': return true;
    case 'level': return s.level >= u.level;
    case 'achievement': return achievementMet(u.id, s);
    case 'mastery': return (s.mastery[u.family] ?? 0) >= u.value;
  }
}

export function isUnlocked(id: string, s: Progress): boolean {
  const item = findItem(id);
  if (!item) return false;
  return unlockMet(item.unlock, s) || s.unlockedCosmetics.includes(id);
}

/** Texto curto do requisito, mostrado nos itens bloqueados. */
export function unlockText(u: Unlock): string {
  switch (u.kind) {
    case 'base': return 'Liberado';
    case 'level': return `Nível ${u.level}`;
    case 'achievement': return `Conquista: ${ACHIEVEMENTS[u.id].name}`;
    case 'mastery': return `Domínio ${FAMILY_LABELS[u.family].toLowerCase()} ${u.value}`;
  }
}

/** Explicação completa do requisito (dica do item bloqueado). */
export function unlockHint(u: Unlock): string {
  if (u.kind === 'achievement') return `${ACHIEVEMENTS[u.id].name}: ${ACHIEVEMENTS[u.id].description}`;
  if (u.kind === 'mastery') return `Chegue a ${u.value} de domínio em ${FAMILY_LABELS[u.family].toLowerCase()}.`;
  if (u.kind === 'level') return `Chegue ao nível ${u.level}.`;
  return 'Disponível desde o início.';
}

/**
 * Registra os itens liberados agora e devolve os novos, para o aviso no fim da
 * bateria. Itens de base não entram no aviso.
 */
export function refreshCosmetics(s: SaveData): CatalogItem[] {
  const fresh: CatalogItem[] = [];
  for (const item of CATALOG) {
    if (item.unlock.kind === 'base' || s.unlockedCosmetics.includes(item.id)) continue;
    if (unlockMet(item.unlock, s)) {
      s.unlockedCosmetics.push(item.id);
      fresh.push(item);
    }
  }
  return fresh;
}

/**
 * Garante que a aparência só use ids conhecidos, da categoria certa e
 * liberados. Campo inválido volta ao padrão, sem apagar o resto.
 */
export function sanitizeLook(raw: unknown, s: Progress): Look {
  const d = cloneLook(DEFAULT_LOOK);
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;
  const pick = (v: unknown, category: CatalogItem['category'], fallback: string): string =>
    typeof v === 'string' && findItem(v)?.category === category && isUnlocked(v, s) ? v : fallback;
  const style = (v: unknown, fb: Look['suitStyle']): Look['suitStyle'] => {
    const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
    const colors = Array.isArray(o.colors) ? o.colors : [];
    return {
      pattern: pick(o.pattern, 'estampa', fb.pattern),
      colors: [pick(colors[0], 'cor', fb.colors[0]), pick(colors[1], 'cor', fb.colors[1]), pick(colors[2], 'cor', fb.colors[2])],
    };
  };
  const board = (r.board && typeof r.board === 'object' ? r.board : {}) as Record<string, unknown>;
  const fins = (r.fins && typeof r.fins === 'object' ? r.fins : {}) as Record<string, unknown>;
  const tattoos: Look['tattoos'] = [];
  if (Array.isArray(r.tattoos)) {
    for (const t of r.tattoos) {
      if (!t || typeof t !== 'object') continue;
      const o = t as Record<string, unknown>;
      const design = pick(o.design, 'tatuagem', '');
      const region = o.region as Look['tattoos'][number]['region'];
      if (!design || typeof region !== 'string' || tattoos.some((x) => x.region === region)) continue;
      if (!TATTOO_REGIONS.includes(region)) continue;
      const size = typeof o.size === 'number' && Number.isFinite(o.size) ? Math.min(1.4, Math.max(0.6, o.size)) : 1;
      const rotation = typeof o.rotation === 'number' && Number.isFinite(o.rotation) ? Math.min(180, Math.max(-180, Math.round(o.rotation))) : 0;
      tattoos.push({ design, region, size, rotation });
    }
  }
  return {
    skin: pick(r.skin, 'pele', d.skin),
    hair: pick(r.hair, 'cabelo', d.hair),
    hairColor: pick(r.hairColor, 'corCabelo', d.hairColor),
    eyes: pick(r.eyes, 'olhos', d.eyes),
    brows: pick(r.brows, 'sobrancelha', d.brows),
    beard: pick(r.beard, 'barba', d.beard),
    suit: pick(r.suit, 'neoprene', d.suit),
    top: pick(r.top, 'parteCima', d.top),
    bottom: pick(r.bottom, 'bermuda', d.bottom),
    suitStyle: style(r.suitStyle, d.suitStyle),
    topStyle: style(r.topStyle, d.topStyle),
    bottomStyle: style(r.bottomStyle, d.bottomStyle),
    tattoos,
    accessory: pick(r.accessory, 'acessorio', d.accessory),
    board: {
      deck: pick(board.deck, 'cor', d.board.deck),
      bottom: pick(board.bottom, 'cor', d.board.bottom),
      art: pick(board.art, 'arte', d.board.art),
      artColor: pick(board.artColor, 'cor', d.board.artColor),
      noseTail: board.noseTail === '' ? '' : pick(board.noseTail, 'cor', ''),
      finish: pick(board.finish, 'acabamento', d.board.finish),
    },
    fins: {
      color: pick(fins.color, 'cor', d.fins.color),
      color2: pick(fins.color2, 'cor', d.fins.color2),
      twoTone: typeof fins.twoTone === 'boolean' ? fins.twoTone : d.fins.twoTone,
      transparent: typeof fins.transparent === 'boolean' ? fins.transparent && transparentAllowed(s) : d.fins.transparent,
      finish: pick(fins.finish, 'acabamento', d.fins.finish),
      profile: pick(fins.profile, 'perfilQuilha', d.fins.profile),
    },
  };
}

/** Quilhas transparentes (resina cristal) liberam no nível 2. */
export const TRANSPARENT_FIN_UNLOCK: Unlock = { kind: 'level', level: 2 };

export function transparentAllowed(s: Progress): boolean {
  return unlockMet(TRANSPARENT_FIN_UNLOCK, s);
}