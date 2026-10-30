import * as THREE from 'three';
import { airPose, grabPoseId } from '../anim/airPose';
import { GRAB_CONTACT, HIP_LEAD, SHOULDER_LEAD, SUPERMAN_CONTACTS, WINDUP_DEG, type GrabContact } from '../anim/choreography';
import { blendPoses, landingKeys, POSES, sampleSequence, type BodyParams, type Keyframe } from '../anim/poses';
import { BODY, LEG_MIN_REACH, LEG_REACH, combinedCom, deckAnchors, deckSlope, faceZone, type DeckAnchors, type FaceZone } from '../anim/stance';
import type { AirPhase, GrabId, Outcome } from '../core/types';
import { AIR_G } from '../sim/airPhysics';
import { crestOffset, faceWidth, surfaceHeight, surfaceNormal, type WaveState } from '../sim/waveField';
import type { WaveRun } from '../sim/waveRun';
import type { WorldPose } from '../render/SurferRig';

// Animação da onda inteira, conduzida pelo tempo e pelo estado físico do jogo
// (sim/waveRun.ts). Não toca animações prontas: a cada quadro ela lê a física
// e monta a pose.
//   - na água: a linha, a curva (inclinação de equilíbrio atan(a/g)), a
//     compressão e a carga de giro vêm da navegação;
//   - no ar: posição, giro, flip, Varial, grabs, extensões e preparação do
//     pouso vêm de sim/airPhysics.ts; a pose é anim/airPose.ts;
//   - giro em cadeia: os ombros adiantam o quadril, que adianta a prancha,
//     pela velocidade angular real;
//   - contato: os pés ficam presos às âncoras do deck (pé de trás em cima das
//     quilhas), a pelve se ajusta para as pernas alcançarem o deck, e o rig
//     resolve pernas e braços por cinemática inversa. Só Superman, Superwoman e
//     o chute do Varial tiram os pés da prancha, de propósito;
//   - pouso: os joelhos absorvem conforme o impacto e, depois de um giro de
//     180°, a prancha completa o giro na água.
//
// Base do surfista: pé direito à frente (no sentido do deslocamento) e de
// frente para a parede da onda, ou seja, de costas para a câmera. Tudo é
// descrito num "referencial de base": x para o bico, y para cima e f para a
// frente do corpo. A conversão para a prancha é feita num único lugar
// (stanceToBoard) e o corpo é girado 180° (STANCE_YAW).

export interface SprayEvent {
  kind: 'carve' | 'launch' | 'land' | 'fall' | 'bodySplash' | 'boardSlap' | 'crest' | 'paddle' | 'drop';
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  strength: number;
  /** Resultado do pouso, quando o evento é de pouso. */
  outcome?: Outcome;
}

/** Referências para a ferramenta de depuração do movimento (só no modo de desenvolvimento). */
export interface MotionDebug {
  /** Estado detalhado, por exemplo "surf · bottom turn". */
  state: string;
  choreo: string;
  zone: FaceZone | null;
  anchorFront: THREE.Vector3;
  anchorBack: THREE.Vector3;
  com: THREE.Vector3;
  contact: THREE.Vector3;
  velocity: THREE.Vector3;
  accel: THREE.Vector3;
  spinAxis: THREE.Vector3;
  waveNormal: THREE.Vector3;
  lip: THREE.Vector3;
  /** Giro (graus, + frontside) dos ombros, do quadril e da prancha. */
  shoulders: number;
  hips: number;
  board: number;
  /** Inclinação da prancha na borda (graus, + dedos para baixo). */
  roll: number;
}

export interface AnimFrame {
  boardPos: THREE.Vector3;
  boardQuat: THREE.Quaternion;
  pose: WorldPose;
  phase: AirPhase;
  airborne: boolean;
  falling: boolean;
  /** Altura do surfista acima da água, para a câmera. */
  heightAboveWater: number;
  /** Diferença de giro entre quadril e prancha, em graus (para depuração e testes). */
  bodyBoardLag: number;
  /** Velocidade da prancha na água (m/s), para rastro e spray. */
  speed: number;
  /** Pés soltos da prancha de propósito (Superman, Superwoman, Varial), de 0 a 1. */
  feetOff: number;
  /** Grab visível agora e quanto a mão já chegou à borda. */
  grab: GrabId | null;
  grabAmount: number;
  events: SprayEvent[];
  debug: MotionDebug;
}

/** O que o animador precisa saber da prancha, sem depender do Three.js da cena. */
export interface BoardShapeInfo {
  shape: { length: number; width: number; thickness: number };
  deckY(x: number, z: number): number;
  halfWidth(u: number): number;
}

const UP = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
/** O corpo fica de frente para -z da prancha (parede da onda), de costas para a câmera. */
export const STANCE_YAW = Math.PI;
/** Lado do corpo que vai para o bico. */
export const FRONT_SIDE = 'right' as const;
/** Altura da pelve sobre o deck no instante da decolagem (pose de compressão). */
const H_TAKEOFF = 0.58;
/** Tempo de transição da prancha e do corpo na saída da água e na volta. */
const TAKEOFF_BLEND = 0.15;
const LANDING_ALIGN = 0.28;
/** Tempo (s) para a prancha passar da orientação do voo (ou do drop) para a da água. */
const TRANSITION_TIME = 0.12;
/** Tempo mínimo (s) para o corpo esticar no Christ, Superman ou Superwoman. */
const EXTEND_TIME = 0.26;

function approach(cur: number, target: number, step: number): number {
  return cur + Math.max(-step, Math.min(step, target - cur));
}
/** Diferença máxima de giro entre ombros e quadril, e entre quadril e prancha (graus). */
const MAX_SHOULDER_HIP = 45;
const MAX_HIP_BOARD = 30;
/** Saída pela rabeta: ângulo máximo do bico (rad), tempo até ele, tempo para nivelar e tempo com a rabeta na água (s). */
const POP_PEAK = 0.4;
const POP_RISE = 0.09;
const POP_SETTLE = 0.24;
const TAIL_HOLD = 0.11;
/** Tempo do pouso até a pose voltar a ser só a da navegação (s). */
const LANDING_SETTLE = 1.6;
/** Partes do corpo com movimento secundário no ar. */
const SECONDARY_KEYS: (keyof BodyParams)[] = ['faOut', 'faUp', 'faFwd', 'baOut', 'baUp', 'baFwd', 'headYaw', 'headPitch', 'twist'];

function smooth(u: number): number {
  const t = Math.min(1, Math.max(0, u));
  return t * t * (3 - 2 * t);
}

/** Altura da pelve sobre o deck para uma pose. */
export function pelvisHeight(b: BodyParams, grab: number): number {
  return 0.84 - 0.27 * b.crouch - 0.38 * b.tuck - 0.06 * grab;
}

/** Converte o referencial de base (x bico, y cima, f frente do corpo) para a prancha. */
function stanceToBoard(out: THREE.Vector3, x: number, y: number, f: number): THREE.Vector3 {
  return out.set(x, y, -f);
}

/** Ângulo (graus) normalizado em (−180, 180]. */
function wrapDeg(a: number): number {
  const r = ((a % 360) + 360) % 360;
  return r > 180 ? r - 360 : r;
}

