// Biblioteca de poses do surfista.
// Uma pose é um conjunto de parâmetros corporais independentes do modelo 3D;
// o animador interpola entre elas com aceleração e desaceleração suaves, e o
// rig converte o resultado em juntas por cinemática inversa. As sequências de
// cada manobra ficam em anim/choreography.ts.
//
// Convenções (base regular do jogo: pé direito à frente, de frente para a onda):
//   - twist e headYaw positivos giram o peito e a cabeça para a rabeta (as
//     costas abrem para o bico); negativos, para o bico.
//   - side positivo é peso na borda dos dedos (lado da parede da onda).
//   - Braços: posição da mão em relação ao ombro, no referencial do peito:
//     out para fora do corpo (do lado daquele braço), up para cima e fwd para
//     a frente do peito. O braço da frente é o direito; o de trás, o esquerdo.
//   - tweakRoll positivo levanta a borda dos dedos; tweakPitch positivo
//     levanta o bico; legSplit positivo estica a perna de trás (empurra a rabeta).

export interface BodyParams {
  /** 0 em pé, 1 agachado. */
  crouch: number;
  /** 0 pernas soltas, 1 joelhos no peito (no ar). */
  tuck: number;
  /** Peso para o bico (+) ou para a rabeta (−), −1 a 1. */
  lean: number;
  /** Peso para a borda dos dedos (+) ou dos calcanhares (−), −1 a 1. */
  side: number;
  /** Torção do peito em relação ao quadril, em radianos. */
  twist: number;
  /** Cabeça olhando para baixo (+) ou para cima (−). */
  headPitch: number;
  /** Giro da cabeça em relação ao peito (rad). */
  headYaw: number;
  /** Abertura do quadril para o bico (rad). */
  hipOpen: number;
  /** Mãos abertas (0) ou fechadas (1). */
  grip: number;
  /** Mão da frente (direita) e de trás (esquerda) em relação ao ombro. */
  faOut: number;
  faUp: number;
  faFwd: number;
  baOut: number;
  baUp: number;
  baFwd: number;
  /** Ajustes da prancha no ar (rad) e diferença entre as pernas. */
  tweakRoll: number;
  tweakPitch: number;
  legSplit: number;
}

type Arm = [out: number, up: number, fwd: number];

interface PoseSpec {
  crouch: number;
  tuck?: number;
  lean?: number;
  side?: number;
  twist?: number;
  headPitch?: number;
  headYaw?: number;
  hipOpen?: number;
  grip?: number;
  /** Braços derivados de abertura e altura, quando a pose não define cada mão. */
  spread?: number;
  armsUp?: number;
  front?: Arm;
  back?: Arm;
  tweakRoll?: number;
  tweakPitch?: number;
  legSplit?: number;
}

/** Monta uma pose completa. Os braços padrão seguem abertura (spread) e altura (armsUp). */
export function pose(s: PoseSpec): BodyParams {
  const spread = s.spread ?? 0.45;
  const up = s.armsUp ?? 0;
  const front = s.front ?? [0.1 + 0.36 * spread, -0.36 + 0.42 * up, 0.16];
  const back = s.back ?? [0.08 + 0.32 * spread, -0.4 + 0.38 * up, -0.02];
  return {
    crouch: s.crouch,
    tuck: s.tuck ?? 0,
    lean: s.lean ?? 0,
    side: s.side ?? 0,
    twist: s.twist ?? 0,
    headPitch: s.headPitch ?? 0.1,
    headYaw: s.headYaw ?? -0.2,
    hipOpen: s.hipOpen ?? 0.28,
    grip: s.grip ?? 0.2,
    faOut: front[0],
    faUp: front[1],
    faFwd: front[2],
    baOut: back[0],
    baUp: back[1],
    baFwd: back[2],
    tweakRoll: s.tweakRoll ?? 0,
    tweakPitch: s.tweakPitch ?? 0,
    legSplit: s.legSplit ?? 0,
  };
}

