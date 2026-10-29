// Itens cosméticos. Cada um muda de fato o modelo 3D: materiais, cores,
// partes visíveis do corpo ou acessórios. Os desbloqueios são por nível.

export type CosmeticSlot = 'roupa' | 'cabelo' | 'corCabelo' | 'tatuagem' | 'acessorio' | 'corPrancha' | 'grafismo';

export interface Cosmetic {
  id: string;
  slot: CosmeticSlot;
  name: string;
  unlockLevel: number;
  /** Cor principal (roupa, cabelo, prancha) quando se aplica. */
  color?: number;
  /** Cor de destaque (painéis da roupa, faixas da prancha). */
  accent?: number;
  /** Estilo: corte da roupa, penteado, desenho, etc. */
  style?: string;
}

export const COSMETICS: Cosmetic[] = [
  // Roupas: o estilo define que partes do corpo ficam cobertas.
  { id: 'long-preto', slot: 'roupa', name: 'Long john preto', style: 'longo', color: 0x16191d, accent: 0x2fb4d6, unlockLevel: 1 },
  { id: 'spring-azul', slot: 'roupa', name: 'Springsuit azul', style: 'curto', color: 0x1d3f66, accent: 0xf2f2f2, unlockLevel: 1 },
  { id: 'bermuda-coral', slot: 'roupa', name: 'Bermuda coral', style: 'bermuda', color: 0xe8604c, accent: 0xfff1d6, unlockLevel: 2 },
  { id: 'long-oliva', slot: 'roupa', name: 'Long john oliva', style: 'longo', color: 0x3c4a2e, accent: 0xf0b429, unlockLevel: 3 },
  { id: 'spring-neon', slot: 'roupa', name: 'Springsuit neon', style: 'curto', color: 0x1a1a1a, accent: 0xc6ff3d, unlockLevel: 4 },

  { id: 'cabelo-curto', slot: 'cabelo', name: 'Curto', style: 'curto', unlockLevel: 1 },
  { id: 'cabelo-longo', slot: 'cabelo', name: 'Longo', style: 'longo', unlockLevel: 1 },
  { id: 'cabelo-coque', slot: 'cabelo', name: 'Coque', style: 'coque', unlockLevel: 2 },
  { id: 'cabelo-raspado', slot: 'cabelo', name: 'Raspado', style: 'raspado', unlockLevel: 3 },

  { id: 'cor-castanho', slot: 'corCabelo', name: 'Castanho', color: 0x3b2618, unlockLevel: 1 },
  { id: 'cor-preto', slot: 'corCabelo', name: 'Preto', color: 0x141010, unlockLevel: 1 },
  { id: 'cor-loiro', slot: 'corCabelo', name: 'Loiro queimado de sol', color: 0xb98a4e, unlockLevel: 2 },
  { id: 'cor-ruivo', slot: 'corCabelo', name: 'Ruivo', color: 0x8a3b1c, unlockLevel: 3 },

  { id: 'tattoo-nenhuma', slot: 'tatuagem', name: 'Nenhuma', style: 'nenhuma', unlockLevel: 1 },
  { id: 'tattoo-tribal', slot: 'tatuagem', name: 'Tribal no antebraço', style: 'tribal', unlockLevel: 2 },
  { id: 'tattoo-ondas', slot: 'tatuagem', name: 'Ondas na panturrilha', style: 'ondas', unlockLevel: 3 },

  { id: 'acess-leash', slot: 'acessorio', name: 'Só o leash', style: 'leash', unlockLevel: 1 },
  { id: 'acess-colar', slot: 'acessorio', name: 'Colar de conchas', style: 'colar', unlockLevel: 2 },
  { id: 'acess-relogio', slot: 'acessorio', name: 'Relógio de maré', style: 'relogio', unlockLevel: 3 },

  { id: 'prancha-branca', slot: 'corPrancha', name: 'Branca clássica', color: 0xf3efe6, accent: 0x1d5f8a, unlockLevel: 1 },
  { id: 'prancha-amarela', slot: 'corPrancha', name: 'Amarelo resina', color: 0xf2c84b, accent: 0x7a3a12, unlockLevel: 1 },
  { id: 'prancha-azul', slot: 'corPrancha', name: 'Azul profundo', color: 0x1f5d9e, accent: 0xf3efe6, unlockLevel: 2 },
  { id: 'prancha-vermelha', slot: 'corPrancha', name: 'Vermelho racing', color: 0xc8322f, accent: 0x111111, unlockLevel: 3 },

  { id: 'graf-liso', slot: 'grafismo', name: 'Liso', style: 'liso', unlockLevel: 1 },
  { id: 'graf-faixa', slot: 'grafismo', name: 'Faixa central', style: 'faixa', unlockLevel: 1 },
  { id: 'graf-fade', slot: 'grafismo', name: 'Degradê nas bordas', style: 'fade', unlockLevel: 2 },
  { id: 'graf-xadrez', slot: 'grafismo', name: 'Bico xadrez', style: 'xadrez', unlockLevel: 4 },
];

export type Loadout = Record<CosmeticSlot, string>;

export const DEFAULT_LOADOUT: Loadout = {
  roupa: 'long-preto',
  cabelo: 'cabelo-curto',
  corCabelo: 'cor-castanho',
  tatuagem: 'tattoo-nenhuma',
  acessorio: 'acess-leash',
  corPrancha: 'prancha-branca',
  grafismo: 'graf-faixa',
};

export const SLOT_LABELS: Record<CosmeticSlot, string> = {
  roupa: 'Roupa',
  cabelo: 'Cabelo',
  corCabelo: 'Cor do cabelo',
  tatuagem: 'Tatuagem',
  acessorio: 'Acessório',
  corPrancha: 'Cor da prancha',
  grafismo: 'Grafismo da prancha',
};

export function findCosmetic(id: string): Cosmetic | undefined {
  return COSMETICS.find((c) => c.id === id);
}