export class AerialAnimator {
  readonly anchors: DeckAnchors;
  /** Giro (graus, + frontside) dos ombros, do quadril e da prancha no último quadro. */
  private shoulderAngle = 0;
  private hipAngle = 0;
  private boardAngle = 0;
  private fallStart: { t: number; pos: THREE.Vector3; vel: THREE.Vector3; boardQuat: THREE.Quaternion; spinAxis: THREE.Vector3; splashed: boolean; slapped: boolean } | null = null;
  private inAir = false;
  /** Pouso que a animação já começou a mostrar. */
  private landingShown: number | null = null;
  private landingSeq: Keyframe[] | null = null;
  private smoothedBody: BodyParams = { ...POSES.base };
  /** Pose e orientação da prancha no último quadro na água, para a decolagem sair delas sem salto. */
  private rideBody: BodyParams = { ...POSES.base };
  private readonly launchQuat = new THREE.Quaternion();
  /** Deslocamento horizontal do centro de massa até a origem da prancha na decolagem. */
  private readonly comOffset = new THREE.Vector3();
  private lastPhase: AirPhase = 'remada';
  private dropSprayed = false;
  /** Distância ombro–borda depois do ajuste do grab (m), para a depuração. */
  grabReach = 0;
  /** Orientação da prancha na última troca de estado e quando ela aconteceu. */
  private readonly transQuat = new THREE.Quaternion();
  private transAt = -Infinity;
  private waterMode: 'remada' | 'drop' | 'surf' | null = null;
  private readonly transBodyQuat = new THREE.Quaternion();
  private transHip = 0;
  private transChest = 0;
  private lastHipYaw = 0;
  /** Extensões e pés fora da prancha como aparecem na tela (seguem a física com um tempo mínimo). */
  private visExt = { christ: 0, superman: 0, superwoman: 0, feet: 0 };
  private lastChestYaw = 0;
  private reachPrev: { drop: number; shift: number; yaw: number; dBend: number; dTwist: number; dSide: number } | null = null;
  /** Ajuste do grab aplicado no corpo: segue a busca com suavização, para os passos dela não virarem trancos. */
  private reachSmooth: { drop: number; shift: number; yaw: number; dBend: number; dTwist: number; dSide: number } | null = null;
  private stepDt = 1 / 60;
  private stateLabel = '';
  private zone: FaceZone | null = null;
  private roll = 0;
  private hasPrev = false;
  private readonly prevCom = new THREE.Vector3();
  private readonly prevVel = new THREE.Vector3();
  /** Grab e extensões no quadro atual. */
  private curGrab: GrabId | null = null;
  private curGrabAmt = 0;
  private superman = 0;
  private feetOff = 0;
  private spinAxisNow = new THREE.Vector3(0, 1, 0);

  private readonly boardPos = new THREE.Vector3();
  private readonly boardQuat = new THREE.Quaternion();
  /**
   * Referencial do corpo: igual ao da prancha na água, mas no ar e na saída
   * da rabeta ele não segue toda a inclinação da prancha, nem o giro do Varial.
   * As pernas absorvem a diferença (os pés continuam presos ao deck).
   */
  private readonly bodyPos = new THREE.Vector3();
  private readonly bodyQuat = new THREE.Quaternion();
  /** Movimento secundário no ar: braços e cabeça seguem a pose com um pequeno atraso. */
  private readonly secondary = new Map<keyof BodyParams, { x: number; v: number }>();
  private tailReleased = false;
  /** Bico subindo em volta da rabeta (rad): a prancha pivota no ponto onde a rabeta toca a água. */
  private popPitch = 0;
  private popAtLaunch = 0;
  private readonly rideQuatNoPop = new THREE.Quaternion();
  private readonly tailAtLaunch = new THREE.Vector3();
  private readonly launchPos = new THREE.Vector3();
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();
  private readonly tmpC = new THREE.Vector3();
  private readonly tmpD = new THREE.Vector3();
  private readonly tmpE = new THREE.Vector3();
  private readonly reachDir = new THREE.Vector3();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpQ2 = new THREE.Quaternion();
  private readonly tmpQ3 = new THREE.Quaternion();
  private readonly tmpM = new THREE.Matrix4();
  private readonly tmpM2 = new THREE.Matrix4();
  private readonly tmpEuler = new THREE.Euler();
  private readonly pose: WorldPose = {
    pelvisPos: new THREE.Vector3(),
    pelvisQuat: new THREE.Quaternion(),
    spineBend: 0,
    chestTwist: 0,
    spineSide: 0,
    headPitch: 0,
    headYaw: 0,
    footLeft: { pos: new THREE.Vector3(), quat: new THREE.Quaternion() },
    footRight: { pos: new THREE.Vector3(), quat: new THREE.Quaternion() },
    handLeft: new THREE.Vector3(),
    handRight: new THREE.Vector3(),
    gripLeft: 0.2,
    gripRight: 0.2,
    kneePoleLeft: new THREE.Vector3(),
    kneePoleRight: new THREE.Vector3(),
    elbowPoleLeft: new THREE.Vector3(),
    elbowPoleRight: new THREE.Vector3(),
  };
  private readonly frame: AnimFrame;

  constructor(
    readonly wave: WaveState,
    readonly board: BoardShapeInfo,
    readonly run: WaveRun,
  ) {
    this.anchors = deckAnchors(board.shape.length);
    const v = () => new THREE.Vector3();
    this.frame = {
      boardPos: this.boardPos,
      boardQuat: this.boardQuat,
      pose: this.pose,
      phase: 'remada',
      airborne: false,
      falling: false,
      heightAboveWater: 0,
      bodyBoardLag: 0,
      speed: 0,
      feetOff: 0,
      grab: null,
      grabAmount: 0,
      events: [],
      debug: {
        state: '', choreo: '', zone: null,
        anchorFront: v(), anchorBack: v(), com: v(), contact: v(), velocity: v(), accel: v(),
        spinAxis: v(), waveNormal: v(), lip: v(), shoulders: 0, hips: 0, board: 0, roll: 0,
      },
    };
  }

  private waveAt(t: number): WaveState {
    return { ...this.wave, time: t };
  }

  /** Orientação da prancha na água: bico na direção do movimento e deck na normal da água. */
  private rideQuat(out: THREE.Quaternion, pos: THREE.Vector3, next: THREE.Vector3, w: WaveState, roll: number): THREE.Quaternion {
    const nRaw = surfaceNormal(w, pos.x, pos.z);
    const n = this.tmpA.set(nRaw.x, nRaw.y, nRaw.z);
    const f = this.tmpB.subVectors(next, pos);
    f.addScaledVector(n, -f.dot(n));
    if (f.lengthSq() < 1e-6) f.set(1, 0, 0);
    f.normalize();
    const z = this.tmpC.crossVectors(f, n).normalize();
    out.setFromRotationMatrix(this.tmpM.makeBasis(f, n, z));
    return out.multiply(this.tmpQ2.setFromAxisAngle(X_AXIS, roll));
  }

  /** Suaviza a pose (sem saltos quando o estado muda, por exemplo ao soltar W). */
  private ease(target: BodyParams, dt: number, rate = 8): BodyParams {
    const k = 1 - Math.exp(-dt * rate);
    const s = this.smoothedBody;
    for (const key of Object.keys(target) as (keyof BodyParams)[]) s[key] += (target[key] - s[key]) * k;
    return { ...s };
  }

