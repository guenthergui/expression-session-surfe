import type { ManeuverFamily } from '../core/types';

// Catálogo de aparência. Cada item tem um id estável (salvo no progresso) e
// muda de fato o modelo 3D: cor de material, geometria, textura pintada na pele
// ou na roupa. Nada aqui altera atributos, chance ou física: a prancha e as
// quilhas têm a função definida em equipment.ts e só a aparência definida aqui.

export type Category =
  | 'pele'
  | 'cabelo'
  | 'corCabelo'
  | 'olhos'
  | 'sobrancelha'
  | 'barba'
  | 'neoprene'
  | 'parteCima'
  | 'bermuda'
  | 'estampa'
  | 'cor'
  | 'tatuagem'
  | 'acessorio'
  | 'arte'
  | 'acabamento'
  | 'perfilQuilha';

export type AchievementId = 'primeira-bateria' | 'primeiro-pouso' | 'perfeccionista' | 'combo-4' | 'veterano' | 'execucao-90' | 'descobridor';

/** Como um item é liberado. A maior parte já começa liberada. */
export type Unlock =
  | { kind: 'base' }
  | { kind: 'level'; level: number }
  | { kind: 'achievement'; id: AchievementId }
  | { kind: 'mastery'; family: ManeuverFamily; value: number };

export interface CatalogItem {
  id: string;
  category: Category;
  name: string;
  unlock: Unlock;
  /** Etiquetas para os filtros do vestiário (estilo, família de cor...). */
  tags: string[];
  /** Cor de amostra (cores, tons de pele, cabelo, olhos). */
  color?: number;
  /** Cor de brilho da pele (subtom). */
  sheen?: number;
}

export const ACHIEVEMENTS: Record<AchievementId, { name: string; description: string }> = {
  'primeira-bateria': { name: 'Primeira bateria', description: 'Termine uma bateria.' },
  'primeiro-pouso': { name: 'Primeiro pouso', description: 'Pouse um aéreo.' },
  perfeccionista: { name: 'Perfeccionista', description: 'Acerte 25 comandos Perfect.' },
  'combo-4': { name: 'Embalado', description: 'Chegue a um combo x4.' },
  veterano: { name: 'Veterano', description: 'Surfe 50 ondas.' },
  'execucao-90': { name: 'Execução de elite', description: 'Faça uma onda com 90% de execução.' },
  descobridor: { name: 'Descobridor', description: 'Descubra uma manobra experimental.' },
};

const base: Unlock = { kind: 'base' };
const lvl = (level: number): Unlock => ({ kind: 'level', level });
const ach = (id: AchievementId): Unlock => ({ kind: 'achievement', id });
const mas = (family: ManeuverFamily, value: number): Unlock => ({ kind: 'mastery', family, value });

const item = (category: Category, id: string, name: string, unlock: Unlock, tags: string[] = [], extra: Partial<CatalogItem> = {}): CatalogItem => ({ id, category, name, unlock, tags, ...extra });

// Tons de pele, do muito claro ao muito escuro, com subtom. Todos liberados.
const SKIN: [string, string, number, number, string][] = [
  ['pele-01', 'Porcelana', 0xf4d9c8, 0xffb6b0, 'frio'],
  ['pele-02', 'Clara rosada', 0xebc1a8, 0xff9f94, 'frio'],
  ['pele-03', 'Clara dourada', 0xe7c29c, 0xffb27a, 'quente'],
  ['pele-04', 'Bege', 0xd8a882, 0xff9f7a, 'neutro'],
  ['pele-05', 'Oliva clara', 0xc89c6e, 0xd8b070, 'oliva'],
  ['pele-06', 'Morena dourada', 0xbb875c, 0xff9a5c, 'quente'],
  ['pele-07', 'Morena', 0xa77250, 0xff8f66, 'neutro'],
  ['pele-08', 'Oliva escura', 0x95683f, 0xc69a5c, 'oliva'],
  ['pele-09', 'Canela', 0x87553a, 0xff8a5a, 'quente'],
  ['pele-10', 'Marrom', 0x71442c, 0xd9785a, 'neutro'],
  ['pele-11', 'Marrom profundo', 0x5a3423, 0xc0705a, 'quente'],
  ['pele-12', 'Ébano', 0x3d251a, 0x9a6a80, 'frio'],
];

