import type { Board, BoardDims, Fin } from '../core/types';

// Pranchas e quilhas. Os modificadores estão em pontos percentuais por fase e
// toda opção tem pelo menos uma desvantagem. As medidas são as de pranchas reais
// e viram metros em boardMeters(); o modelo 3D é gerado a partir delas.

export const INCH = 0.0254;

export function boardMeters(d: BoardDims) {
  return {
    length: (d.lengthFt * 12 + d.lengthIn) * INCH,
    width: d.widthIn * INCH,
    thickness: d.thicknessIn * INCH,
  };
}

export function formatDims(d: BoardDims): string {
  const frac = (v: number) => {
    const whole = Math.floor(v);
    const rest = v - whole;
    const map: Record<string, string> = { '0.125': '1/8', '0.25': '1/4', '0.3125': '5/16', '0.375': '3/8', '0.5': '1/2', '0.625': '5/8', '0.75': '3/4' };
    return rest ? `${whole} ${map[String(rest)] ?? rest.toFixed(2)}` : `${whole}`;
  };
  const m = boardMeters(d);
  return `${d.lengthFt}'${d.lengthIn}" × ${frac(d.widthIn)}" × ${frac(d.thicknessIn)}"  (${m.length.toFixed(2)} m × ${(m.width * 100).toFixed(1)} cm × ${(m.thickness * 100).toFixed(1)} cm)`;
}

export const BOARDS: Board[] = [
  {
    id: 'standard',
    name: 'Session Standard',
    archetype: 'Equilibrada',
    description: 'Sem pontos fracos claros, mas também sem grandes vantagens.',
    dims: { lengthFt: 5, lengthIn: 10, widthIn: 18.5, thicknessIn: 2.25 },
    tail: 'squash',
    noseRocker: 0.115,
    tailRocker: 0.05,
    noseWidth: 0.62,
    mods: { impulsao: 1, rotacao: 1, grab: 1, aterrissagem: 1 },
    unlockLevel: 1,
  },
  {
    id: 'razor',
    name: 'Razor',
    archetype: 'Rotação e agilidade',
    description: 'Curta e fina: gira rápido, mas é nervosa no pouso.',
    dims: { lengthFt: 5, lengthIn: 8, widthIn: 18.25, thicknessIn: 2.125 },
    tail: 'swallow',
    noseRocker: 0.125,
    tailRocker: 0.06,
    noseWidth: 0.56,
    mods: { impulsao: -1, rotacao: 6, grab: 1, aterrissagem: -4 },
    unlockLevel: 1,
  },
  {
    id: 'launchpad',
    name: 'Launchpad',
    archetype: 'Impulsão e amplitude',
    description: 'Mais volume para decolar alto. Pesada para girar.',
    dims: { lengthFt: 5, lengthIn: 9, widthIn: 19, thicknessIn: 2.375 },
    tail: 'squash',
    noseRocker: 0.1,
    tailRocker: 0.045,
    noseWidth: 0.68,
    mods: { impulsao: 6, rotacao: -4, grab: 0, aterrissagem: 0 },
    unlockLevel: 1,
  },
  {
    id: 'lockin',
    name: 'Lock-In',
    archetype: 'Controle e aterrissagem',
    description: 'Estável e previsível no pouso. Decola mais baixo.',
    dims: { lengthFt: 5, lengthIn: 11, widthIn: 18.75, thicknessIn: 2.3125 },
    tail: 'round',
    noseRocker: 0.11,
    tailRocker: 0.05,
    noseWidth: 0.6,
    mods: { impulsao: -3, rotacao: -1, grab: 2, aterrissagem: 6 },
    unlockLevel: 1,
  },
  {
    id: 'wildcard',
    name: 'Wildcard',
    archetype: 'Versatilidade e experimentação',
    description: 'Imprevisível: brilha nas experimentais, sofre no pouso.',
    dims: { lengthFt: 5, lengthIn: 7, widthIn: 18.625, thicknessIn: 2.25 },
    tail: 'pin',
    noseRocker: 0.12,
    tailRocker: 0.055,
    noseWidth: 0.64,
    mods: { impulsao: 0, rotacao: 2, grab: 3, aterrissagem: -3 },
    unlockLevel: 1,
  },
];

/** Bônus extra da Wildcard só nas manobras experimentais. */
export const WILDCARD_EXPERIMENTAL_BONUS = 6;

export const FINS: Fin[] = [
  {
    id: 'thruster',
    name: 'Thruster',
    description: 'Três quilhas. Equilíbrio entre controle e soltura.',
    mods: { impulsao: 1, rotacao: 0, grab: 0, aterrissagem: 1 },
    unlockLevel: 1,
  },
  {
    id: 'twin',
    name: 'Twin Fin',
    description: 'Duas quilhas grandes. Veloz e solta, menos estável no pouso.',
    mods: { impulsao: 3, rotacao: 3, grab: 0, aterrissagem: -4 },
    unlockLevel: 1,
  },
  {
    id: 'quad',
    name: 'Quad',
    description: 'Quatro quilhas. Projeção e velocidade, trava um pouco o giro.',
    mods: { impulsao: 4, rotacao: -3, grab: 0, aterrissagem: 1 },
    unlockLevel: 1,
  },
];

export function findBoard(id: string): Board {
  return BOARDS.find((b) => b.id === id) ?? BOARDS[0];
}

export function findFin(id: string): Fin {
  return FINS.find((f) => f.id === id) ?? FINS[0];
}