  update(t: number, dt: number): AnimFrame {
    this.stepDt = dt;
    const events: SprayEvent[] = [];
    this.frame.events = events;
    const run = this.run;
    this.popPitch = 0;
    this.curGrab = null;
    this.curGrabAmt = 0;
    this.superman = 0;
    this.feetOff = 0;
    let phase: AirPhase;
    let airborne = false;
    let body: BodyParams;
    let windmill = 0;
    let prone = 0; // 1 deitado, 0 em pé
    let hipYaw = 0;
    let chestYaw = 0;
    const boardPos = this.boardPos;
    const boardQuat = this.boardQuat;
    this.zone = null;

    if (run.state === 'fallen' && !this.fallStart) this.startFall(t);
    if (this.fallStart) return this.fallFrame(t, dt, events);

    const air = run.air;
    if (air) {
      airborne = true;
      const tAir = air.t;
      if (!this.inAir) this.beginAir(events);
      const toTouch = air.timeToTouch();
      const v = run.velocity();
      const vel = this.tmpE.set(v.x, air.vy, v.z);

      // Giro em cadeia: ombros adiantam o quadril, que adianta a prancha.
      const rate = air.yawRate;
      this.boardAngle = air.yaw + air.varial;
      // A vantagem dos ombros e do quadril cresce durante o arremesso, sem salto na saída do lip.
      const lead = smooth(tAir / TAKEOFF_BLEND);
      this.hipAngle = air.yaw + THREE.MathUtils.clamp(rate * HIP_LEAD, -MAX_HIP_BOARD, MAX_HIP_BOARD) * (1 - air.prep * 0.6) * lead;
      this.shoulderAngle = this.hipAngle + THREE.MathUtils.clamp(rate * (SHOULDER_LEAD - HIP_LEAD), -MAX_SHOULDER_HIP, MAX_SHOULDER_HIP) * lead;
      hipYaw = -THREE.MathUtils.degToRad(this.hipAngle - air.yaw);
      chestYaw = -THREE.MathUtils.degToRad(this.shoulderAngle - this.hipAngle);

      const g = air.activeGrab();
      // Esticar o corpo e tirar os pés da prancha leva um tempo mínimo (sem salto de pose).
      const ext = this.visExt;
      const step = dt / EXTEND_TIME;
      ext.christ = approach(ext.christ, air.ext.christ, step);
      ext.superman = approach(ext.superman, air.ext.superman, step);
      ext.superwoman = approach(ext.superwoman, air.ext.superwoman, step);
      ext.feet = approach(ext.feet, air.feetOff, step * 1.4);
      body = airPose({
        t: tAir, toTouch, yaw: air.yaw, yawRate: rate, flip: air.flip, flipRate: air.flipRate,
        grab: g, japan: air.japanTweak, christ: smooth(ext.christ), superman: smooth(ext.superman), superwoman: smooth(ext.superwoman),
        varial: air.varialProgress, prep: air.prep, windup: air.launch.windup,
      });
      if (tAir < TAKEOFF_BLEND) body = blendPoses(this.rideBody, body, tAir / TAKEOFF_BLEND);
      body = this.ease(body, dt, 22);
      body = this.followThrough(body, dt);
      if (g) {
        this.curGrab = grabPoseId(g.id, air.japanTweak);
        this.curGrabAmt = g.amount;
      }
      this.superman = smooth(ext.superman);
      this.feetOff = smooth(ext.feet);
      body.feetOff = this.feetOff;

      // Orientação: direção do voo, bico acompanhando a trajetória, ajustes da pose, giro e flip.
      // O corpo recebe só parte da inclinação e dos ajustes da prancha (as pernas absorvem o resto).
      const x0 = this.tmpA.set(vel.x, 0, vel.z);
      if (x0.lengthSq() < 1e-6) x0.set(1, 0, 0);
      x0.normalize();
      const z0 = this.tmpB.crossVectors(x0, UP).normalize();
      const flightPitch = Math.atan2(vel.y, Math.hypot(vel.x, vel.z)) * 0.55 * (1 - Math.min(1, Math.abs(air.flip) / 90));
      const pitch = flightPitch + body.tweakPitch + body.legSplit * 0.22;
      const tweakRoll = body.tweakRoll;
      const flipRad = THREE.MathUtils.degToRad(air.flip);
      const basis = new THREE.Quaternion().setFromRotationMatrix(this.tmpM.makeBasis(x0, UP, z0));
      const flipAxis = x0.clone();
      this.spinAxisNow.copy(UP);
      if (Math.abs(air.flipRate) > 30) this.spinAxisNow.copy(flipAxis);
      const landP = new THREE.Vector3(air.x + vel.x * toTouch, 0, air.z(t) + vel.z * toTouch);
      const landW = this.waveAt(t + toTouch);
      landP.y = surfaceHeight(landW, landP.x, landP.z);
      const orient = (out: THREE.Quaternion, yawDeg: number, p: number, r: number) => {
        out.copy(basis).multiply(this.tmpQ2.setFromAxisAngle(Z_AXIS, p)).multiply(this.tmpQ2.setFromAxisAngle(X_AXIS, r));
        out.premultiply(this.tmpQ2.setFromAxisAngle(flipAxis, flipRad));
        out.premultiply(this.tmpQ2.setFromAxisAngle(UP, -THREE.MathUtils.degToRad(yawDeg)));
        // Saindo da água: passa da orientação na face para a do voo sem salto.
        if (tAir < TAKEOFF_BLEND) out.slerpQuaternions(this.launchQuat, this.tmpQ3.copy(out), smooth(tAir / TAKEOFF_BLEND));
        // Chegando na água: alinha com a face, mantendo o giro feito.
        if (toTouch < LANDING_ALIGN && tAir > TAKEOFF_BLEND) {
          const after = this.tmpD.copy(landP).addScaledVector(x0, 0.4);
          const ride = this.rideQuat(this.tmpQ3, landP, after, landW, 0);
          ride.premultiply(this.tmpQ2.setFromAxisAngle(UP, -THREE.MathUtils.degToRad(yawDeg)));
          out.slerp(ride, smooth(1 - toTouch / LANDING_ALIGN) * 0.85);
        }
        return out;
      };
      orient(boardQuat, this.boardAngle, pitch, tweakRoll);
      orient(this.bodyQuat, air.yaw, flightPitch + (pitch - flightPitch) * 0.35, tweakRoll * 0.35);

      // Posição: centro de massa na balística; a prancha gira em volta dele.
      boardPos.set(air.x, air.y, air.z(t));
      const ang = -THREE.MathUtils.degToRad(air.yaw);
      const orbit = this.tmpA.copy(this.comOffset).applyAxisAngle(UP, ang).sub(this.comOffset);
      const env = smooth(tAir / 0.12) * (1 - smooth((0.35 - toTouch) / 0.33));
      boardPos.addScaledVector(orbit, env);
      // Encolher as pernas puxa a prancha para cima, em direção ao corpo.
      const h = pelvisHeight(body, this.curGrabAmt);
      const lift = THREE.MathUtils.clamp(H_TAKEOFF - h, -0.25, 0.4) * smooth(tAir / 0.12) * (1 - smooth((0.16 - toTouch) / 0.16)) * (1 - this.feetOff);
      boardPos.addScaledVector(this.tmpA.set(0, 1, 0).applyQuaternion(boardQuat), lift);
      this.bodyPos.copy(boardPos);

      // Saída pela rabeta: o pé de trás empurra a rabeta contra o lip e o bico sobe primeiro,
      // com a prancha girando em volta da rabeta, que ainda toca a água. Quando a rabeta solta,
      // os joelhos sobem e trazem a prancha para baixo do corpo, nivelando o bico.
      const rise = this.popAtLaunch + (POP_PEAK - this.popAtLaunch) * Math.sin((Math.PI / 2) * Math.min(1, tAir / POP_RISE));
      const pop = rise * (1 - smooth((tAir - POP_RISE) / POP_SETTLE));
      const hold = 1 - smooth(tAir / TAIL_HOLD);
      if (pop > 1e-4 || hold > 1e-4) {
        const tailTarget = this.tmpD.copy(this.tailAtLaunch).add(this.tmpE.set(air.vx * tAir, air.vy0 * tAir * 0.45, v.z * tAir));
        this.pivotOnTail(pop, hold, tailTarget);
      }
      if (!this.tailReleased && hold < 0.15) {
        this.tailReleased = true;
        const tail = this.tailPoint(new THREE.Vector3(), boardPos, boardQuat);
        events.push({ kind: 'launch', pos: tail, dir: new THREE.Vector3(-0.3, 1, 0.2).normalize(), strength: 0.45 });
      }

      const inMove = Math.abs(rate) > 90 || Math.abs(air.flipRate) > 60 || this.curGrabAmt > 0.1 || air.feetOff > 0.1 || air.ext.christ > 0.1;
      phase = tAir < TAIL_HOLD + 0.04 ? 'decolagem' : toTouch < 0.25 ? 'aterrissagem' : inMove ? 'manobra' : air.vy > 0 ? 'subida' : 'descida';
      const detail = air.feetOff > 0.3 ? 'pés fora da prancha' : this.curGrabAmt > 0.1 ? `grab ${this.curGrab}` : Math.abs(air.flipRate) > 60 ? 'flip' : 'giro';
      this.stateLabel = {
        decolagem: hold > 0.15 ? 'decolagem · prancha na rabeta' : 'decolagem · rabeta soltou, extensão',
        aterrissagem: air.prep > 0.3 ? 'preparando o pouso (↓)' : 'reorientando para o pouso',
        manobra: `manobra · ${detail}`,
        subida: 'subida',
        descida: 'descida',
      }[phase as 'decolagem'];
      this.roll = tweakRoll;
    } else {
      // Troca de estado (pouso, fim do drop): a prancha sai da orientação anterior sem salto.
      const mode = run.state === 'paddling' ? 'remada' : run.state === 'dropping' || run.standing < 1 ? 'drop' : 'surf';
      if (this.inAir || (this.waterMode !== null && this.waterMode !== mode)) {
        this.transQuat.copy(boardQuat);
        this.transBodyQuat.copy(this.bodyQuat);
        this.transHip = this.lastHipYaw;
        this.transChest = this.lastChestYaw;
        this.transAt = t;
      }
      this.waterMode = mode;
      this.inAir = false;
      // Na água: remada, drop, surf e saída do pouso, seguindo a máquina de estados.
      const w = this.waveAt(t);
      const p = run.position();
      boardPos.set(p.x, p.y, p.z);
      const v = run.velocity();
      const vel = this.tmpD.set(v.x, 0, v.z);
      const next = this.tmpE.copy(boardPos).addScaledVector(vel, 0.05);
      const lat = run.lateralAccel();
      // Inclinação de equilíbrio da curva: atan(a/g). Negativa = borda dos dedos.
      const riding = run.state === 'riding' || run.state === 'finished';
      const rollTarget = riding ? THREE.MathUtils.clamp(Math.atan2(lat, AIR_G) * 0.9, -0.85, 0.85) : 0;
      this.roll += (rollTarget - this.roll) * (1 - Math.exp(-dt * 7));
      const up = run.standing;
      prone = 1 - smooth(up);
      const fromCrest = boardPos.z - crestOffset(w, boardPos.x);
      this.zone = faceZone(fromCrest, faceWidth(w));
      const L = run.lastLanding;
      const tOut = L ? t - L.t : Infinity;
      let landYaw = 0;
      if (run.state === 'paddling') {
        body = { ...POSES.base };
        phase = 'remada';
        this.stateLabel = 'remada';
        if (Math.random() < dt * 6) events.push({ kind: 'paddle', pos: boardPos.clone(), dir: UP.clone(), strength: 0.4 });
      } else if (run.state === 'dropping' || up < 1) {
        body = this.ease(blendPoses(POSES.drop, POSES.base, smooth((t - (run.dropAt ?? t)) / 1.4)), dt);
        phase = 'drop';
        this.stateLabel = 'drop · descendo a face';
        if (!this.dropSprayed) {
          this.dropSprayed = true;
          events.push({ kind: 'drop', pos: boardPos.clone(), dir: new THREE.Vector3(-0.4, 0.8, 0.4).normalize(), strength: 0.9 });
        }
      } else {
        let target = this.ridingTarget(t, lat);
        if (L && tOut < LANDING_SETTLE) {
          // Saída do pouso: absorção nos joelhos e, se for o caso, o giro que termina na água.
          const unstable = L.result.outcome === 'instavel';
          if (this.landingShown !== L.t) {
            this.landingShown = L.t;
            this.landingSeq = landingKeys(L.result.outcome === 'queda' ? 'instavel' : L.result.outcome, L.result.impact);
            events.push({ kind: 'land', pos: boardPos.clone(), dir: new THREE.Vector3(1, 0.4, -0.3).normalize(), strength: unstable ? 1.6 : 1.1 + L.result.impact * 0.4, outcome: L.result.outcome });
          }
          const landBody = sampleSequence(this.landingSeq!, tOut);
          target = blendPoses(landBody, target, smooth((tOut - 0.9) / (LANDING_SETTLE - 0.9)));
          windmill = unstable ? tOut * 9 : 0;
          landYaw = this.landingYaw(L.yaw + L.varial, L.result.fakie, tOut);
          if (unstable) landYaw += 12 * Math.sin(tOut * 7) * Math.exp(-tOut * 2.2);
          this.roll += unstable ? Math.sin(tOut * 16) * 0.2 * Math.max(0, 1 - tOut / 1.2) : 0;
          phase = tOut < 0.35 ? 'aterrissagem' : 'saida';
          if (tOut < 0.35) this.stateLabel = `pouso · absorção (${Math.round(L.result.impact * 100)}%)`;
          else if (L.result.fakie && tOut < 0.8) this.stateLabel = 'saída · completando o giro na água';
          else if (unstable) this.stateLabel = 'saída · recuperando o equilíbrio';
        } else {
          phase = run.accelerating ? 'aceleracao' : 'surf';
        }
        // A compressão perto do lip é rápida (cerca de 0,25 s).
        body = this.ease(target, dt, run.compressing ? 16 : L && tOut < 0.5 ? 20 : 8);
        if (Math.random() < dt * (12 + run.speed * 3)) {
          events.push({ kind: 'carve', pos: boardPos.clone(), dir: vel.clone().normalize(), strength: 0.25 + Math.abs(this.roll) * 1.4 + run.speedFactor * 0.6 });
        }
      }
      this.rideQuat(boardQuat, boardPos, next, w, this.roll);
      if (landYaw !== 0) boardQuat.premultiply(this.tmpQ2.setFromAxisAngle(UP, -THREE.MathUtils.degToRad(landYaw)));
      const blend = smooth(Math.max(0, (t - this.transAt) / TRANSITION_TIME));
      if (blend < 1) boardQuat.copy(this.tmpQ.copy(this.transQuat).slerp(boardQuat, blend));
      this.boardAngle = landYaw;
      this.hipAngle = landYaw * 0.85;
      this.shoulderAngle = landYaw * 0.7;
      hipYaw = -THREE.MathUtils.degToRad(this.hipAngle - landYaw);
      chestYaw = -THREE.MathUtils.degToRad(this.shoulderAngle - this.hipAngle);
      this.rideBody = { ...body };
      this.rideQuatNoPop.copy(boardQuat);
      this.bodyPos.copy(boardPos);
      this.bodyQuat.copy(boardQuat);
      if (blend < 1) {
        // O corpo também chega à água aos poucos (vinha adiantado no giro).
        this.bodyQuat.copy(this.tmpQ.copy(this.transBodyQuat).slerp(boardQuat, blend));
        hipYaw = this.transHip + (hipYaw - this.transHip) * blend;
        chestYaw = this.transChest + (chestYaw - this.transChest) * blend;
      }
      // Chegando ao lip, o pé de trás carrega a rabeta e o bico sobe: o corpo não inclina junto.
      if (this.popPitch > 0) this.pivotOnTail(this.popPitch, 0, null);
    }

    this.lastHipYaw = hipYaw;
    this.lastChestYaw = chestYaw;
    this.boardPose(body, this.curGrabAmt, windmill, hipYaw, chestYaw);
    if (prone > 0) this.blendProne(prone, t, run.state === 'paddling');
    const water = surfaceHeight(this.waveAt(t), boardPos.x, boardPos.z);
    const f = this.frame;
    f.phase = phase;
    this.lastPhase = phase;
    f.airborne = airborne;
    f.falling = false;
    f.heightAboveWater = boardPos.y - water;
    f.bodyBoardLag = this.hipAngle - this.boardAngle;
    f.speed = run.groundSpeed;
    f.feetOff = this.feetOff;
    f.grab = this.curGrab;
    f.grabAmount = this.curGrabAmt;
    this.fillDebug(t, dt, body, this.curGrabAmt);
    return f;
  }