const HAIR_STYLES: [string, string, Unlock, string[]][] = [
  ['raspado', 'Raspado', base, ['curto']],
  ['curto', 'Curto despenteado', base, ['curto']],
  ['topete', 'Topete', base, ['curto']],
  ['cacheado', 'Cacheado curto', base, ['curto', 'cacheado']],
  ['blackpower', 'Black power', base, ['volume', 'cacheado']],
  ['medio', 'Médio ondulado', base, ['medio']],
  ['longo', 'Longo solto', base, ['longo']],
  ['rabo', 'Rabo de cavalo', base, ['longo', 'preso']],
  ['coque', 'Coque', base, ['preso']],
  ['dreads', 'Dreads', lvl(2), ['longo']],
  ['moicano', 'Moicano', lvl(3), ['curto', 'ousado']],
  ['careca', 'Careca', base, ['curto']],
];

const HAIR_COLORS: [string, string, number, Unlock, string][] = [
  ['preto', 'Preto', 0x141010, base, 'natural'],
  ['castanho-escuro', 'Castanho escuro', 0x2a1a12, base, 'natural'],
  ['castanho', 'Castanho', 0x3b2618, base, 'natural'],
  ['castanho-claro', 'Castanho claro', 0x6a4528, base, 'natural'],
  ['loiro-escuro', 'Loiro escuro', 0x8a6538, base, 'natural'],
  ['loiro', 'Loiro queimado de sol', 0xb98a4e, base, 'natural'],
  ['platinado', 'Platinado', 0xd9cdb0, base, 'natural'],
  ['ruivo', 'Ruivo', 0x8a3b1c, base, 'natural'],
  ['grisalho', 'Grisalho', 0x8c8a86, base, 'natural'],
  ['branco', 'Branco', 0xe8e6e0, base, 'natural'],
  ['azul', 'Azul elétrico', 0x1f5fd6, lvl(2), 'fantasia'],
  ['rosa', 'Rosa chiclete', 0xe85aa8, lvl(3), 'fantasia'],
  ['verde', 'Verde mar', 0x1f9e78, lvl(4), 'fantasia'],
  ['roxo', 'Roxo', 0x6a35b8, ach('primeiro-pouso'), 'fantasia'],
  ['turquesa', 'Turquesa', 0x2ac4c4, ach('combo-4'), 'fantasia'],
  ['laranja', 'Laranja neon', 0xff6a1a, mas('rotacao', 30), 'fantasia'],
];

const EYES: [string, string, number][] = [
  ['olho-castanho-escuro', 'Castanho escuro', 0x2b1a10],
  ['olho-castanho', 'Castanho', 0x4a3322],
  ['olho-mel', 'Mel', 0x8a5a22],
  ['olho-avela', 'Avelã', 0x6c5a2e],
  ['olho-verde', 'Verde', 0x4a7a3a],
  ['olho-azul', 'Azul', 0x3a6aa8],
  ['olho-cinza', 'Cinza', 0x7a8690],
  ['olho-preto', 'Preto', 0x120c0a],
];

const BROWS: [string, string][] = [
  ['sobr-natural', 'Natural'],
  ['sobr-fina', 'Fina'],
  ['sobr-grossa', 'Grossa'],
  ['sobr-arqueada', 'Arqueada'],
  ['sobr-reta', 'Reta'],
];

const BEARDS: [string, string, Unlock][] = [
  ['barba-nenhuma', 'Sem barba', base],
  ['barba-rala', 'Por fazer', base],
  ['barba-bigode', 'Bigode', base],
  ['barba-cavanhaque', 'Cavanhaque', base],
  ['barba-curta', 'Barba curta', base],
  ['barba-cheia', 'Barba cheia', lvl(2)],
];

const SUITS: [string, string, Unlock, string[]][] = [
  ['neo-nenhum', 'Sem neoprene (roupa avulsa)', base, ['avulsa']],
  ['neo-completo', 'Neoprene completo 3/2', base, ['longo']],
  ['neo-spring', 'Springsuit', base, ['curto']],
  ['neo-longjohn', 'Long john sem manga', lvl(2), ['longo']],
  ['neo-shortjohn', 'Short john', lvl(3), ['curto']],
  ['neo-spring-manga', 'Springsuit manga longa', lvl(4), ['curto']],
];

