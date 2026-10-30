// Base do surfista sobre a prancha: medidas do corpo, âncoras dos pés no deck,
// massas e restrições das pernas. É lógica pura (sem Three.js) para o animador,
// o rig e os testes usarem as mesmas referências.
//
// Referencial de base: x para o bico (m a partir do centro da prancha), y para
// cima do deck e f para a frente do corpo (borda dos dedos). O surfista usa
// pé direito à frente e fica de frente para a parede da onda.

/** Medidas do corpo em metros (1,78 m de altura). */
export const BODY = {
  thigh: 0.45,
  shin: 0.44,
  upperArm: 0.3,
  forearm: 0.27,
  ankleHeight: 0.075,
  hipHalfWidth: 0.09,
  /** Junta do quadril abaixo da pelve. */
  hipDrop: 0.06,
  shoulderHalfWidth: 0.19,
  spine: 0.12,
  chest: 0.27,
  neck: 0.22,
};

/** Massas usadas no centro de massa combinado (kg). */
export const SURFER_MASS = 75;
export const BOARD_MASS = 3.2;

/** Alcance máximo da perna (quadril até tornozelo) antes de travar o joelho: 97% do comprimento. */
export const LEG_REACH = (BODY.thigh + BODY.shin) * 0.97;
/** Alcance mínimo: joelho dobrado no limite anatômico (~145°). */
export const LEG_MIN_REACH = 0.24;

export interface DeckAnchors {
  /** Centro do pé da frente (direito) e do pé de trás (esquerdo), em x. */
  frontX: number;
  backX: number;
  /** Ponto médio entre os pés: abaixo dele fica o quadril. */
  midX: number;
  stance: number;
  /** Tornozelo deslocado para os calcanhares, para o pé ficar centrado na largura. */
  ankleF: number;
  /** Abertura dos pés (rad): o da frente aponta um pouco para o bico; o de trás fica quase atravessado. */
  frontSplay: number;
  backSplay: number;
}

/**
 * Âncoras dos pés a partir do comprimento da prancha. O pé de trás fica no
 * deck pad, em cima das quilhas laterais (~25 cm da rabeta), e o da frente a
 * uma base de ombros à frente, perto do centro da prancha.
 */
export function deckAnchors(length: number): DeckAnchors {
  const backX = -length / 2 + 0.25;
  // Base proporcional ao corpo: ~32% da altura, um pouco maior em pranchas compridas.
  const stance = Math.min(0.6, Math.max(0.52, 0.5 + (length - 1.7) * 0.25));
  const frontX = backX + stance;
  return { frontX, backX, midX: (frontX + backX) / 2, stance, ankleF: -0.035, frontSplay: 0.3, backSplay: 0.08 };
}

/** Inclinação do deck (rad) em x: o pé acompanha o rocker, principalmente no kick da rabeta. */
export function deckSlope(deckY: (x: number, z: number) => number, x: number): number {
  const e = 0.04;
  return Math.atan2(deckY(x + e, 0) - deckY(x - e, 0), 2 * e);
}

/**
 * Centro de massa combinado no referencial de base, a partir da altura da
 * pelve sobre o deck e do ponto médio dos pés. O tronco puxa o centro do
 * corpo um pouco acima da pelve.
 */
export function combinedCom(midX: number, deck: number, pelvisH: number, lean: number): { x: number; y: number } {
  const bodyX = midX + lean * 0.12;
  const bodyY = deck + pelvisH + 0.12;
  const m = SURFER_MASS + BOARD_MASS;
  return { x: (bodyX * SURFER_MASS) / m, y: (bodyY * SURFER_MASS) / m };
}

/**
 * Ângulo do joelho (rad, 0 perna reta) para uma distância quadril–tornozelo,
 * pela lei dos cossenos. Usado para validar a flexão.
 */
export function kneeFlexion(dist: number): number {
  const a = BODY.thigh;
  const b = BODY.shin;
  const d = Math.min(a + b, Math.max(Math.abs(a - b), dist));
  const cosK = (a * a + b * b - d * d) / (2 * a * b);
  return Math.PI - Math.acos(Math.min(1, Math.max(-1, cosK)));
}

/** Zonas da face, medidas pela distância até a crista (m): usadas na decolagem e na depuração. */
export type FaceZone = 'lip' | 'superior' | 'intermediaria' | 'inferior' | 'base';

export function faceZone(fromCrest: number, faceWidth: number): FaceZone {
  const u = fromCrest / faceWidth;
  if (u < 0.15) return 'lip';
  if (u < 0.35) return 'superior';
  if (u < 0.6) return 'intermediaria';
  if (u < 0.85) return 'inferior';
  return 'base';
}

export const ZONE_LABEL: Record<FaceZone, string> = {
  lip: 'Lip',
  superior: 'Parte superior',
  intermediaria: 'Meio da face',
  inferior: 'Parte inferior',
  base: 'Base da onda',
};