  /** Começo do voo: guarda a orientação e a pose da água para sair delas sem salto. */
  private beginAir(events: SprayEvent[]) {
    const air = this.run.air!;
    this.inAir = true;
    this.visExt = { christ: 0, superman: 0, superwoman: 0, feet: 0 };
    this.launchQuat.copy(this.rideQuatNoPop);
    this.popAtLaunch = this.popPitch;
    this.launchPos.set(air.x, air.y, air.z(this.run.t));
    this.tailPoint(this.tailAtLaunch, this.boardPos, this.launchQuat);
    this.tailReleased = false;
    this.secondary.clear();
    this.rideBody = { ...this.smoothedBody };
    // O giro acontece em volta do centro de massa combinado, que fica entre os pés (atrás do centro da prancha).
    const com = combinedCom(this.anchors.midX, this.board.deckY(0, 0), H_TAKEOFF, 0);
    this.comOffset.set(-com.x, 0, 0).applyQuaternion(this.boardQuat).setY(0);
    const v = this.run.velocity();
    const dir = new THREE.Vector3(v.x, air.vy0, v.z).normalize();
    events.push({ kind: 'launch', pos: this.launchPos.clone(), dir, strength: 0.8 + air.vy0 / 8 });
  }

  /**
   * Giro da prancha (graus) na saída do pouso. Depois de meia volta ela entra
   * de costas e completa o giro na água; com um resto pequeno, só corrige.
   */
  private landingYaw(yawAtTouch: number, fakie: boolean, tOut: number): number {
    if (fakie) {
      const rem = ((yawAtTouch % 360) + 360) % 360;
      const target = yawAtTouch >= 0 ? 360 : 0;
      return wrapDeg(rem + (target - rem) * smooth(tOut / 0.7));
    }
    return wrapDeg(yawAtTouch) * (1 - smooth(tOut / 0.3));
  }

