import type { AirPhase, Outcome } from '../core/types';

// Expressões do rosto, dirigidas pelo que está acontecendo na onda.
//
// Cada expressão é um conjunto de pesos de 0 a 1 (ou −1 a 1) que o rig
// aplica às pálpebras, sobrancelhas, olhos e boca. Nada aqui depende do
// Three.js: o mesmo estado da onda sempre dá a mesma expressão, e a transição
// entre elas é suavizada no rig. Piscar é feito no rig, por cima disso.

export interface FaceExpression {
  /** Pálpebra superior descendo (0 aberto, 1 fechado). */
  lidClose: number;
  /** Pálpebra de baixo subindo e bochecha subindo (olhar apertado). */
  squint: number;
  /** Sobrancelhas subindo (surpresa, esforço). */
  browRaise: number;
  /** Sobrancelhas descendo e juntando (concentração). */
  browFurrow: number;
  /** Boca aberta (mandíbula). */
  mouthOpen: number;
  /** Cantos da boca: + sorriso, − careta. */
  smile: number;
  /** Boca apertada (concentração, impacto). */
  lipPress: number;
  /** Bochechas infladas (esforço no pop). */
  puff: number;
}

export const NEUTRAL: FaceExpression = { lidClose: 0.12, squint: 0.15, browRaise: 0, browFurrow: 0, mouthOpen: 0.04, smile: 0.05, lipPress: 0, puff: 0 };

/** Expressões de referência. */
export const EXPRESSIONS = {
  neutro: NEUTRAL,
  /** Remando: calmo, olhar no horizonte, sol no rosto. */
  remada: { ...NEUTRAL, squint: 0.35, lidClose: 0.2 },
  /** Drop e navegação: atenção na parede da onda. */
  foco: { ...NEUTRAL, squint: 0.4, browFurrow: 0.35, lipPress: 0.3, smile: 0 },
  /** Compressão subindo para o lip: concentração máxima. */
  concentracao: { ...NEUTRAL, squint: 0.55, browFurrow: 0.75, lipPress: 0.7, smile: -0.1, lidClose: 0.25 },
  /** Pop: esforço, boca soltando o ar. */
  esforco: { ...NEUTRAL, squint: 0.3, browFurrow: 0.4, browRaise: 0.25, mouthOpen: 0.45, puff: 0.3, smile: -0.2 },
  /** No ar: olhos bem abertos procurando o pouso. */
  voo: { ...NEUTRAL, lidClose: 0, squint: 0.05, browRaise: 0.55, mouthOpen: 0.22, smile: 0 },
  /** Preparando o pouso: olhar fixo, boca apertada. */
  pouso: { ...NEUTRAL, squint: 0.35, browFurrow: 0.5, lipPress: 0.6, smile: -0.05 },
  /** Pouso limpo: sorriso aberto (stoke). */
  alegria: { ...NEUTRAL, lidClose: 0.18, squint: 0.6, browRaise: 0.35, mouthOpen: 0.4, smile: 1, lipPress: 0 },
  /** Pouso concluído: satisfação contida. */
  satisfeito: { ...NEUTRAL, squint: 0.4, browRaise: 0.1, mouthOpen: 0.12, smile: 0.6 },
  /** Pouso instável: careta segurando o equilíbrio. */
  careta: { ...NEUTRAL, squint: 0.7, browFurrow: 0.8, browRaise: 0.2, mouthOpen: 0.3, smile: -0.8, lipPress: 0.2 },
  /** Queda: susto, boca aberta, olhos arregalados e depois fechados na água. */
  susto: { ...NEUTRAL, lidClose: 0, squint: 0, browRaise: 1, mouthOpen: 0.85, smile: -0.4 },
} satisfies Record<string, FaceExpression>;

export type ExpressionId = keyof typeof EXPRESSIONS;

export interface FaceContext {
  phase: AirPhase;
  airborne: boolean;
  falling: boolean;
  /** Segundos desde o último pouso (Infinity se ainda não pousou). */
  sinceLanding: number;
  lastOutcome: Outcome | null;
  /** Segundos desde a decolagem (Infinity no chão). */
  sinceTakeoff: number;
  /** Segurando o Espaço (compressão). */
  compressing: boolean;
}

/** Qual expressão o surfista faz agora. */
export function expressionFor(c: FaceContext): ExpressionId {
  if (c.falling) return 'susto';
  if (c.airborne) {
    if (c.sinceTakeoff < 0.18) return 'esforco';
    return c.phase === 'descida' || c.phase === 'aterrissagem' ? 'pouso' : 'voo';
  }
  if (c.lastOutcome && c.sinceLanding < 2.2) {
    if (c.lastOutcome === 'limpa') return 'alegria';
    if (c.lastOutcome === 'concluida') return 'satisfeito';
    if (c.lastOutcome === 'instavel') return c.sinceLanding < 1.2 ? 'careta' : 'foco';
  }
  if (c.compressing) return 'concentracao';
  return c.phase === 'remada' ? 'remada' : 'foco';
}

/** Mistura duas expressões (t de 0 a 1). */
export function mixExpression(a: FaceExpression, b: FaceExpression, t: number, out: FaceExpression = { ...a }): FaceExpression {
  for (const k of Object.keys(a) as (keyof FaceExpression)[]) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}