const TOPS: [string, string, Unlock, string[]][] = [
  ['top-nenhum', 'Sem camisa', base, []],
  ['top-lycra-curta', 'Lycra manga curta', base, ['lycra']],
  ['top-lycra-longa', 'Lycra manga longa', lvl(2), ['lycra']],
  ['top-camiseta', 'Camiseta', base, ['tecido']],
  ['top-regata', 'Regata', lvl(3), ['tecido']],
];

const BOTTOMS: [string, string][] = [
  ['bermuda-curta', 'Bermuda curta'],
  ['bermuda-media', 'Bermuda média'],
  ['bermuda-longa', 'Bermuda longa'],
];

const PATTERNS: [string, string, Unlock][] = [
  ['liso', 'Liso', base],
  ['listras', 'Listras', base],
  ['faixa-lateral', 'Faixa lateral', base],
  ['blocos', 'Blocos de cor', base],
  ['floral', 'Floral', lvl(2)],
  ['geometrico', 'Geométrico', lvl(3)],
  ['camuflado', 'Camuflado', lvl(4)],
  ['degrade', 'Degradê', ach('primeiro-pouso')],
  ['xadrez', 'Xadrez', lvl(6)],
  ['tiedye', 'Tie-dye', mas('grab', 25)],
];

// Paleta compartilhada por roupas, prancha e quilhas.
const PALETTE: [string, string, number, Unlock, string][] = [
  ['preto', 'Preto', 0x16191d, base, 'neutras'],
  ['grafite', 'Grafite', 0x3a3f46, base, 'neutras'],
  ['cinza', 'Cinza', 0x8a9098, base, 'neutras'],
  ['branco', 'Branco', 0xf3f1ec, base, 'neutras'],
  ['creme', 'Creme', 0xf1e6cf, base, 'neutras'],
  ['areia', 'Areia', 0xcdb88e, base, 'neutras'],
  ['marrom', 'Marrom', 0x6b4a32, base, 'quentes'],
  ['vermelho', 'Vermelho', 0xc8322f, base, 'quentes'],
  ['coral', 'Coral', 0xe8604c, base, 'quentes'],
  ['laranja', 'Laranja', 0xf08a24, base, 'quentes'],
  ['amarelo', 'Amarelo resina', 0xf2c84b, base, 'quentes'],
  ['oliva', 'Oliva', 0x4a5634, base, 'frias'],
  ['verde', 'Verde', 0x2f8a4e, base, 'frias'],
  ['verde-agua', 'Verde-água', 0x3fbfa8, base, 'frias'],
  ['ciano', 'Ciano', 0x2fb4d6, base, 'frias'],
  ['azul', 'Azul', 0x1f5d9e, base, 'frias'],
  ['marinho', 'Azul-marinho', 0x1b2c4a, base, 'frias'],
  ['roxo', 'Roxo', 0x5a3a9a, base, 'frias'],
  ['lilas', 'Lilás', 0xb59ad8, base, 'frias'],
  ['rosa', 'Rosa', 0xe87aa8, base, 'quentes'],
  ['vinho', 'Vinho', 0x6a1f2e, lvl(2), 'quentes'],
  ['lima', 'Lima neon', 0xc6ff3d, lvl(3), 'especiais'],
  ['neon-rosa', 'Rosa neon', 0xff3d9a, lvl(5), 'especiais'],
  ['neon-laranja', 'Laranja neon', 0xff6a1a, ach('combo-4'), 'especiais'],
  ['dourado', 'Dourado', 0xc9a14a, ach('execucao-90'), 'especiais'],
  ['prata', 'Prata', 0xb8c0c8, mas('aereo', 40), 'especiais'],
];

const TATTOOS: [string, string, Unlock, string[]][] = [
  ['tribal', 'Tribal', base, ['traço']],
  ['ondas', 'Ondas', base, ['mar']],
  ['sol', 'Sol', base, ['símbolo']],
  ['lua', 'Lua', base, ['símbolo']],
  ['estrelas', 'Estrelas', base, ['símbolo']],
  ['ancora', 'Âncora', base, ['mar']],
  ['rosa', 'Rosa', lvl(2), ['flor']],
  ['concha', 'Concha', lvl(2), ['mar']],
  ['coqueiro', 'Coqueiro', lvl(3), ['flor']],
  ['montanha', 'Montanhas', lvl(3), ['traço']],
  ['mandala', 'Mandala', lvl(4), ['traço']],
  ['raio', 'Raio', ach('primeira-bateria'), ['símbolo']],
  ['pena', 'Pena', ach('perfeccionista'), ['traço']],
  ['tubarao', 'Barbatana', mas('rotacao', 20), ['mar']],
];