  /**
   * Pose surfando: base, bottom turn na borda dos dedos, subida da face,
   * topo na borda dos calcanhares e compressão segurando o espaço.
   */
  private ridingTarget(t: number, lat: number): BodyParams {
    const run = this.run;
    let target = run.accelerating ? { ...POSES.acelerando } : { ...POSES.base };
    // Aceleração lateral negativa curvando para a parede (bottom turn), positiva no topo.
    const turn = THREE.MathUtils.clamp(-lat / 9, -1, 1);
    if (turn > 0) target = blendPoses(target, POSES.cavada, turn * 0.9);
    else target = blendPoses(target, POSES.topo, -turn * 0.6);
    const seg = run.lineSegment();
    if (seg === 'subida') target = blendPoses(target, POSES.subidaFace, 0.6);
    // Peso nos pés: a pelve vai para o pé carregado.
    const r = run.rider;
    if (r) target.lean += r.weight * 0.25;
    // Compressão: centro de massa baixo e ombros enrolados ao contrário do giro carregado.
    const c = run.compression;
    if (c > 0) {
      target = blendPoses(target, POSES.compressao, 0.9 * c);
      target.twist += run.windup * THREE.MathUtils.degToRad(WINDUP_DEG) * c;
      target.headYaw -= run.windup * 0.25 * c;
      // Perto do lip o pé de trás carrega a rabeta e o bico começa a subir ainda na água.
      if (run.takeoffReady) this.popPitch = 0.12 * c;
    }
    // Bombeando a prancha com W: o centro de massa sobe e desce.
    if (run.accelerating) target.crouch += 0.12 * Math.sin(t * 7) * (1 - c);
    const zone = { base: 'bottom turn', subida: 'subindo a face', topo: 'topo da onda', descida: 'descendo a face' };
    this.stateLabel = c > 0.05 ? `compressão${run.windup ? ' · carregando o giro' : ''}` : run.recovering ? 'recuperando o equilíbrio' : run.accelerating ? `bombeando · ${seg ? zone[seg] : ''}` : `surf · ${seg ? zone[seg] : 'linha'}`;
    return target;
  }


  /** Ponto da rabeta que toca a água (embaixo, perto da ponta), no mundo. */
  private tailPoint(out: THREE.Vector3, pos: THREE.Vector3, quat: THREE.Quaternion): THREE.Vector3 {
    const L = this.board.shape.length;
    return out.set(-L / 2 + 0.08, -this.board.shape.thickness * 0.4, 0).applyQuaternion(quat).add(pos);
  }

  /**
   * Gira a prancha (só a prancha) levantando o bico em volta da rabeta. Com hold,
   * a rabeta ainda é puxada para o ponto onde continua presa na água.
   */
  private pivotOnTail(angle: number, hold: number, tailTarget: THREE.Vector3 | null) {
    const tail = this.tailPoint(new THREE.Vector3(), this.boardPos, this.boardQuat);
    const axis = this.tmpB.set(0, 0, 1).applyQuaternion(this.boardQuat);
    const q = this.tmpQ2.setFromAxisAngle(axis, angle);
    this.boardQuat.premultiply(q);
    this.boardPos.sub(tail).applyQuaternion(q).add(tail);
    if (tailTarget && hold > 0) {
      const now = this.tailPoint(this.tmpB, this.boardPos, this.boardQuat);
      this.boardPos.addScaledVector(now.sub(tailTarget), -hold);
    }
  }

  /**
   * Movimento secundário no ar: braços, cabeça e torção seguem a pose como
   * massas presas por molas (sistema de segunda ordem, passo fixo). Eles
   * chegam um pouco depois e assentam com um leve balanço, em vez de parar
   * exatamente na pose-chave.
   */
  private followThrough(target: BodyParams, dt: number): BodyParams {
    const out = { ...target };
    const w = 15;
    const z = 0.72;
    for (const k of SECONDARY_KEYS) {
      let st = this.secondary.get(k);
      if (!st) {
        st = { x: this.rideBody[k], v: 0 };
        this.secondary.set(k, st);
      }
      let rest = dt;
      while (rest > 1e-6) {
        const h = Math.min(rest, 1 / 240);
        rest -= h;
        const a = w * w * (target[k] - st.x) - 2 * z * w * st.v;
        st.v += a * h;
        st.x += st.v * h;
      }
      out[k] = st.x;
    }
    return out;
  }

  /** Último quadro calculado (para a depuração). */
  get current(): AnimFrame {
    return this.frame;
  }

  get phase(): AirPhase {
    return this.lastPhase;
  }

