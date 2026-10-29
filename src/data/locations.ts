import type { Location, WindType } from '../core/types';

export const WIND_LABELS: Record<WindType, string> = {
  terral: 'Terral',
  maral: 'Maral',
  lateral: 'Lateral',
};

export const WIND_HINTS: Record<WindType, string> = {
  terral: 'Sopra da terra para o mar: segura a face, mas freia o aéreo e joga o spray para trás.',
  maral: 'Sopra do mar: fraco ajuda a decolar, forte deixa a onda mexida.',
  lateral: 'Sopra de lado: atrapalha um pouco o controle no ar.',
};

export const LOCATIONS: Location[] = [
  {
    id: 'pico-leste',
    name: 'Pico Leste',
    kind: 'Beach break tropical',
    description: 'Água turquesa e ondas irregulares. A seção muda bastante de uma onda para outra.',
    unlockLevel: 1,
    heightRange: [0.75, 2.0],
    powerRange: [35, 70],
    windTypes: ['maral', 'lateral', 'terral'],
    windSpeedRange: [0, 25],
    sectionRange: [30, 85],
    sectionVariance: 20,
    windAffects: true,
    visual: {
      sunElevation: 52,
      sunAzimuth: 25,
      turbidity: 2.2,
      rayleigh: 2.2,
      exposure: 0.36,
      deepColor: 0x05496b,
      shallowColor: 0x23b5c4,
      foamTint: 0xf4fbff,
      fogColor: 0xbfdcec,
      scenery: 'praia',
    },
  },
  {
    id: 'ponta-rampa',
    name: 'Ponta da Rampa',
    kind: 'Point break ao entardecer',
    description: 'Ondas maiores e fortes ao lado de um pontal de pedras, com seções longas e consistentes.',
    unlockLevel: 1,
    heightRange: [1.25, 2.75],
    powerRange: [55, 90],
    windTypes: ['terral', 'lateral', 'maral'],
    windSpeedRange: [0, 30],
    sectionRange: [45, 90],
    sectionVariance: 10,
    windAffects: true,
    visual: {
      sunElevation: 7,
      sunAzimuth: 295,
      turbidity: 8,
      rayleigh: 2.6,
      exposure: 0.36,
      deepColor: 0x0a2f4a,
      shallowColor: 0x2a7f95,
      foamTint: 0xfff0dc,
      fogColor: 0xe8b48a,
      scenery: 'pontal',
    },
  },
  {
    id: 'lagoa-azul',
    name: 'Piscina Lagoa Azul',
    kind: 'Piscina de ondas',
    description: 'Ondas artificiais idênticas e sem vento, ótimas para treinar a técnica.',
    unlockLevel: 3,
    heightRange: [1.0, 1.75],
    powerRange: [55, 65],
    windTypes: ['lateral'],
    windSpeedRange: [0, 0],
    sectionRange: [65, 80],
    sectionVariance: 3,
    windAffects: false,
    visual: {
      sunElevation: 35,
      sunAzimuth: 60,
      turbidity: 2,
      rayleigh: 1.8,
      exposure: 0.38,
      deepColor: 0x0b5d84,
      shallowColor: 0x37cde0,
      foamTint: 0xffffff,
      fogColor: 0xcfe3f0,
      scenery: 'piscina',
    },
  },
];

export function findLocation(id: string): Location {
  return LOCATIONS.find((l) => l.id === id) ?? LOCATIONS[0];
}