const ACCESSORIES: [string, string, Unlock][] = [
  ['acess-leash', 'Só o leash', base],
  ['acess-colar', 'Colar de conchas', base],
  ['acess-relogio', 'Relógio de maré', lvl(2)],
  ['acess-pulseira', 'Pulseiras de corda', lvl(3)],
  ['acess-bone', 'Boné', ach('veterano')],
];

const ARTS: [string, string, Unlock][] = [
  ['arte-liso', 'Liso', base],
  ['arte-faixa', 'Faixa central', base],
  ['arte-duas-faixas', 'Duas faixas', base],
  ['arte-fade', 'Degradê nas bordas', lvl(2)],
  ['arte-listras', 'Listras finas', lvl(3)],
  ['arte-respingos', 'Respingos', lvl(4)],
  ['arte-xadrez', 'Bico xadrez', lvl(5)],
  ['arte-chamas', 'Chamas', ach('descobridor')],
];

const FIN_PROFILES: [string, string, Unlock][] = [
  ['perfil-classico', 'Clássico', base],
  ['perfil-inclinado', 'Inclinado', lvl(2)],
  ['perfil-reto', 'Reto', lvl(3)],
];

export const CATALOG: CatalogItem[] = [
  ...SKIN.map(([id, name, color, sheen, tone]) => item('pele', id, name, base, [tone], { color, sheen })),
  ...HAIR_STYLES.map(([id, name, u, tags]) => item('cabelo', id, name, u, tags)),
  ...HAIR_COLORS.map(([id, name, color, u, tag]) => item('corCabelo', `cabelo-${id}`, name, u, [tag], { color })),
  ...EYES.map(([id, name, color]) => item('olhos', id, name, base, [], { color })),
  ...BROWS.map(([id, name]) => item('sobrancelha', id, name, base)),
  ...BEARDS.map(([id, name, u]) => item('barba', id, name, u)),
  ...SUITS.map(([id, name, u, tags]) => item('neoprene', id, name, u, tags)),
  ...TOPS.map(([id, name, u, tags]) => item('parteCima', id, name, u, tags)),
  ...BOTTOMS.map(([id, name]) => item('bermuda', id, name, base)),
  ...PATTERNS.map(([id, name, u]) => item('estampa', `estampa-${id}`, name, u)),
  ...PALETTE.map(([id, name, color, u, tag]) => item('cor', `cor-${id}`, name, u, [tag], { color })),
  ...TATTOOS.map(([id, name, u, tags]) => item('tatuagem', `tattoo-${id}`, name, u, tags)),
  ...ACCESSORIES.map(([id, name, u]) => item('acessorio', id, name, u)),
  ...ARTS.map(([id, name, u]) => item('arte', id, name, u)),
  item('acabamento', 'acab-brilho', 'Brilhante', base),
  item('acabamento', 'acab-fosco', 'Fosco', base),
  ...FIN_PROFILES.map(([id, name, u]) => item('perfilQuilha', id, name, u)),
];

const BY_ID = new Map(CATALOG.map((c) => [c.id, c]));

export function findItem(id: string): CatalogItem | undefined {
  return BY_ID.get(id);
}

export function itemsOf(category: Category): CatalogItem[] {
  return CATALOG.filter((c) => c.category === category);
}

/** Cor de um item (paleta, cabelo, olhos, pele) ou um valor padrão. */
export function colorOf(id: string, fallback = 0x888888): number {
  return BY_ID.get(id)?.color ?? fallback;
}

// ---------- Regiões do corpo para tatuagens ----------

export type TattooRegion =
  | 'ombroEsq' | 'ombroDir'
  | 'bracoEsq' | 'bracoDir'
  | 'antebracoEsq' | 'antebracoDir'
  | 'peito' | 'costas'
  | 'pernaEsq' | 'pernaDir'
  | 'panturrilhaEsq' | 'panturrilhaDir';

export const TATTOO_REGIONS: TattooRegion[] = [
  'ombroEsq', 'ombroDir', 'bracoEsq', 'bracoDir', 'antebracoEsq', 'antebracoDir',
  'peito', 'costas', 'pernaEsq', 'pernaDir', 'panturrilhaEsq', 'panturrilhaDir',
];

