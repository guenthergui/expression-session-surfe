import * as THREE from 'three';
import { choreoFor, GRAB_CONTACT, type Choreo } from '../anim/choreography';
import { blendPoses, landingKeys, POSES, sampleSequence, type BodyParams, type Keyframe } from '../anim/poses';
import { DRIVE_AFTER, Follower, SpinCurve, spinInertia } from '../anim/rotation';
import { BODY, LEG_MIN_REACH, LEG_REACH, combinedCom, deckAnchors, deckSlope, faceZone, type DeckAnchors, type FaceZone } from '../anim/stance';
import type { AirPhase, Judgement, Maneuver, Outcome } from '../core/types';
import { GRAVITY, RIDE_OUT_TIME, airPosition, airVelocity, rideOutPosition, type AerialPlan, type Vec3 } from '../sim/aerial';
import { crestOffset, faceWidth, surfaceHeight, surfaceNormal, type WaveState } from '../sim/waveField';
import type { WaveRun } from '../sim/waveRun';
import type { WorldPose } from '../render/SurferRig';

// Animação da onda inteira, conduzida pelo tempo (nunca por quadros) e pelo
// estado real do jogo. É um sistema híbrido:
//   - física simplificada: a linha na face vem de src/sim/waveRun.ts (troca de
//     energia, curva com inclinação de equilíbrio) e o voo é balístico;
//   - coreografia por manobra (anim/choreography.ts): poses-chave próprias de
//     cada aéreo, interpoladas no tempo;
//   - giro em cadeia: os ombros lideram, o quadril segue por uma mola e a
//     prancha segue o quadril; a velocidade angular depende da inércia do corpo
//     (braços abertos giram mais devagar, encolhido gira mais rápido);
//   - contato: os pés ficam presos às âncoras do deck (pé de trás em cima das
//     quilhas), a pelve se ajusta para as pernas sempre alcançarem o deck, e o
//     rig resolve pernas e braços por cinemática inversa de dois ossos.
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
  /** Giro (graus) dos ombros, do quadril e da prancha. */
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
  events: SprayEvent[];
  debug: MotionDebug;
}

/** O que o animador precisa saber da prancha, sem depender do Three.js da cena. */
export interface BoardShapeInfo {
  shape: { length: number; width: number; thickness: number };
  deckY(x: number, z: number): number;
  halfWidth(u: number): number;
}

