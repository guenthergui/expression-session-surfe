import type { GrabKey } from '../core/controls';
import type { GrabId } from '../core/types';
import { GRAB_POSE } from './choreography';
import { blendPoses, POSES, sampleSequence, type BodyParams, type Keyframe } from './poses';

// Pose do corpo no ar, calculada a cada quadro a partir do estado físico do
// voo. Não existe uma animação inteira por aéreo: cada camada responde a uma
// parte do que o jogador está fazendo, e a combinação dá a identidade:
//   1. saída: compressão → prancha na rabeta → extensão (para o lado do giro);
//   2. voo: flutuação, giro (peito lidera no frontside, costas no backside;
//      o corpo fecha quando gira rápido) ou flip (joelhos no peito);
//   3. grab: a pose de cada grab, na medida em que a mão chegou à borda;
//   4. extensão: Christ, Superman, Superwoman ou o chute do Varial;
//   5. pouso: estende as pernas e procura a água com o olhar (↓ ou perto do toque).

export interface AirPoseInput {
  /** Tempo de voo (s) e estimativa até o toque. */
  t: number;
  toTouch: number;
  yaw: number;
  /** Velocidade de giro (graus/s, + frontside). */
  yawRate: number;
  flip: number;
  flipRate: number;
  grab: { id: GrabKey; amount: number } | null;
  /** Tweak do Grab Air segurado (vira Japan). */
  japan: number;
  christ: number;
  superman: number;
  superwoman: number;
  varial: number | null;
  prep: number;
  /** Carga de giro na decolagem (−1 a 1). */
  windup: number;
}

/** Grab visível: o Grab Air puxado vira a pose do Japan. */
export function grabPoseId(id: GrabKey, japan: number): GrabId {
  return id === 'mute' && japan > 0.5 ? 'japan' : id;
}

function exitKeys(dir: number): Keyframe[] {
  const ext = dir > 0.25 ? 'fsExtensao' : dir < -0.25 ? 'bsExtensao' : 'extensao';
  return [
    { t: 0, pose: 'compressao' },
    { t: 0.07, pose: 'popRabeta' },
    { t: 0.19, pose: ext },
  ];
}

export function airPose(a: AirPoseInput): BodyParams {
  const spinDir = Math.abs(a.yawRate) > 40 ? Math.sign(a.yawRate) : Math.sign(a.windup);
  // 2. Voo
  let body: BodyParams;
  const rate = Math.abs(a.yawRate);
  const yawAbs = Math.abs(a.yaw);
  if (a.flipRate > 60 || (a.flip > 40 && a.flip < 320)) {
    body = blendPoses(POSES.straightFlutua, POSES.flipFechado, Math.min(1, a.flipRate / 250 + 0.4));
  } else if (rate > 90) {
    // Começo do giro: o lado que lidera abre; girando rápido, o corpo fecha.
    const start = spinDir > 0 ? POSES.fs360Abre : POSES.bs360Abre;
    const open = Math.max(0, 1 - yawAbs / 140);
    const closed = rate > 300 ? POSES.giroFechado : POSES.reverseMeio;
    body = blendPoses(closed, start, open);
  } else if (yawAbs > 25 && yawAbs < 160) {
    // Frontside ou Backside Air: o corpo abre para o lado e a prancha mostra o fundo.
    const pico = a.yaw > 0 ? POSES.fsPico : POSES.bsPico;
    body = blendPoses(POSES.straightFlutua, pico, Math.min(1, yawAbs / 70));
  } else if (yawAbs >= 160) {
    body = blendPoses(POSES.giroAbreFinal, POSES.straightFlutua, 0.3);
  } else {
    body = { ...POSES.straightFlutua };
  }
  // 3. Grab
  if (a.grab) body = blendPoses(body, POSES[GRAB_POSE[grabPoseId(a.grab.id, a.japan)]], a.grab.amount);
  // 4. Extensões
  if (a.christ > 0) body = blendPoses(body, POSES.christ, a.christ);
  if (a.superman > 0) body = blendPoses(body, POSES.superman, a.superman);
  if (a.superwoman > 0) body = blendPoses(body, POSES.superwoman, a.superwoman);
  if (a.varial !== null) body = blendPoses(body, POSES.varialChute, Math.sin(Math.PI * a.varial));
  // 5. Pouso: o corpo se prepara sozinho perto da água, e antes com ↓.
  const land = Math.max(a.prep, 1 - Math.min(1, a.toTouch / 0.3));
  if (land > 0) body = blendPoses(body, POSES.preparaPouso, land * (a.grab ? 0.5 : 1));
  // 1. Saída do lip, entrando no voo sem salto.
  if (a.t < 0.3) {
    const exit = sampleSequence(exitKeys(spinDir), a.t);
    body = blendPoses(exit, body, Math.max(0, (a.t - 0.12) / 0.18));
  }
  body.feetOff = 0;
  return body;
}