export const REGION_LABELS: Record<TattooRegion, string> = {
  ombroEsq: 'Ombro esquerdo',
  ombroDir: 'Ombro direito',
  bracoEsq: 'Braço esquerdo',
  bracoDir: 'Braço direito',
  antebracoEsq: 'Antebraço esquerdo',
  antebracoDir: 'Antebraço direito',
  peito: 'Peito',
  costas: 'Costas',
  pernaEsq: 'Coxa esquerda',
  pernaDir: 'Coxa direita',
  panturrilhaEsq: 'Panturrilha esquerda',
  panturrilhaDir: 'Panturrilha direita',
};

/** Parte do corpo em que cada região fica (usada para saber se a roupa cobre). */
export type BodyRole = 'hips' | 'abdomen' | 'chest' | 'upperArm' | 'forearm' | 'thigh' | 'shin';

export const REGION_PLACE: Record<TattooRegion, { role: BodyRole; side: 'left' | 'right' | 'center'; t: number }> = {
  ombroEsq: { role: 'upperArm', side: 'left', t: 0.12 },
  ombroDir: { role: 'upperArm', side: 'right', t: 0.12 },
  bracoEsq: { role: 'upperArm', side: 'left', t: 0.55 },
  bracoDir: { role: 'upperArm', side: 'right', t: 0.55 },
  antebracoEsq: { role: 'forearm', side: 'left', t: 0.45 },
  antebracoDir: { role: 'forearm', side: 'right', t: 0.45 },
  peito: { role: 'chest', side: 'center', t: 0.45 },
  costas: { role: 'chest', side: 'center', t: 0.45 },
  pernaEsq: { role: 'thigh', side: 'left', t: 0.5 },
  pernaDir: { role: 'thigh', side: 'right', t: 0.5 },
  panturrilhaEsq: { role: 'shin', side: 'left', t: 0.32 },
  panturrilhaDir: { role: 'shin', side: 'right', t: 0.32 },
};

export interface TattooPlacement {
  design: string;
  region: TattooRegion;
  /** Escala, de 0,6 a 1,4. */
  size: number;
  /** Rotação em graus, de -180 a 180. */
  rotation: number;
}

export const MAX_TATTOOS = TATTOO_REGIONS.length;

// ---------- Roupas: quanto cada peça cobre de cada parte do corpo ----------

/** Fração coberta de cada parte, a partir do topo (0 nada, 1 tudo). */
export type Coverage = Partial<Record<BodyRole, number>>;
export type Fabric = 'neoprene' | 'lycra' | 'tecido';

const TORSO: Coverage = { hips: 1, abdomen: 1, chest: 1 };

export const GARMENTS: Record<string, { coverage: Coverage; fabric: Fabric }> = {
  'neo-nenhum': { coverage: {}, fabric: 'neoprene' },
  'neo-completo': { coverage: { ...TORSO, upperArm: 1, forearm: 1, thigh: 1, shin: 1 }, fabric: 'neoprene' },
  'neo-spring': { coverage: { ...TORSO, upperArm: 0.5, thigh: 0.55 }, fabric: 'neoprene' },
  'neo-longjohn': { coverage: { ...TORSO, thigh: 1, shin: 1 }, fabric: 'neoprene' },
  'neo-shortjohn': { coverage: { ...TORSO, thigh: 0.55 }, fabric: 'neoprene' },
  'neo-spring-manga': { coverage: { ...TORSO, upperArm: 1, forearm: 1, thigh: 0.55 }, fabric: 'neoprene' },
  'top-nenhum': { coverage: {}, fabric: 'tecido' },
  'top-lycra-curta': { coverage: { abdomen: 1, chest: 1, upperArm: 0.55 }, fabric: 'lycra' },
  'top-lycra-longa': { coverage: { abdomen: 1, chest: 1, upperArm: 1, forearm: 0.96 }, fabric: 'lycra' },
  'top-camiseta': { coverage: { abdomen: 1, chest: 1, upperArm: 0.42 }, fabric: 'tecido' },
  'top-regata': { coverage: { abdomen: 1, chest: 1 }, fabric: 'tecido' },
  'bermuda-curta': { coverage: { hips: 1, thigh: 0.35 }, fabric: 'tecido' },
  'bermuda-media': { coverage: { hips: 1, thigh: 0.6 }, fabric: 'tecido' },
  'bermuda-longa': { coverage: { hips: 1, thigh: 0.9 }, fabric: 'tecido' },
};