export interface TrackView {
  steps: Maneuver['sequence'];
  results: (Judgement | null)[];
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
/** Diferença máxima de giro entre ombros e quadril, e entre quadril e prancha (graus). */
const MAX_SHOULDER_HIP = 45;
const MAX_HIP_BOARD = 50;
/** Saída pela rabeta: ângulo máximo do bico (rad), tempo até ele, tempo para nivelar e tempo com a rabeta na água (s). */
const POP_PEAK = 0.4;
const POP_RISE = 0.09;
const POP_SETTLE = 0.24;
const TAIL_HOLD = 0.11;
/** Partes do corpo com movimento secundário no ar. */
const SECONDARY_KEYS: (keyof BodyParams)[] = ['faOut', 'faUp', 'faFwd', 'baOut', 'baUp', 'baFwd', 'headYaw', 'headPitch', 'twist'];

function smooth(u: number): number {
  const t = Math.min(1, Math.max(0, u));
  return t * t * (3 - 2 * t);
}

function setV(out: THREE.Vector3, p: Vec3): THREE.Vector3 {
  return out.set(p.x, p.y, p.z);
}

function hit(j: Judgement | null | undefined): boolean {
  return j === 'perfect' || j === 'good' || j === 'late';
}

/** Altura da pelve sobre o deck para uma pose. */
export function pelvisHeight(b: BodyParams, grab: number): number {
  return 0.84 - 0.27 * b.crouch - 0.38 * b.tuck - 0.06 * grab;
}

/** Converte o referencial de base (x bico, y cima, f frente do corpo) para a prancha. */
function stanceToBoard(out: THREE.Vector3, x: number, y: number, f: number): THREE.Vector3 {
  return out.set(x, y, -f);
}

export class AerialAnimator {
  readonly choreo: Choreo;
  readonly anchors: DeckAnchors;
  /** Giro (graus, sempre positivo; o sentido vem de choreo.spinSign) dos ombros, do quadril e da prancha. */
  private shoulderAngle = 0;
  private readonly hips = new Follower(520);
  private readonly boardSpin = new Follower(260);
  private hipAngVel = 0;
  private lastHipAngle = 0;
  private spins: { index: number; curve: SpinCurve }[] = [];
  private fallStart: { t: number; pos: THREE.Vector3; vel: THREE.Vector3; boardQuat: THREE.Quaternion; spinAxis: THREE.Vector3; splashed: boolean; slapped: boolean } | null = null;
  private launched = false;
  private landed = false;
  private landingAngle = 0;
  /** Instante (tempo de onda) da decolagem e do pouso; definidos em beginAir. */
  takeoffT = Infinity;
  airEnd = Infinity;
  totalTime = Infinity;
  plan: AerialPlan | null = null;
  private air: Keyframe[] = [];
  private landingSeq: Keyframe[] | null = null;
  private moveStart = 0;
  private moveEnd = 0;
  private grabIndex: number;
  private track: TrackView;
  private smoothedBody: BodyParams = { ...POSES.base };
  /** Pose e orientação da prancha no último quadro na água, para a decolagem sair delas sem salto. */
  private rideBody: BodyParams = { ...POSES.base };
  private readonly launchQuat = new THREE.Quaternion();
  /** Deslocamento horizontal do centro de massa até a origem da prancha na decolagem. */
  private readonly comOffset = new THREE.Vector3();
  private lastPhase: AirPhase = 'remada';
  private dropSprayed = false;
  private compressing = false;
  /** Distância ombro–borda depois do ajuste do grab (m), para a depuração. */
  grabReach = 0;
  private reachPrev: { drop: number; shift: number; yaw: number; dBend: number; dTwist: number; dSide: number } | null = null;
  /** Ajuste do grab aplicado no corpo: segue a busca com suavização, para os passos dela não virarem trancos. */
  private reachSmooth: { drop: number; shift: number; yaw: number; dBend: number; dTwist: number; dSide: number } | null = null;
  private stepDt = 1 / 60;
  private impactDepth = 0.8;
  private stateLabel = '';
  private zone: FaceZone | null = null;
  private roll = 0;
  private hasPrev = false;
  private readonly prevCom = new THREE.Vector3();
  private readonly prevVel = new THREE.Vector3();

  // Objetos reaproveitados a cada quadro (sem alocar no laço principal).
  private readonly boardPos = new THREE.Vector3();
  private readonly boardQuat = new THREE.Quaternion();
  /**
   * Referencial do corpo: igual ao da prancha na água, mas no ar e na saída
   * da rabeta ele não segue toda a inclinação da prancha. As pernas absorvem
   * a diferença (os pés continuam presos ao deck), como num surfista de verdade.
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
    readonly maneuver: Maneuver,
    readonly wave: WaveState,
    readonly board: BoardShapeInfo,
    readonly run: WaveRun,
  ) {
    this.choreo = choreoFor(maneuver);
    this.anchors = deckAnchors(board.shape.length);
    this.grabIndex = maneuver.sequence.findIndex((s) => s.phase === 'grab');
    this.track = { steps: maneuver.sequence, results: maneuver.sequence.map(() => null) };
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
      events: [],
      debug: {
        state: '', choreo: this.choreo.label, zone: null,
        anchorFront: v(), anchorBack: v(), com: v(), contact: v(), velocity: v(), accel: v(),
        spinAxis: v(), waveNormal: v(), lip: v(), shoulders: 0, hips: 0, board: 0, roll: 0,
      },
    };
  }

  /** Sentido do giro no mundo: −1 frontside, +1 backside (ver anim/choreography.ts). */
  private get spinSign(): number {
    return this.choreo.spinSign || (this.maneuver.direction === 'backside' ? 1 : -1);
  }