  /** Converte os parâmetros de corpo em alvos no mundo, no referencial de base da prancha. */
  private boardPose(b: BodyParams, grabIn: number, windmill: number, hipYaw: number, chestYaw: number) {
    let grab = grabIn;
    const bd = this.board;
    const an = this.anchors;
    const boardPos = this.boardPos;
    const boardQuat = this.boardQuat;
    const pose = this.pose;
    const toWorld = (out: THREE.Vector3, x: number, y: number, f: number) =>
      stanceToBoard(out, x, y, f).applyQuaternion(boardQuat).add(boardPos);
    const deck = bd.deckY(an.midX, 0);
    const h = pelvisHeight(b, grab);

    // Pés: âncoras fixas no deck, acompanhando o rocker (o pé de trás fica no kick da rabeta).
    const footFront = FRONT_SIDE === 'right' ? pose.footRight : pose.footLeft;
    const footBack = FRONT_SIDE === 'right' ? pose.footLeft : pose.footRight;
    for (const [foot, x, splay] of [[footFront, an.frontX, an.frontSplay], [footBack, an.backX, an.backSplay]] as const) {
      toWorld(foot.pos, x, bd.deckY(x, an.ankleF), an.ankleF);
      foot.quat.copy(boardQuat)
        .multiply(this.tmpQ.setFromAxisAngle(Z_AXIS, deckSlope((dx, dz) => bd.deckY(dx, dz), x)))
        .multiply(this.tmpQ2.setFromAxisAngle(Y_AXIS, STANCE_YAW - splay));
    }

    // Pelve entre os pés, sentada para os calcanhares quando agacha; o peso desloca para o pé carregado.
    // Ela é posicionada no referencial do corpo, que pode não acompanhar toda a inclinação da prancha.
    stanceToBoard(pose.pelvisPos, an.midX + b.lean * 0.1 - b.legSplit * 0.05, deck + h, -0.04 - 0.07 * b.crouch + b.side * 0.07)
      .applyQuaternion(this.bodyQuat).add(this.bodyPos);
    this.tmpEuler.set(0.12 + 0.22 * b.crouch + 0.2 * b.tuck, STANCE_YAW - b.hipOpen + hipYaw, -b.side * 0.12, 'YXZ');
    pose.pelvisQuat.copy(this.bodyQuat).multiply(this.tmpQ.setFromEuler(this.tmpEuler));
    // Pés fora da prancha (só Superman, Superwoman e o chute do Varial): o tronco
    // deita para o bico e os pés vão para trás (Superman), para o lado (Superwoman)
    // ou sobem acima do deck (Varial), relativos à pelve, sempre ao alcance das pernas.
    const off = this.feetOff;
    if (off > 0.01) {
      const lay = b.bodyLay * off;
      pose.pelvisPos.addScaledVector(stanceToBoard(this.tmpA, -0.18 * lay, 0.08 * lay, 0).applyQuaternion(this.bodyQuat), 1);
      for (const [foot, side] of [[footFront, 0.09], [footBack, -0.09]] as const) {
        const kick = stanceToBoard(this.tmpB,
          -0.72 * b.kickBack - 0.3 * b.kickSide + side,
          -0.62 + 0.42 * b.kickBack + 0.2 * b.kickSide,
          -0.5 * b.kickSide - 0.02,
        ).applyQuaternion(this.bodyQuat).add(pose.pelvisPos);
        // Varial: os pés só sobem acima das âncoras, deixando a prancha girar.
        const lifted = this.tmpC.copy(foot.pos).addScaledVector(this.tmpE.set(0, 1, 0).applyQuaternion(this.bodyQuat), 0.3);
        const target = b.kickBack + b.kickSide > 0.2 ? kick : lifted;
        foot.pos.lerp(target, off);
        foot.quat.slerp(this.tmpQ3.copy(this.bodyQuat).multiply(this.tmpQ2.setFromAxisAngle(Y_AXIS, STANCE_YAW)), off * 0.6);
      }
    }
    if (off < 0.5) this.constrainLegs();

    // Coluna e cabeça
    pose.spineBend = 0.2 + 0.35 * b.crouch + 0.4 * b.tuck + 0.35 * grab + 0.85 * b.bodyLay * off;
    pose.chestTwist = b.twist + chestYaw;
    pose.spineSide = b.side * 0.25;

    // Grab: ponto de contato na borda certa; o tronco e o quadril descem até o braço alcançar.
    let grabTarget: THREE.Vector3 | null = null;
    let grabHand: 'frente' | 'tras' = 'tras';
    let second: THREE.Vector3 | null = null;
    const contactPoint = (out: THREE.Vector3, c: GrabContact) => {
      const x = an.midX + c.dx;
      const hw = bd.halfWidth(x / bd.shape.length + 0.5);
      return toWorld(out, x, bd.deckY(x, 0) + 0.05, c.rail * (hw + 0.02));
    };
    if (this.superman > 0.05) {
      // Superman: as duas mãos nas bordas perto do bico.
      grab = Math.max(grab, this.superman);
      grabTarget = contactPoint(this.tmpD, SUPERMAN_CONTACTS[0]);
      grabHand = 'frente';
      second = contactPoint(new THREE.Vector3(), SUPERMAN_CONTACTS[1]);
      this.reachForGrab(grabTarget, -1, grab);
    } else if (grab > 0 && this.curGrab) {
      const c = GRAB_CONTACT[this.curGrab];
      grabTarget = contactPoint(this.tmpD, c);
      grabHand = c.hand;
      this.reachForGrab(grabTarget, c.hand === 'tras' ? 1 : -1, grab);
    } else {
      this.reachPrev = null;
      this.reachSmooth = null;
      this.grabReach = 0;
    }
    pose.headPitch = b.headPitch - pose.spineBend * 0.6;
    pose.headYaw = THREE.MathUtils.clamp(b.headYaw - chestYaw * 0.5, -1.2, 1.2);

    // Braços: a mão é posicionada em relação ao ombro, no referencial do peito.
    const chest = this.chestMatrix(this.tmpM2);
    const chestQ = this.tmpQ3.setFromRotationMatrix(chest);
    const wm = windmill ? [Math.sin(windmill) * 0.22, Math.cos(windmill) * 0.18, Math.sin(windmill + 2) * 0.22, Math.cos(windmill + 2) * 0.18] : [0, 0, 0, 0];
    const handFront = FRONT_SIDE === 'right' ? pose.handRight : pose.handLeft;
    const handBack = FRONT_SIDE === 'right' ? pose.handLeft : pose.handRight;
    // Direita = −x do rig; esquerda = +x.
    this.handFromShoulder(handFront, chest, chestQ, -1, b.faOut, b.faUp + wm[0], b.faFwd + wm[1]);
    this.handFromShoulder(handBack, chest, chestQ, 1, b.baOut, b.baUp + wm[2], b.baFwd + wm[3]);
    let gripFront = b.grip * 0.5;
    let gripBack = b.grip * 0.5;
    // Grab: o pulso vai até a borda certa da prancha e só então a mão fecha.
    if (grabTarget) {
      const g = smooth((grab - 0.6) / 0.4);
      if (grabHand === 'tras') {
        handBack.lerp(grabTarget, grab);
        gripBack = g;
      } else {
        handFront.lerp(grabTarget, grab);
        gripFront = g;
      }
      if (second) {
        handBack.lerp(second, grab);
        gripBack = g;
      }
    }
    pose.gripRight = FRONT_SIDE === 'right' ? gripFront : gripBack;
    pose.gripLeft = FRONT_SIDE === 'right' ? gripBack : gripFront;

    // Joelhos: o da frente aponta para o bico; o de trás fecha para dentro, em direção ao da frente.
    const kneeFront = FRONT_SIDE === 'right' ? pose.kneePoleRight : pose.kneePoleLeft;
    const kneeBack = FRONT_SIDE === 'right' ? pose.kneePoleLeft : pose.kneePoleRight;
    const kq = this.tmpQ.copy(this.bodyQuat).multiply(this.tmpQ2.setFromAxisAngle(Y_AXIS, hipYaw * 0.5));
    stanceToBoard(kneeFront, 0.5, 0.1 + 0.3 * b.tuck, 0.85).applyQuaternion(kq).normalize();
    stanceToBoard(kneeBack, 0.8, 0.05 + 0.3 * b.tuck, 0.6).applyQuaternion(kq).normalize();
    // Cotovelos para baixo, para trás e um pouco para fora.
    pose.elbowPoleRight.set(-0.4, -0.5, -0.75).applyQuaternion(chestQ).normalize();
    pose.elbowPoleLeft.set(0.4, -0.5, -0.75).applyQuaternion(chestQ).normalize();
  }