/** Estampa e cores de uma peça: principal, secundária (estampa) e detalhes (costuras, painéis). */
export interface GarmentStyle {
  pattern: string;
  colors: [string, string, string];
}

export interface BoardLook {
  deck: string;
  bottom: string;
  art: string;
  artColor: string;
  /** Cor do bico e da rabeta, ou '' para a mesma do deck. */
  noseTail: string;
  finish: string;
}

export interface FinLook {
  color: string;
  color2: string;
  twoTone: boolean;
  transparent: boolean;
  finish: string;
  profile: string;
}

/** Tudo o que o jogador escolheu para o personagem e o equipamento. */
export interface Look {
  skin: string;
  hair: string;
  hairColor: string;
  eyes: string;
  brows: string;
  beard: string;
  suit: string;
  top: string;
  bottom: string;
  suitStyle: GarmentStyle;
  topStyle: GarmentStyle;
  bottomStyle: GarmentStyle;
  tattoos: TattooPlacement[];
  accessory: string;
  board: BoardLook;
  fins: FinLook;
}

export const DEFAULT_LOOK: Look = {
  skin: 'pele-06',
  hair: 'curto',
  hairColor: 'cabelo-castanho',
  eyes: 'olho-castanho',
  brows: 'sobr-natural',
  beard: 'barba-nenhuma',
  suit: 'neo-completo',
  top: 'top-nenhum',
  bottom: 'bermuda-media',
  suitStyle: { pattern: 'estampa-liso', colors: ['cor-preto', 'cor-grafite', 'cor-ciano'] },
  topStyle: { pattern: 'estampa-liso', colors: ['cor-branco', 'cor-cinza', 'cor-azul'] },
  bottomStyle: { pattern: 'estampa-listras', colors: ['cor-marinho', 'cor-ciano', 'cor-branco'] },
  tattoos: [],
  accessory: 'acess-leash',
  board: { deck: 'cor-branco', bottom: 'cor-branco', art: 'arte-faixa', artColor: 'cor-azul', noseTail: '', finish: 'acab-brilho' },
  fins: { color: 'cor-grafite', color2: 'cor-ciano', twoTone: false, transparent: false, finish: 'acab-brilho', profile: 'perfil-classico' },
};

export function cloneLook(l: Look): Look {
  return JSON.parse(JSON.stringify(l)) as Look;
}

/** Peças de roupa ativas, na ordem em que são pintadas (a última fica por cima). */
export function activeGarments(l: Look): { id: string; style: GarmentStyle }[] {
  if (l.suit !== 'neo-nenhum') return [{ id: l.suit, style: l.suitStyle }];
  return [
    { id: l.bottom, style: l.bottomStyle },
    { id: l.top, style: l.topStyle },
  ].filter((g) => g.id !== 'top-nenhum');
}

/** Quanto da parte do corpo está coberto pela roupa atual (0 a 1, a partir do topo). */
export function coverageOf(l: Look, role: BodyRole): number {
  let c = 0;
  for (const g of activeGarments(l)) c = Math.max(c, GARMENTS[g.id]?.coverage[role] ?? 0);
  return c;
}

/** A tatuagem fica escondida pela roupa? (compara a posição dela com o comprimento coberto). */
export function tattooCovered(l: Look, t: TattooPlacement): boolean {
  const place = REGION_PLACE[t.region];
  return coverageOf(l, place.role) > place.t;
}

// ---------- Migração do formato antigo (save v2) ----------

/** Equipamento salvo na versão 2: um id por espaço. */
export interface LegacyLoadout {
  roupa?: string;
  cabelo?: string;
  corCabelo?: string;
  tatuagem?: string;
  acessorio?: string;
  corPrancha?: string;
  grafismo?: string;
}