  /** Começa o voo: chamado no instante em que a decolagem é aceita. */
  beginAir(plan: AerialPlan, track: TrackView) {
    this.plan = plan;
    this.track = track;
    this.takeoffT = plan.launchTime;
    this.airEnd = plan.launchTime + plan.airTime;
    this.totalTime = this.airEnd + RIDE_OUT_TIME;
    const seq = this.maneuver.sequence;
    const moves = seq.filter((s) => s.phase === 'rotacao' || s.phase === 'grab').map((s) => s.time);
    this.moveStart = moves.length ? Math.min(...moves) : plan.airTime * 0.4;
    this.moveEnd = moves.length ? Math.max(...moves) : plan.airTime * 0.5;
    const grabAt = this.grabIndex >= 0 ? seq[this.grabIndex].time : 0;
    this.air = this.choreo.keys(plan.airTime, this.moveStart, this.moveEnd, this.maneuver.grab, grabAt);
    // A inércia em cada instante vem da própria coreografia (braços e pernas).
    const inertia = (t: number) => {
      const b = sampleSequence(this.air, t);
      const spread = Math.max(Math.hypot(b.faOut, b.faFwd * 0.5), Math.hypot(b.baOut, b.baFwd * 0.5)) / 0.5;
      return spinInertia(spread, b.tuck);
    };
    this.spins = seq.map((s, index) => ({ s, index })).filter((x) => x.s.phase === 'rotacao')
      .map(({ s, index }) => ({ index, curve: new SpinCurve(s.time, inertia) }));
    // Sai da orientação da água sem o pivô na rabeta, que continua no ar a partir do mesmo ângulo.
    this.launchQuat.copy(this.rideQuatNoPop);
    this.popAtLaunch = this.popPitch;
    this.tailPoint(this.tailAtLaunch, setV(this.tmpD, plan.launch), this.launchQuat);
    this.tailReleased = false;
    this.secondary.clear();
    this.rideBody = { ...this.smoothedBody };
    // O giro acontece em volta do centro de massa combinado, que fica entre os pés (atrás do centro da prancha).
    const com = combinedCom(this.anchors.midX, this.board.deckY(0, 0), H_TAKEOFF, 0);
    this.comOffset.set(-com.x, 0, 0).applyQuaternion(this.boardQuat).setY(0);
    this.hips.reset(0);
    this.boardSpin.reset(0);
    // Força do impacto no pouso: velocidade vertical na chegada à água.
    const vyLand = plan.velocity.y - GRAVITY * plan.airTime;
    this.impactDepth = THREE.MathUtils.clamp(-vyLand / 8, 0.3, 1);
  }

