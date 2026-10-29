import type { AttributeKey, Attributes } from '../core/types';

export const ATTRIBUTE_LABELS: Record<AttributeKey, string> = {
  forca: 'Força',
  impulsao: 'Impulsão',
  amplitude: 'Amplitude',
  rotacao: 'Rotação',
  controleAereo: 'Controle aéreo',
  equilibrio: 'Equilíbrio',
  leituraOnda: 'Leitura de onda',
  resistencia: 'Resistência',
  criatividade: 'Criatividade',
  estilo: 'Estilo',
};

export const ATTRIBUTE_EN: Record<AttributeKey, string> = {
  forca: 'Strength',
  impulsao: 'Impulsion',
  amplitude: 'Amplitude',
  rotacao: 'Rotation',
  controleAereo: 'Air Control',
  equilibrio: 'Balance',
  leituraOnda: 'Wave Reading',
  resistencia: 'Endurance',
  criatividade: 'Creativity',
  estilo: 'Style',
};

/** O que cada atributo faz no jogo, mostrado na tela de evolução. */
export const ATTRIBUTE_HINTS: Record<AttributeKey, string> = {
  forca: 'Velocidade na base da onda e chance em todas as manobras.',
  impulsao: 'Altura da decolagem e chance em todas as manobras.',
  amplitude: 'Tempo e altura de voo. Pesa em todas as manobras.',
  rotacao: 'Chance nas manobras com giro ou flip.',
  controleAereo: 'Janela Perfect maior e chance em rotações e grabs.',
  equilibrio: 'Chance de pouso limpo em todas as manobras.',
  leituraOnda: 'Reduz as penalidades de mar e vento ruins.',
  resistencia: 'Diminui o cansaço ao longo das cinco ondas.',
  criatividade: 'Chance nas manobras experimentais.',
  estilo: 'Bônus de estilo na pontuação e peso nos grabs.',
};

export const INITIAL_ATTRIBUTES: Attributes = {
  forca: 30,
  impulsao: 30,
  amplitude: 25,
  rotacao: 25,
  controleAereo: 30,
  equilibrio: 30,
  leituraOnda: 30,
  resistencia: 40,
  criatividade: 20,
  estilo: 20,
};

export const MAX_ATTRIBUTE = 100;