export const POSES = {
  // ---------- Na água ----------
  /** Remada e posição base surfando: joelhos soltos, braço da frente guiando. */
  base: pose({ crouch: 0.45, spread: 0.4, armsUp: -0.2 }),
  /** Drop: descendo a face logo depois de levantar, base baixa e braços abertos. */
  drop: pose({ crouch: 0.82, lean: 0.15, side: 0.1, spread: 0.75, armsUp: 0.15, headPitch: 0.25 }),
  /** Acelerando (W): peso à frente, joelhos trabalhando e braços impulsionando. */
  acelerando: pose({ crouch: 0.62, lean: 0.25, side: 0.05, twist: -0.12, spread: 0.6, headPitch: -0.05, grip: 0.3 }),
  /**
   * Bottom turn: de frente para a onda a curva é na borda dos dedos. Base baixa,
   * peso no pé de trás, ombros abrindo para a parede antes da prancha.
   */
  cavada: pose({ crouch: 0.85, lean: -0.2, side: 0.75, twist: 0.25, headYaw: 0.05, headPitch: -0.2, front: [0.3, -0.05, 0.3], back: [0.18, -0.4, 0.1] }),
  /** Subindo a face: o corpo se estende aos poucos e olha para o lip. */
  subidaFace: pose({ crouch: 0.52, lean: 0.02, side: 0.2, twist: 0.08, headPitch: -0.3, spread: 0.45 }),
  /** Topo da linha (sem decolar): curva na borda dos calcanhares, voltando a descer. */
  topo: pose({ crouch: 0.6, lean: -0.1, side: -0.55, twist: -0.2, headYaw: -0.35, spread: 0.55, armsUp: 0.1 }),
  /** Compressão antes da decolagem: centro de massa baixo e peso no pé de trás. */
  compressao: pose({ crouch: 0.95, lean: -0.25, side: 0.15, headPitch: -0.15, spread: 0.3, armsUp: -0.35, grip: 0.3 }),
  /**
   * Prancha na rabeta: o pé de trás empurra a rabeta contra o lip (perna de trás
   * estendendo), o joelho da frente sobe com o bico e os braços já sobem à frente.
   */
  popRabeta: pose({ crouch: 0.5, lean: -0.5, side: 0.1, legSplit: 0.5, headPitch: -0.3, front: [0.3, 0.18, 0.36], back: [0.22, 0.06, -0.12] }),
  /** Extensão explosiva na saída do lip: pernas esticam e braços sobem. */
  extensao: pose({ crouch: 0.1, lean: -0.1, headPitch: -0.25, spread: 0.6, armsUp: 0.45, tweakPitch: 0.12 }),

  // ---------- No ar: componentes comuns ----------
  /** Voo equilibrado, joelhos prontos para absorver o pouso. */
  arNeutro: pose({ crouch: 0.25, tuck: 0.45, spread: 0.85, armsUp: 0.3, headPitch: 0.2 }),
  /** Estica as pernas e olha para o ponto de pouso. */
  preparaPouso: pose({ crouch: 0.32, tuck: 0.12, lean: -0.05, headPitch: 0.45, spread: 0.75, armsUp: 0.15 }),

  // ---------- Straight Air ----------
  /** Flutuação simétrica, olhando a água à frente. */
  straightFlutua: pose({ crouch: 0.28, tuck: 0.4, headPitch: 0.3, headYaw: -0.25, front: [0.38, -0.12, 0.28], back: [0.34, -0.2, 0.02] }),

  // ---------- Frontside Air ----------
  /** Peito aberto para a parede, braço da frente esticado por cima da face. */
  fsExtensao: pose({ crouch: 0.12, lean: -0.05, side: 0.2, twist: -0.15, headPitch: -0.2, headYaw: -0.4, front: [0.3, 0.3, 0.32], back: [0.3, -0.1, -0.2], tweakPitch: 0.15 }),
  /** Joelhos levados para a onda, prancha inclinada mostrando o fundo para a praia. */
  fsPico: pose({ crouch: 0.22, tuck: 0.6, side: 0.45, twist: -0.25, headPitch: 0.15, headYaw: -0.5, hipOpen: 0.4, front: [0.3, 0.02, 0.4], back: [0.2, -0.42, -0.08], tweakRoll: 0.3, tweakPitch: 0.05 }),

  // ---------- Backside Air ----------
  /** O braço de trás varre para cima e para trás; o peito fecha para a rabeta. */
  bsExtensao: pose({ crouch: 0.12, lean: -0.15, side: -0.15, twist: 0.3, headPitch: -0.2, headYaw: 0.35, front: [0.05, -0.1, 0.32], back: [0.28, 0.3, -0.3], tweakPitch: 0.12 }),
  /** De costas para o lip: olha por cima do ombro de trás, rabeta empurrada pela perna de trás. */
  bsPico: pose({ crouch: 0.25, tuck: 0.5, lean: -0.1, side: -0.45, twist: 0.55, headPitch: 0.1, headYaw: 0.75, hipOpen: 0.12, front: [0.02, -0.12, 0.34], back: [0.3, 0.32, -0.36], tweakRoll: -0.32, legSplit: 0.35 }),

  // ---------- Reverse (180) ----------
  /** Frontside: cabeça e braço da frente puxam o giro pelo ombro da frente. */
  fsReverseInicio: pose({ crouch: 0.22, tuck: 0.6, side: 0.15, twist: -0.45, headYaw: -0.95, headPitch: 0.2, front: [0.4, 0.15, -0.25], back: [-0.02, 0.1, 0.36], legSplit: 0.15 }),
  /** Backside: ombro de trás lidera, olhando por cima dele (giro "cego"). */
  bsReverseInicio: pose({ crouch: 0.25, tuck: 0.55, side: -0.2, twist: 0.5, headYaw: 0.95, headPitch: 0.15, front: [-0.02, 0.05, 0.36], back: [0.4, 0.22, -0.25], legSplit: 0.2 }),
  /** Meio do giro: braços perto do corpo para girar mais rápido. */
  reverseMeio: pose({ crouch: 0.2, tuck: 0.75, headPitch: 0.3, front: [0.12, 0.05, 0.25], back: [0.1, 0.0, 0.22], grip: 0.4 }),

  // ---------- 360 ----------
  /** Frontside: ombros já enrolados, braço da frente abre o giro. */
  fs360Abre: pose({ crouch: 0.2, tuck: 0.55, side: 0.1, twist: -0.55, headYaw: -1.0, headPitch: 0.1, front: [0.45, 0.2, -0.2], back: [0.0, 0.2, 0.38] }),
  /** Backside: o braço de trás abre o giro por cima do ombro de trás. */
  bs360Abre: pose({ crouch: 0.22, tuck: 0.5, side: -0.15, twist: 0.55, headYaw: 1.0, headPitch: 0.05, front: [0.0, 0.18, 0.38], back: [0.45, 0.28, -0.22], legSplit: 0.15 }),
  /** Encolhido: braços colados ao peito e joelhos altos (menor inércia). */
  giroFechado: pose({ crouch: 0.18, tuck: 0.95, headPitch: 0.3, front: [0.05, 0.0, 0.22], back: [0.05, 0.02, 0.2], grip: 0.5 }),
  /** Fim do giro: braços abrem para frear e a cabeça procura o pouso. */
  giroAbreFinal: pose({ crouch: 0.28, tuck: 0.4, headPitch: 0.45, spread: 0.85, armsUp: 0.2 }),

  // ---------- Grabs ----------
  /** Indy: mão de trás na borda dos dedos entre os pés; braço da frente equilibra. */
  grabIndy: pose({ crouch: 0.2, tuck: 1, side: 0.2, twist: 0.1, headPitch: 0.4, headYaw: -0.3, front: [0.42, 0.2, 0.18], grip: 1, tweakRoll: 0.32, tweakPitch: 0.1 }),
  /** Mute: mão da frente cruza para a borda dos dedos; o braço de trás sobe. */
  grabMute: pose({ crouch: 0.2, tuck: 1, side: 0.25, twist: -0.2, headPitch: 0.4, headYaw: -0.15, back: [0.35, 0.35, -0.2], grip: 1, tweakRoll: 0.25, tweakPitch: -0.05 }),
  /** Melon: mão da frente por trás da perna da frente, na borda dos calcanhares. */
  grabMelon: pose({ crouch: 0.22, tuck: 0.95, side: -0.35, twist: -0.45, headPitch: 0.35, headYaw: -0.4, back: [0.38, 0.4, -0.1], grip: 1, tweakRoll: -0.3, tweakPitch: 0.12 }),
  /** Stalefish: mão de trás por trás da perna de trás, na borda dos calcanhares; rabeta para fora. */
  grabStalefish: pose({ crouch: 0.25, tuck: 0.85, lean: -0.1, side: -0.4, twist: 0.6, headPitch: 0.35, headYaw: 0.4, front: [0.36, 0.32, 0.25], grip: 1, tweakRoll: -0.3, legSplit: 0.4 }),

  // ---------- Pouso ----------
  /** Absorção do impacto com joelhos e quadril. */
  absorcao: pose({ crouch: 0.98, lean: -0.1, side: 0.2, headPitch: 0.25, spread: 0.6, armsUp: 0.05 }),
  /** Pouso instável: braços buscando equilíbrio. */
  instavel: pose({ crouch: 0.9, lean: -0.35, side: 0.5, twist: 0.3, headYaw: 0.1, spread: 1, armsUp: 0.6, grip: 0.1 }),
  /** Saída tranquila depois do pouso. */
  saida: pose({ crouch: 0.5, lean: 0.05, side: 0.3, spread: 0.45, armsUp: -0.1 }),
  /** Comemoração depois de um pouso limpo (claim). */
  comemoracao: pose({ crouch: 0.35, side: 0.15, twist: -0.2, headPitch: -0.35, spread: 0.7, armsUp: 0.95, grip: 0.9, front: [0.25, 0.42, 0.12], back: [0.25, 0.4, 0.02] }),
} satisfies Record<string, BodyParams>;