  /** Troca o plano de voo sem mudar o instante da decolagem (ajuste fino). */
  replan(plan: AerialPlan) {
    this.plan = plan;
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

  /** Giro alvo (graus) no tempo de voo t: cada comando de rotação certo (ou ainda por vir) soma 180°; Late gira 150°. */
  private rotationTarget(tAir: number): number {
    let target = 0;
    for (const { index, curve } of this.spins) {
      const r = this.track.results[index];
      if (r === 'miss') continue;
      target += (r === 'late' ? 150 : 180) * curve.at(tAir);
    }
    return target;
  }

  grabAmount(tAir: number, airTime: number): number {
    const gi = this.grabIndex;
    if (gi < 0) return 0;
    const r = this.track.results[gi];
    if (r === 'miss') return 0;
    const gt = this.track.steps[gi].time;
    const hold = r === null || hit(r) ? 1 : 0;
    // A mão chega à borda e só solta a tempo de preparar o pouso.
    return hold * smooth((tAir - (gt - 0.12)) / 0.16) * (1 - smooth((tAir - (airTime - 0.3)) / 0.16));
  }

  /** Suaviza a pose do surf (sem saltos quando o estado muda, por exemplo ao soltar W). */
  private ease(target: BodyParams, dt: number, rate = 8): BodyParams {
    const k = 1 - Math.exp(-dt * rate);
    const s = this.smoothedBody;
    for (const key of Object.keys(target) as (keyof BodyParams)[]) s[key] += (target[key] - s[key]) * k;
    return { ...s };
  }

  update(t: number, dt: number, outcome: Outcome | null): AnimFrame {
    this.stepDt = dt;
    const events: SprayEvent[] = [];
    this.frame.events = events;
    const run = this.run;
    this.popPitch = 0;
    let phase: AirPhase;
    let airborne = false;
    let body: BodyParams;
    let grab = 0;
    let windmill = 0;
    let prone = 0; // 1 deitado, 0 em pé
    let hipYaw = 0;
    let chestYaw = 0;
    const boardPos = this.boardPos;
    const boardQuat = this.boardQuat;
    this.zone = null;

    if (run.state === 'fallen' && !this.fallStart) this.startFallFromRide(t);
    if (outcome === 'queda' && !this.fallStart && this.plan && t >= this.airEnd - 0.02) this.startFall(t);
    if (this.fallStart) return this.fallFrame(t, dt, events);

    const plan = this.plan;
    if (!plan || t < this.takeoffT) {
      // Antes da decolagem: remada, drop e surf, seguindo a máquina de estados.
      const w = this.waveAt(t);
      setV(boardPos, run.position());
      const v = run.velocity();
      const vel = this.tmpD.set(v.x, 0, v.z);
      const next = this.tmpE.copy(boardPos).addScaledVector(vel, 0.05);
      const lat = run.lateralAccel();
      // Inclinação de equilíbrio da curva: atan(a/g). Negativa = borda dos dedos.
      // A borda entra na água progressivamente (sem trocar de inclinação de uma vez).
      const rollTarget = run.state === 'riding' ? THREE.MathUtils.clamp(Math.atan2(lat, GRAVITY) * 0.9, -0.8, 0.8) : 0;
      this.roll += (rollTarget - this.roll) * (1 - Math.exp(-dt * 7));
      this.rideQuat(boardQuat, boardPos, next, w, this.roll);
      const up = run.standing;
      prone = 1 - smooth(up);
      const fromCrest = boardPos.z - crestOffset(w, boardPos.x);
      this.zone = faceZone(fromCrest, faceWidth(w));
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
        // Na aproximação do lip a compressão é rápida (cerca de 0,25 s).
        body = this.ease(this.ridingTarget(t, lat), dt, this.compressing ? 16 : 8);
        phase = run.accelerating ? 'aceleracao' : 'surf';
        if (Math.random() < dt * (12 + run.speed * 3)) {
          events.push({ kind: 'carve', pos: boardPos.clone(), dir: vel.clone().normalize(), strength: 0.25 + Math.abs(this.roll) * 1.4 + run.speedFactor * 0.6 });
        }
      }
      this.rideBody = { ...body };
      this.rideQuatNoPop.copy(boardQuat);
    } else if (t < this.airEnd) {
      // Voo: o centro de massa segue a balística.
      airborne = true;
      const tAir = t - this.takeoffT;
      const T = plan.airTime;
      if (!this.launched) {
        this.launched = true;
        const dir = setV(new THREE.Vector3(), plan.velocity).normalize();
        events.push({ kind: 'launch', pos: setV(new THREE.Vector3(), plan.launch), dir, strength: 0.8 + plan.velocity.y / 8 });
      }
      const vel = setV(this.tmpE, airVelocity(plan, tAir));

      // Giro em cadeia: ombros → quadril → prancha.
      const lead = this.choreo.shoulderLead;
      this.shoulderAngle = this.rotationTarget(tAir + lead);
      const hips = this.hips.update(this.rotationTarget(tAir), dt);
      const hipsC = THREE.MathUtils.clamp(hips, this.shoulderAngle - MAX_SHOULDER_HIP, this.shoulderAngle + MAX_SHOULDER_HIP);
      if (hipsC !== hips) this.hips.value = hipsC;
      this.boardSpin.update(this.hips.value, dt);
      const diff = this.hips.value - this.boardSpin.value;
      if (Math.abs(diff) > MAX_HIP_BOARD) this.boardSpin.value = this.hips.value - Math.sign(diff) * MAX_HIP_BOARD;
      this.hipAngVel = dt > 0 ? (this.hips.value - this.lastHipAngle) / dt : this.hipAngVel;
      this.lastHipAngle = this.hips.value;

      // Pose da coreografia, saindo da pose que o corpo tinha na água.
      body = sampleSequence(this.air, tAir);
      if (tAir < TAKEOFF_BLEND) body = blendPoses(this.rideBody, body, tAir / TAKEOFF_BLEND);
      grab = this.grabAmount(tAir, T);
      if (this.grabIndex >= 0 && this.track.results[this.grabIndex] === 'miss') body = blendPoses(body, POSES.arNeutro, 0.6);
      // Sem os comandos de giro, a coreografia não força a rotação: o corpo fica num aéreo neutro.
      if (this.spins.length && this.spins.every((s) => this.track.results[s.index] === 'miss')) body = blendPoses(body, POSES.arNeutro, 0.7);
      this.smoothedBody = { ...body };
      body = this.followThrough(body, dt);
      const s = this.spinSign;
      hipYaw = THREE.MathUtils.degToRad(this.hips.value - this.boardSpin.value) * s;
      chestYaw = THREE.MathUtils.degToRad(this.shoulderAngle - this.hips.value) * s;

      // Orientação: direção do voo, bico acompanhando a trajetória, e os ajustes da manobra.
      // O corpo recebe só parte da inclinação e dos ajustes da prancha (as pernas absorvem o resto).
      const x0 = this.tmpA.set(vel.x, 0, vel.z).normalize();
      const z0 = this.tmpB.crossVectors(x0, UP).normalize();
      const flightPitch = Math.atan2(vel.y, Math.hypot(vel.x, vel.z)) * 0.55;
      const pitch = flightPitch + body.tweakPitch + body.legSplit * 0.22;
      const tweakRoll = body.tweakRoll * (this.maneuver.grab ? 0.5 + 0.5 * grab : 1);
      const ang = THREE.MathUtils.degToRad(this.boardSpin.value) * s;
      const spinAxis = this.spinAxisWorld(this.tmpC, x0).clone();
      const basis = new THREE.Quaternion().setFromRotationMatrix(this.tmpM.makeBasis(x0, UP, z0));
      const toLand = T - tAir;
      const orient = (out: THREE.Quaternion, p: number, r: number) => {
        out.copy(basis).multiply(this.tmpQ2.setFromAxisAngle(Z_AXIS, p)).multiply(this.tmpQ2.setFromAxisAngle(X_AXIS, r));
        out.premultiply(this.tmpQ2.setFromAxisAngle(spinAxis, ang));
        // Saindo da água: passa da orientação na face para a do voo sem salto.
        if (tAir < TAKEOFF_BLEND) out.slerpQuaternions(this.launchQuat, this.tmpQ3.copy(out), smooth(tAir / TAKEOFF_BLEND));
        // Chegando na água: alinha com a face, mantendo o giro feito.
        if (toLand < LANDING_ALIGN) {
          const w = this.waveAt(this.airEnd);
          const land = setV(new THREE.Vector3(), plan.landing);
          const after = setV(new THREE.Vector3(), rideOutPosition(plan, w, 0.05, this.airEnd + 0.05));
          const ride = this.rideQuat(this.tmpQ3, land, after, w, 0);
          if (this.maneuver.axis !== 'flip') ride.premultiply(this.tmpQ2.setFromAxisAngle(UP, ang));
          out.slerp(ride, smooth(1 - toLand / LANDING_ALIGN));
        }
        return out;
      };
      orient(boardQuat, pitch, tweakRoll);
      orient(this.bodyQuat, flightPitch + (pitch - flightPitch) * 0.35, tweakRoll * 0.35);

      // Posição: centro de massa na balística; a prancha gira em volta dele.
      setV(boardPos, airPosition(plan, tAir));
      const orbit = this.tmpA.copy(this.comOffset).applyAxisAngle(UP, this.maneuver.axis === 'flip' ? 0 : ang).sub(this.comOffset);
      const env = smooth(tAir / 0.12) * (1 - smooth((tAir - (T - 0.35)) / 0.33));
      boardPos.addScaledVector(orbit, env);
      // Encolher as pernas puxa a prancha para cima, em direção ao corpo.
      const h = pelvisHeight(body, grab);
      const lift = THREE.MathUtils.clamp(H_TAKEOFF - h, -0.25, 0.4) * smooth(tAir / 0.12) * (1 - smooth((tAir - (T - 0.16)) / 0.16));
      boardPos.addScaledVector(this.tmpA.set(0, 1, 0).applyQuaternion(boardQuat), lift);
      this.bodyPos.copy(boardPos);

      // Saída pela rabeta: o pé de trás empurra a rabeta contra o lip e o bico sobe primeiro,
      // com a prancha girando em volta da rabeta, que ainda toca a água. Quando a rabeta solta,
      // os joelhos sobem e trazem a prancha para baixo do corpo, nivelando o bico.
      const rise = this.popAtLaunch + (POP_PEAK - this.popAtLaunch) * Math.sin((Math.PI / 2) * Math.min(1, tAir / POP_RISE));
      const pop = rise * (1 - smooth((tAir - POP_RISE) / POP_SETTLE));
      const hold = 1 - smooth(tAir / TAIL_HOLD);
      if (pop > 1e-4 || hold > 1e-4) {
        const lv = plan.velocity;
        const tailTarget = this.tmpD.copy(this.tailAtLaunch).add(this.tmpE.set(lv.x * tAir, lv.y * tAir * 0.45, lv.z * tAir));
        this.pivotOnTail(pop, hold, tailTarget);
      }
      if (!this.tailReleased && hold < 0.15) {
        this.tailReleased = true;
        const tail = this.tailPoint(new THREE.Vector3(), boardPos, boardQuat);
        events.push({ kind: 'launch', pos: tail, dir: new THREE.Vector3(-0.3, 1, 0.2).normalize(), strength: 0.45 });
      }

      const apexT = plan.velocity.y / GRAVITY;
      const lastSpin = this.spins.length ? Math.max(...this.spins.map((x) => x.curve.time)) + DRIVE_AFTER : 0;
      const inMove = Math.abs(this.hipAngVel) > 90 || grab > 0.1 || (tAir >= this.moveStart - 0.2 && tAir <= Math.max(this.moveEnd + 0.25, lastSpin));
      phase = tAir < TAIL_HOLD + 0.04 ? 'decolagem' : toLand < 0.25 ? 'aterrissagem' : inMove ? 'manobra' : tAir < apexT ? 'subida' : 'descida';
      this.stateLabel = `${{ decolagem: hold > 0.15 ? 'decolagem · prancha na rabeta' : 'decolagem · rabeta soltou, extensão', aterrissagem: 'reorientando para o pouso', manobra: grab > 0.1 ? 'manobra · grab' : 'manobra · giro', subida: 'subida', descida: 'descida' }[phase as 'decolagem']}`;
      this.roll = tweakRoll;
    } else {
      // Pouso e saída
      const tOut = t - this.airEnd;
      const w = this.waveAt(t);
      const unstable = outcome === 'instavel';
      if (!this.landed) {
        this.landed = true;
        this.landingAngle = this.boardSpin.value;
        events.push({ kind: 'land', pos: setV(new THREE.Vector3(), plan.landing), dir: new THREE.Vector3(1, 0.4, -0.3).normalize(), strength: unstable ? 1.6 : 1.1 + this.impactDepth * 0.4, outcome: outcome ?? undefined });
      }
      if (outcome && outcome !== 'queda' && !this.landingSeq) this.landingSeq = landingKeys(outcome, this.impactDepth);
      // Pouso instável perde mais velocidade na água.
      const keep = unstable ? 0.72 : 0.85;
      setV(boardPos, rideOutPosition(plan, w, tOut, t, keep));
      const next = setV(this.tmpE, rideOutPosition(plan, this.waveAt(t + 0.05), tOut + 0.05, t + 0.05, keep));
      const wobble = unstable ? Math.sin(tOut * 16) * 0.22 * Math.max(0, 1 - tOut / 1.2) : 0;
      // Descendo a face depois do pouso: curva para os calcanhares.
      this.roll = 0.35 * Math.sin(smooth(tOut / 1.2) * Math.PI) + wobble;
      const ride = this.rideQuat(this.tmpQ3, boardPos, next.clone(), w, this.roll);
      // Rotações de 180 e 540 pousam de costas (fakie) e completam o giro na água,
      // voltando à base normal (costas para a câmera) sem virar de uma vez.
      const s = this.spinSign;
      let yaw = THREE.MathUtils.degToRad(this.landingAngle) * s;
      const rem = ((this.landingAngle % 360) + 360) % 360;
      if (this.maneuver.axis !== 'flip' && rem > 90 && rem < 270) {
        yaw = THREE.MathUtils.degToRad(this.landingAngle + (360 - rem) * smooth(tOut / 0.7)) * s;
      } else if (rem > 1 && rem <= 90) {
        // Giro incompleto: a prancha entra desalinhada e o surfista corrige na água.
        yaw = THREE.MathUtils.degToRad(this.landingAngle - rem * smooth(tOut / 0.6)) * s;
      }
      // Pouso instável: a rabeta escorrega e volta.
      if (unstable) yaw += 0.22 * Math.sin(tOut * 7) * Math.exp(-tOut * 2.2);
      boardQuat.copy(ride);
      if (this.maneuver.axis !== 'flip') boardQuat.premultiply(this.tmpQ2.setFromAxisAngle(UP, yaw));
      body = sampleSequence(this.landingSeq ?? landingKeys('concluida', this.impactDepth), tOut);
      // O quadril termina o giro que ficou atrasado em relação à prancha.
      hipYaw = THREE.MathUtils.degToRad(this.hips.value - this.landingAngle) * s * (1 - smooth(tOut / 0.3));
      windmill = unstable ? tOut * 9 : 0;
      phase = tOut < 0.35 ? 'aterrissagem' : 'saida';
      this.stateLabel = tOut < 0.35 ? `pouso · absorção (${Math.round(this.impactDepth * 100)}%)` : unstable ? 'saída · recuperando o equilíbrio' : 'saída';
      if (Math.random() < dt * 30) events.push({ kind: 'carve', pos: boardPos.clone(), dir: next.clone().sub(boardPos).normalize(), strength: 0.6 + Math.abs(this.roll) });
    }

    if (!airborne) {
      this.bodyPos.copy(boardPos);
      this.bodyQuat.copy(boardQuat);
      // Chegando ao lip, o pé de trás carrega a rabeta e o bico sobe: o corpo não inclina junto.
      if (this.popPitch > 0) this.pivotOnTail(this.popPitch, 0, null);
    }
    this.boardPose(body, grab, windmill, hipYaw, chestYaw);
    if (prone > 0) this.blendProne(prone, t, run.state === 'paddling');
    const water = surfaceHeight(this.waveAt(t), boardPos.x, boardPos.z);
    const f = this.frame;
    f.phase = phase;
    this.lastPhase = phase;
    f.airborne = airborne;
    f.falling = false;
    f.heightAboveWater = boardPos.y - water;
    f.bodyBoardLag = this.hips.value - this.boardSpin.value;
    f.speed = plan && t >= this.takeoffT ? plan.speed : run.groundSpeed;
    this.fillDebug(t, dt, body, grab);
    return f;
  }