const LEGACY_SUITS: Record<string, Partial<Look>> = {
  'long-preto': { suit: 'neo-completo', suitStyle: { pattern: 'estampa-liso', colors: ['cor-preto', 'cor-grafite', 'cor-ciano'] } },
  'spring-azul': { suit: 'neo-spring', suitStyle: { pattern: 'estampa-liso', colors: ['cor-azul', 'cor-marinho', 'cor-branco'] } },
  'bermuda-coral': { suit: 'neo-nenhum', top: 'top-nenhum', bottom: 'bermuda-media', bottomStyle: { pattern: 'estampa-liso', colors: ['cor-coral', 'cor-creme', 'cor-creme'] } },
  'long-oliva': { suit: 'neo-completo', suitStyle: { pattern: 'estampa-liso', colors: ['cor-oliva', 'cor-grafite', 'cor-amarelo'] } },
  'spring-neon': { suit: 'neo-spring', suitStyle: { pattern: 'estampa-liso', colors: ['cor-preto', 'cor-grafite', 'cor-lima'] } },
};

const LEGACY_BOARDS: Record<string, Pick<BoardLook, 'deck' | 'bottom' | 'artColor'>> = {
  'prancha-branca': { deck: 'cor-branco', bottom: 'cor-branco', artColor: 'cor-azul' },
  'prancha-amarela': { deck: 'cor-amarelo', bottom: 'cor-amarelo', artColor: 'cor-marrom' },
  'prancha-azul': { deck: 'cor-azul', bottom: 'cor-azul', artColor: 'cor-branco' },
  'prancha-vermelha': { deck: 'cor-vermelho', bottom: 'cor-vermelho', artColor: 'cor-preto' },
};

/** Itens que a versão 2 liberava desde o início (os outros só valem se estavam liberados). */
export const LEGACY_STARTER = [
  'long-preto', 'spring-azul', 'cabelo-curto', 'cabelo-longo', 'cor-castanho', 'cor-preto',
  'tattoo-nenhuma', 'acess-leash', 'prancha-branca', 'prancha-amarela', 'graf-liso', 'graf-faixa',
];

const LEGACY_ART: Record<string, string> = { 'graf-liso': 'arte-liso', 'graf-faixa': 'arte-faixa', 'graf-fade': 'arte-fade', 'graf-xadrez': 'arte-xadrez' };

/**
 * Converte o equipamento da versão 2 para a aparência nova, mantendo o que o
 * jogador usava. Devolve também os ids que passam a contar como liberados
 * (quem já tinha um item continua com ele, mesmo que a regra nova seja outra).
 */
export function migrateLoadout(old: LegacyLoadout): { look: Look; granted: string[] } {
  let look = cloneLook(DEFAULT_LOOK);
  const suit = old.roupa ? LEGACY_SUITS[old.roupa] : undefined;
  if (suit) look = cloneLook({ ...look, ...suit });
  const hair = old.cabelo?.replace('cabelo-', '');
  if (hair && findItem(hair)?.category === 'cabelo') look.hair = hair;
  const hairColor = old.corCabelo?.replace('cor-', 'cabelo-');
  if (hairColor && findItem(hairColor)?.category === 'corCabelo') look.hairColor = hairColor;
  if (old.tatuagem === 'tattoo-tribal') look.tattoos = [{ design: 'tattoo-tribal', region: 'antebracoEsq', size: 1, rotation: 0 }];
  if (old.tatuagem === 'tattoo-ondas') look.tattoos = [{ design: 'tattoo-ondas', region: 'panturrilhaEsq', size: 1, rotation: 0 }];
  if (old.acessorio && findItem(old.acessorio)?.category === 'acessorio') look.accessory = old.acessorio;
  const board = old.corPrancha ? LEGACY_BOARDS[old.corPrancha] : undefined;
  if (board) Object.assign(look.board, board);
  if (old.grafismo && LEGACY_ART[old.grafismo]) look.board.art = LEGACY_ART[old.grafismo];
  // Tudo o que estava equipado continua liberado.
  return { look, granted: lookItemIds(look) };
}

/** Todos os ids do catálogo usados por uma aparência. */
export function lookItemIds(l: Look): string[] {
  const ids = [
    l.skin, l.hair, l.hairColor, l.eyes, l.brows, l.beard, l.suit, l.top, l.bottom, l.accessory,
    ...[l.suitStyle, l.topStyle, l.bottomStyle].flatMap((s) => [s.pattern, ...s.colors]),
    ...l.tattoos.map((t) => t.design),
    l.board.deck, l.board.bottom, l.board.art, l.board.artColor, l.board.finish,
    l.fins.color, l.fins.color2, l.fins.finish, l.fins.profile,
  ];
  if (l.board.noseTail) ids.push(l.board.noseTail);
  return [...new Set(ids)];
}