export type PoseName = keyof typeof POSES;

export const BODY_KEYS = Object.keys(POSES.base) as (keyof BodyParams)[];

export function easeInOut(u: number): number {
  const t = Math.min(1, Math.max(0, u));
  return t * t * (3 - 2 * t);
}

export function blendPoses(a: BodyParams, b: BodyParams, u: number): BodyParams {
  const t = easeInOut(u);
  const out = { ...a };
  for (const k of BODY_KEYS) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}

export interface Keyframe {
  /** Segundos relativos à âncora da fase. */
  t: number;
  pose: PoseName | BodyParams;
}

function resolve(p: PoseName | BodyParams): BodyParams {
  return typeof p === 'string' ? POSES[p] : p;
}

/**
 * Avalia uma sequência de keyframes no tempo t. A interpolação é cúbica e
 * monotônica (Fritsch–Carlson) em cada parâmetro: a velocidade é contínua
 * entre uma pose e a próxima, então o corpo não "para" em cada pose-chave
 * (o que dava o aspecto robótico de pose a pose), e sem passar do alvo.
 * Só desacelera onde o movimento de fato muda de sentido ou segura a pose.
 */
export function sampleSequence(keys: Keyframe[], t: number): BodyParams {
  const n = keys.length;
  if (t <= keys[0].t) return { ...resolve(keys[0].pose) };
  if (t >= keys[n - 1].t) return { ...resolve(keys[n - 1].pose) };
  let i = 0;
  while (i < n - 2 && t > keys[i + 1].t) i++;
  const p0 = resolve(keys[i].pose);
  const p1 = resolve(keys[i + 1].pose);
  const pPrev = i > 0 ? resolve(keys[i - 1].pose) : null;
  const pNext = i + 2 < n ? resolve(keys[i + 2].pose) : null;
  const t0 = keys[i].t;
  const t1 = keys[i + 1].t;
  const h = Math.max(1e-4, t1 - t0);
  const hPrev = i > 0 ? Math.max(1e-4, t0 - keys[i - 1].t) : 0;
  const hNext = i + 2 < n ? Math.max(1e-4, keys[i + 2].t - t1) : 0;
  const u = (t - t0) / h;
  const u2 = u * u;
  const u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1;
  const h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2;
  const h11 = u3 - u2;
  const out = { ...p0 };
  // Tangente monotônica num ponto: zero quando a inclinação muda de sinal.
  const tangent = (dA: number, dB: number) => (dA * dB <= 0 ? 0 : (2 * dA * dB) / (dA + dB));
  for (const k of BODY_KEYS) {
    const d = (p1[k] - p0[k]) / h;
    const dPrev = pPrev ? (p0[k] - pPrev[k]) / hPrev : 0;
    const dNext = pNext ? (pNext[k] - p1[k]) / hNext : 0;
    const m0 = pPrev ? tangent(dPrev, d) : 0;
    const m1 = pNext ? tangent(d, dNext) : 0;
    out[k] = h00 * p0[k] + h10 * h * m0 + h01 * p1[k] + h11 * h * m1;
  }
  return out;
}

/**
 * Depois do pouso, conforme o resultado. depth (0 a 1) é a força do impacto:
 * quanto mais rápido o corpo chega à água, mais fundo os joelhos absorvem.
 */
export function landingKeys(outcome: 'limpa' | 'concluida' | 'instavel', depth = 0.8): Keyframe[] {
  const absorb = blendPoses(POSES.saida, POSES.absorcao, 0.45 + 0.55 * depth);
  if (outcome === 'instavel') {
    return [
      { t: 0, pose: 'preparaPouso' },
      { t: 0.1, pose: absorb },
      { t: 0.35, pose: 'instavel' },
      { t: 1.1, pose: 'instavel' },
      { t: 1.7, pose: 'saida' },
    ];
  }
  const keys: Keyframe[] = [
    { t: 0, pose: 'preparaPouso' },
    { t: 0.09, pose: absorb },
    { t: 0.45, pose: 'saida' },
  ];
  if (outcome === 'limpa') keys.push({ t: 0.85, pose: 'comemoracao' }, { t: 1.5, pose: 'comemoracao' }, { t: 1.9, pose: 'saida' });
  return keys;
}