  /**
   * Pose surfando: base, bottom turn na borda dos dedos, subida da face,
   * topo na borda dos calcanhares e compressão chegando ao lip.
   */
  private ridingTarget(t: number, lat: number): BodyParams {
    const run = this.run;
    let target = run.accelerating ? { ...POSES.acelerando } : { ...POSES.base };
    // Aceleração lateral positiva para a parede (bottom turn), negativa no topo.
    const turn = THREE.MathUtils.clamp(-lat / 8, -1, 1);
    if (turn > 0) target = blendPoses(target, POSES.cavada, turn * 0.9);
    else target = blendPoses(target, POSES.topo, -turn * 0.5);
    const seg = run.lineSegment();
    if (seg === 'subida') target = blendPoses(target, POSES.subidaFace, 0.6);
    // Aproximação do lip: compressão e ombros enrolados no sentido contrário ao giro.
    const ttp = run.timeToPeak();
    let c = 0;
    if (run.takeoffReady && ttp > -0.08) c = smooth(1 - Math.abs(ttp) / 0.45);
    this.compressing = c > 0.05;
    // O pé de trás carrega a rabeta subindo o lip: o bico começa a subir ainda na água.
    this.popPitch = 0.12 * c;
    if (c > 0) {
      target = blendPoses(target, POSES.compressao, 0.9 * c);
      target.twist += -this.spinSign * THREE.MathUtils.degToRad(this.choreo.windup) * c;
      target.headYaw += this.spinSign * 0.2 * c;
    }
    // Bombeando a prancha com W: o centro de massa sobe e desce.
    if (run.accelerating) target.crouch += 0.12 * Math.sin(t * 7) * (1 - c);
    this.stateLabel = c > 0.05 ? 'aproximação do Lip · compressão' : run.accelerating ? `acelerando · ${seg ?? ''}` : `surf · ${seg === 'base' ? 'bottom turn' : seg ?? ''}`;
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

  /** Eixo do giro: vertical, ou inclinado no flip (Rodeo). */
  private spinAxisWorld(out: THREE.Vector3, forward: THREE.Vector3): THREE.Vector3 {
    if (this.maneuver.axis === 'flip') return out.copy(forward).multiplyScalar(0.75).addScaledVector(UP, 0.66).normalize();
    return out.copy(UP);
  }

  /** Último quadro calculado (para a depuração). */
  get current(): AnimFrame {
    return this.frame;
  }

  get phase(): AirPhase {
    return this.lastPhase;
  }

  /** Converte os parâmetros de corpo em alvos no mundo, no referencial de base da prancha. */
  private boardPose(b: BodyParams, grab: number, windmill: number, hipYaw: number, chestYaw: number) {
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
    this.constrainLegs();

    // Coluna e cabeça
    pose.spineBend = 0.2 + 0.35 * b.crouch + 0.4 * b.tuck + 0.35 * grab;
    pose.chestTwist = b.twist + chestYaw;
    pose.spineSide = b.side * 0.25;

    // Grab: ponto de contato na borda certa; o tronco e o quadril descem até o braço alcançar.
    let grabTarget: THREE.Vector3 | null = null;
    let grabHand: 'frente' | 'tras' = 'tras';
    if (grab > 0 && this.maneuver.grab) {
      const c = GRAB_CONTACT[this.maneuver.grab];
      const x = an.midX + c.dx;
      const hw = bd.halfWidth(x / bd.shape.length + 0.5);
      grabTarget = toWorld(this.tmpD, x, bd.deckY(x, 0) + 0.05, c.rail * (hw + 0.02));
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
    const k = 1 - Math.exp(-this.stepDt * 22);
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
    this.spinAxisWorld(d.spinAxis, this.tmpB.set(1, 0, 0).applyQuaternion(q).setY(0).normalize());
    const w = this.waveAt(t);
    const n = surfaceNormal(w, p.x, p.z);
    d.waveNormal.set(n.x, n.y, n.z);
    const cz = crestOffset(w, p.x);
    d.lip.set(p.x, surfaceHeight(w, p.x, cz), cz);
    d.zone = this.zone;
    d.state = this.stateLabel;
    d.shoulders = this.shoulderAngle * this.spinSign;
    d.hips = this.hips.value * this.spinSign;
    d.board = this.boardSpin.value * this.spinSign;
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

  private startFall(t: number) {
    const plan = this.plan!;
    const tAir = Math.min(t - this.takeoffT, plan.airTime);
    const pos = setV(new THREE.Vector3(), airPosition(plan, Math.max(0, tAir)));
    const vel = setV(new THREE.Vector3(), airVelocity(plan, Math.max(0, tAir)));
    // A prancha sai da orientação em que estava (sem trocar de repente).
    const boardQuat = this.boardQuat.clone();
    const spinAxis = new THREE.Vector3(0.3, 0.2, -1).normalize();
    this.fallStart = { t, pos, vel, boardQuat, spinAxis, splashed: false, slapped: false };
  }

  /** A quebra alcançou o surfista antes da decolagem: ele é engolido pela espuma. */
  private startFallFromRide(t: number) {
    const pos = setV(new THREE.Vector3(), this.run.position());
    const vel = new THREE.Vector3(this.run.speed * 0.6, 1.2, 0.6);
    this.fallStart = { t, pos, vel, boardQuat: this.boardQuat.clone(), spinAxis: new THREE.Vector3(0.2, 0.3, -1).normalize(), splashed: false, slapped: false };
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
      .multiply(this.tmpQ.setFromAxisAngle(UP, THREE.MathUtils.degToRad(this.boardSpin.value) * this.spinSign + STANCE_YAW));
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