  /**
   * Os pés são restrições fixas: se uma perna não alcança o deck (ou dobraria
   * além do limite do joelho), a pelve se aproxima ou se afasta do pé, em vez
   * de o pé sair do deck.
   */
  private constrainLegs() {
    const pose = this.pose;
    const hip = this.tmpA;
    const ankle = this.tmpB;
    const d = this.tmpC;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const [side, foot] of [[1, pose.footLeft], [-1, pose.footRight]] as const) {
        hip.set(side * BODY.hipHalfWidth, -BODY.hipDrop, 0).applyQuaternion(pose.pelvisQuat).add(pose.pelvisPos);
        ankle.set(0, BODY.ankleHeight, -0.01).applyQuaternion(foot.quat).add(foot.pos);
        d.subVectors(ankle, hip);
        const dist = d.length();
        if (dist > LEG_REACH) {
          pose.pelvisPos.addScaledVector(d, (dist - LEG_REACH) / dist);
          moved = true;
        } else if (dist < LEG_MIN_REACH + 0.03) {
          pose.pelvisPos.addScaledVector(d, -(LEG_MIN_REACH + 0.03 - dist) / Math.max(dist, 1e-3));
          moved = true;
        }
      }
      if (!moved) break;
    }
  }

  /**
   * Alcance do grab: se o ombro está longe demais da borda, o corpo se ajusta
   * como um surfista de verdade (curva mais a coluna, gira o peito para o lado
   * da borda, inclina para o lado e desce o quadril encolhendo as pernas), por
   * busca coordenada nos limites anatômicos. O ajuste cresce com o grab.
   */
  private reachForGrab(target: THREE.Vector3, outSign: number, grab: number) {
    const pose = this.pose;
    const reach = (BODY.upperArm + BODY.forearm) * 0.93;
    const boardUp = this.tmpE.set(0, 1, 0).applyQuaternion(this.boardQuat);
    const pelvis0 = pose.pelvisPos.clone();
    const quat0 = pose.pelvisQuat.clone();
    // Direção, no plano do deck, da pelve até a borda: o quadril pode sentar para aquele lado.
    const toward = this.reachDir.subVectors(target, pose.pelvisPos);
    toward.addScaledVector(boardUp, -toward.dot(boardUp)).normalize();
    const start = { bend: pose.spineBend, twist: pose.chestTwist, side: pose.spineSide, drop: 0, shift: 0, yaw: 0 };
    // Começa da solução do quadro anterior (o ajuste muda pouco de um quadro para o outro).
    const prev = this.reachPrev;
    const p = prev ? { ...start, drop: prev.drop, shift: prev.shift, yaw: prev.yaw, bend: start.bend + prev.dBend, twist: start.twist + prev.dTwist, side: start.side + prev.dSide } : { ...start };
    const limits = { bend: [-0.2, 1.5], twist: [-0.9, 0.9], side: [-0.45, 0.45], drop: [0, 0.22], shift: [0, 0.12], yaw: [-0.6, 0.6] } as const;
    const shoulder = new THREE.Vector3();
    const yawQ = new THREE.Quaternion();
    const apply = () => {
      pose.spineBend = p.bend;
      pose.chestTwist = p.twist;
      pose.spineSide = p.side;
      pose.pelvisPos.copy(pelvis0).addScaledVector(boardUp, -p.drop).addScaledVector(toward, p.shift);
      // O quadril gira sobre os pés plantados.
      pose.pelvisQuat.copy(quat0).premultiply(yawQ.setFromAxisAngle(boardUp, p.yaw));
      this.constrainLegs();
    };
    const dist = () => {
      apply();
      shoulder.set(outSign * BODY.shoulderHalfWidth, 0.19, -0.005).applyMatrix4(this.chestMatrix(this.tmpM2));
      return shoulder.distanceTo(target);
    };
    let d = dist();
    const steps = { bend: 0.12, twist: 0.12, side: 0.08, drop: 0.03, shift: 0.03, yaw: 0.1 };
    for (let iter = 0; iter < 24 && d > reach; iter++) {
      let best: { k: keyof typeof p; v: number; d: number } | null = null;
      for (const k of Object.keys(steps) as (keyof typeof steps)[]) {
        for (const dir of [1, -1]) {
          const old = p[k];
          p[k] = THREE.MathUtils.clamp(old + dir * steps[k], limits[k][0], limits[k][1]);
          const nd = dist();
          if (nd < (best?.d ?? d) - 1e-4) best = { k, v: p[k], d: nd };
          p[k] = old;
        }
      }
      if (!best) break;
      p[best.k] = best.v;
      d = best.d;
    }
    const found = { drop: p.drop, shift: p.shift, yaw: p.yaw, dBend: p.bend - start.bend, dTwist: p.twist - start.twist, dSide: p.side - start.side };
    this.reachPrev = found;
    const sm = this.reachSmooth ?? (this.reachSmooth = { ...found });
    const k = 1 - Math.exp(-this.stepDt * 12);
    for (const key of Object.keys(found) as (keyof typeof found)[]) sm[key] += (found[key] - sm[key]) * k;
    // Aplica proporcional ao grab, para entrar e sair do grab sem salto.
    pose.spineBend = start.bend + sm.dBend * grab;
    pose.chestTwist = start.twist + sm.dTwist * grab;
    pose.spineSide = start.side + sm.dSide * grab;
    pose.pelvisPos.copy(pelvis0).addScaledVector(boardUp, -sm.drop * grab).addScaledVector(toward, sm.shift * grab);
    pose.pelvisQuat.copy(quat0).premultiply(yawQ.setFromAxisAngle(boardUp, sm.yaw * grab));
    this.constrainLegs();
    shoulder.set(outSign * BODY.shoulderHalfWidth, 0.19, -0.005).applyMatrix4(this.chestMatrix(this.tmpM2));
    this.grabReach = shoulder.distanceTo(target);
  }

  /** Mesma cadeia do rig (pelve → coluna → peito), para posicionar as mãos em relação aos ombros. */
  private chestMatrix(out: THREE.Matrix4): THREE.Matrix4 {
    const p = this.pose;
    const bend = THREE.MathUtils.clamp(p.spineBend, -0.4, 1.5);
    const twist = THREE.MathUtils.clamp(p.chestTwist, -0.9, 0.9);
    const side = THREE.MathUtils.clamp(p.spineSide, -0.45, 0.45);
    out.compose(p.pelvisPos, p.pelvisQuat, this.tmpA.set(1, 1, 1));
    const e = this.tmpEuler;
    const step = (y: number, rx: number, ry: number, rz: number) => {
      e.set(rx, ry, rz, 'XYZ');
      this.tmpM.compose(this.tmpB.set(0, y, 0), this.tmpQ.setFromEuler(e), this.tmpA.set(1, 1, 1));
      out.multiply(this.tmpM);
    };
    step(BODY.spine, bend * 0.45, twist * 0.4, side * 0.5);
    step(BODY.chest, bend * 0.55, twist * 0.6, side * 0.5);
    return out;
  }

  /** Posição do ombro (mundo) na pose atual: direita = braço da frente. Para testes e depuração. */
  shoulderWorld(side: 'left' | 'right', out = new THREE.Vector3()): THREE.Vector3 {
    const chest = this.chestMatrix(new THREE.Matrix4());
    return out.set((side === 'right' ? -1 : 1) * BODY.shoulderHalfWidth, 0.19, -0.005).applyMatrix4(chest);
  }

  private handFromShoulder(out: THREE.Vector3, chest: THREE.Matrix4, chestQ: THREE.Quaternion, outSign: number, o: number, u: number, f: number) {
    const shoulder = this.tmpA.set(outSign * BODY.shoulderHalfWidth, 0.19, -0.005).applyMatrix4(chest);
    // Braço sempre com o cotovelo um pouco dobrado (sem travar esticado).
    const v = this.tmpB.set(outSign * o, u, f);
    const max = (BODY.upperArm + BODY.forearm) * 0.93;
    if (v.length() > max) v.setLength(max);
    out.copy(v.applyQuaternion(chestQ)).add(shoulder);
  }

  /** Referências para a ferramenta de depuração. */
  private fillDebug(t: number, dt: number, b: BodyParams, grab: number) {
    const d = this.frame.debug;
    const an = this.anchors;
    const bd = this.board;
    const q = this.boardQuat;
    const p = this.boardPos;
    const toWorld = (out: THREE.Vector3, x: number, y: number, f: number) => stanceToBoard(out, x, y, f).applyQuaternion(q).add(p);
    toWorld(d.anchorFront, an.frontX, bd.deckY(an.frontX, 0), 0);
    toWorld(d.anchorBack, an.backX, bd.deckY(an.backX, 0), 0);
    const com = combinedCom(an.midX, bd.deckY(an.midX, 0), pelvisHeight(b, grab), b.lean);
    toWorld(d.com, com.x, com.y, 0);
    toWorld(d.contact, an.midX * 0.5, -bd.shape.thickness * 0.3, 0);
    if (dt > 0) {
      const vel = this.tmpA.subVectors(d.com, this.prevCom).divideScalar(dt);
      if (this.hasPrev) d.accel.subVectors(vel, this.prevVel).divideScalar(dt).clampLength(0, 40);
      d.velocity.copy(vel);
      this.prevVel.copy(vel);
      this.hasPrev = true;
    }
    this.prevCom.copy(d.com);
    d.spinAxis.copy(this.spinAxisNow);
    const w = this.waveAt(t);
    const n = surfaceNormal(w, p.x, p.z);
    d.waveNormal.set(n.x, n.y, n.z);
    const cz = crestOffset(w, p.x);
    d.lip.set(p.x, surfaceHeight(w, p.x, cz), cz);
    d.zone = this.zone;
    d.state = this.stateLabel;
    d.shoulders = this.shoulderAngle;
    d.hips = this.hipAngle;
    d.board = this.boardAngle;
    d.roll = THREE.MathUtils.radToDeg(-this.roll);
  }

  /**
   * Remada e levantar: mistura a pose em pé com o corpo deitado na prancha.
   * amount = 1 deitado; durante o drop o valor cai e o corpo se levanta: primeiro
   * as mãos empurram o deck e o peito sobe, depois as pernas passam por baixo e
   * os pés chegam à base.
   */
  private blendProne(amount: number, t: number, paddling: boolean) {
    const bd = this.board;
    const pose = this.pose;
    const boardPos = this.boardPos;
    const boardQuat = this.boardQuat;
    const deck = bd.deckY(0, 0);
    const toWorld = (out: THREE.Vector3, x: number, y: number, z: number) => out.set(x, y, z).applyQuaternion(boardQuat).add(boardPos);
    const hw = bd.halfWidth(0.6);
    const u = 1 - amount; // 0 deitado, 1 em pé

    // Corpo deitado: coluna apontando para o bico, peito para baixo, cabeça levantada.
    const proneQ = this.tmpQ.setFromRotationMatrix(this.tmpM.makeBasis(
      this.tmpA.set(0, 0, -1), this.tmpB.set(1, 0, 0), this.tmpC.set(0, -1, 0),
    ));
    const pelvisProne = toWorld(new THREE.Vector3(), -0.32, deck + 0.11, 0);
    // Na primeira metade do levantar o peito sobe (o quadril quase não sai do lugar).
    const chestUp = smooth(u / 0.45);
    const prone = new THREE.Quaternion().copy(boardQuat).multiply(proneQ)
      .multiply(this.tmpQ2.setFromAxisAngle(X_AXIS, -0.5 * chestUp));
    const k = smooth((u - 0.25) / 0.75);
    pose.pelvisPos.lerpVectors(pelvisProne, pose.pelvisPos, k);
    // slerp a partir de uma cópia: o destino não pode ser o próprio quaternion de saída.
    pose.pelvisQuat.copy(prone.slerp(this.tmpQ3.copy(pose.pelvisQuat), k));
    pose.spineBend = THREE.MathUtils.lerp(-0.35 - 0.2 * chestUp, pose.spineBend, k);
    pose.headPitch = THREE.MathUtils.lerp(-0.75, pose.headPitch, k);
    pose.chestTwist *= k;
    pose.headYaw *= k;

    // Pés: deitados lado a lado na rabeta, depois sobem num arco até a base.
    const kf = smooth((u - 0.4) / 0.55);
    const lift = Math.sin(kf * Math.PI) * 0.22;
    for (const [foot, z] of [[pose.footLeft, -0.07], [pose.footRight, 0.07]] as const) {
      const lying = toWorld(new THREE.Vector3(), -0.78, deck + 0.05, z);
      foot.pos.lerpVectors(lying, foot.pos, kf);
      foot.pos.addScaledVector(this.tmpD.set(0, 1, 0).applyQuaternion(boardQuat), lift);
      const toesBack = new THREE.Quaternion().copy(boardQuat).multiply(proneQ).multiply(this.tmpQ2.setFromAxisAngle(X_AXIS, Math.PI / 2));
      foot.quat.copy(toesBack.slerp(this.tmpQ3.copy(foot.quat), kf));
    }

    // Mãos: remando pelos lados da prancha; no drop, empurram o deck e depois soltam.
    const kh = smooth((u - 0.55) / 0.45);
    for (const [hand, side, phaseOff] of [[pose.handLeft, -1, 0], [pose.handRight, 1, Math.PI]] as const) {
      let target: THREE.Vector3;
      if (paddling) {
        // Braçada: entra na água perto do bico, puxa até o quadril e volta por cima.
        const ph = t * 5.4 + phaseOff;
        const stroke = Math.sin(ph);
        const underwater = Math.cos(ph) > 0;
        target = toWorld(new THREE.Vector3(), 0.12 + 0.32 * stroke, deck + (underwater ? -0.16 : 0.14), side * (hw + 0.1));
      } else {
        target = toWorld(new THREE.Vector3(), 0.02, deck + 0.02, side * 0.16);
      }
      hand.lerpVectors(target, hand, kh);
    }
    const grip = 0.25;
    pose.gripLeft = THREE.MathUtils.lerp(grip, pose.gripLeft, kh);
    pose.gripRight = THREE.MathUtils.lerp(grip, pose.gripRight, kh);
    const down = this.tmpA.set(0, -1, 0).applyQuaternion(boardQuat);
    pose.kneePoleLeft.lerpVectors(down, pose.kneePoleLeft, k).normalize();
    pose.kneePoleRight.lerpVectors(down, pose.kneePoleRight, k).normalize();
    const upB = this.tmpA.set(0, 1, 0).applyQuaternion(boardQuat);
    pose.elbowPoleLeft.lerpVectors(upB, pose.elbowPoleLeft, k).normalize();
    pose.elbowPoleRight.lerpVectors(upB, pose.elbowPoleRight, k).normalize();
  }

  /** Começa a queda a partir do movimento atual: pouso ruim (velocidade do toque) ou a onda fechando. */
  private startFall(t: number) {
    const run = this.run;
    const pos = this.boardPos.clone();
    const L = run.lastLanding;
    const vel = run.fallCause === 'pouso' && L ? new THREE.Vector3(L.vel.x, Math.max(-2, L.vel.y * 0.3), L.vel.z) : new THREE.Vector3(run.speed * 0.6, 1.2, 0.6);
    this.fallStart = { t, pos, vel, boardQuat: this.boardQuat.clone(), spinAxis: new THREE.Vector3(0.3, 0.2, -1).normalize(), splashed: false, slapped: false };
  }

  /** Queda: corpo e prancha se separam, rolam e afundam na espuma. */
  private fallFrame(t: number, dt: number, events: SprayEvent[]): AnimFrame {
    const f = this.fallStart!;
    const tf = t - f.t;
    const w = this.waveAt(t);
    if (tf < dt * 1.5) events.push({ kind: 'fall', pos: f.pos.clone(), dir: f.vel.clone().normalize(), strength: 1.4 });
    // Prancha: quica e desliza, girando sobre si mesma.
    const bx = f.pos.x + f.vel.x * 0.55 * tf;
    const bz = f.pos.z + 0.6 * tf;
    const water = surfaceHeight(w, bx, bz);
    const hop = Math.max(0, 0.35 * Math.sin(Math.min(tf / 0.5, 1) * Math.PI));
    this.boardPos.set(bx, water + 0.04 + hop, bz);
    this.boardQuat.copy(f.boardQuat).multiply(this.tmpQ.setFromAxisAngle(this.tmpA.set(1, 0, 0.3).normalize(), tf * 7 * Math.exp(-tf * 1.2)));
    if (!f.slapped && tf > 0.5) {
      f.slapped = true;
      events.push({ kind: 'boardSlap', pos: this.boardPos.clone(), dir: new THREE.Vector3(0, 1, 0.2), strength: 0.8 });
    }
    // Corpo: segue a inércia, cai e afunda.
    const px = f.pos.x + f.vel.x * 0.6 * tf;
    const pz = f.pos.z + 0.9 * tf;
    const pw = surfaceHeight(w, px, pz);
    const drop = f.pos.y + 0.9 + Math.max(-1, f.vel.y) * tf - 4.9 * tf * tf;
    const py = Math.max(pw - 0.55 * smooth((tf - 0.35) / 0.8), drop);
    if (!f.splashed && drop <= pw + 0.2) {
      f.splashed = true;
      events.push({ kind: 'bodySplash', pos: new THREE.Vector3(px, pw, pz), dir: new THREE.Vector3(0, 1, 0.3), strength: 2 });
    }
    const pose = this.pose;
    pose.pelvisQuat.setFromAxisAngle(f.spinAxis, -tf * 5.5 * Math.exp(-tf * 0.9))
      .multiply(this.tmpQ.setFromAxisAngle(UP, -THREE.MathUtils.degToRad(this.boardAngle) + STANCE_YAW));
    pose.pelvisPos.set(px, py, pz);
    const rel = (out: THREE.Vector3, x: number, y: number, z: number) => out.set(x, y, z).applyQuaternion(pose.pelvisQuat).add(pose.pelvisPos);
    const flail = Math.sin(tf * 11) * Math.exp(-tf * 0.8);
    pose.spineBend = 0.5;
    pose.chestTwist = 0.4 * flail;
    pose.spineSide = 0.3;
    pose.headPitch = -0.3;
    pose.headYaw = 0.3;
    rel(pose.footLeft.pos, 0.18, -0.62, 0.32);
    rel(pose.footRight.pos, -0.16, -0.7, 0.12 + 0.1 * flail);
    pose.footLeft.quat.copy(pose.pelvisQuat);
    pose.footRight.quat.copy(pose.pelvisQuat);
    rel(pose.handLeft, 0.5, 0.75 + 0.15 * flail, 0.2);
    rel(pose.handRight, -0.45, 0.65 - 0.15 * flail, 0.35);
    pose.gripLeft = 0.1;
    pose.gripRight = 0.1;
    pose.kneePoleLeft.set(0, 0.2, 1).applyQuaternion(pose.pelvisQuat);
    pose.kneePoleRight.copy(pose.kneePoleLeft);
    pose.elbowPoleLeft.set(0, -1, -0.5).applyQuaternion(pose.pelvisQuat);
    pose.elbowPoleRight.copy(pose.elbowPoleLeft);
    const fr = this.frame;
    fr.events = events;
    fr.phase = 'aterrissagem';
    fr.airborne = false;
    fr.falling = true;
    fr.heightAboveWater = Math.max(0, py - pw);
    fr.bodyBoardLag = 0;
    fr.speed = 2;
    this.stateLabel = 'queda · corpo e prancha separados';
    this.fillDebug(t, dt, POSES.instavel, 0);
    return fr;
  }
}
