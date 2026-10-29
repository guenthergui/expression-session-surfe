import * as THREE from 'three';
import { airKeys, blendPoses, landingKeys, POSES, sampleSequence, type BodyParams, type Keyframe } from '../anim/poses';
import type { AirPhase, Judgement, Maneuver, Outcome } from '../core/types';
import { GRAB_HAND } from '../core/maneuvers';
import { RIDE_OUT_TIME, airPosition, airVelocity, rideOutPosition, type AerialPlan, type Vec3 } from '../sim/aerial';
import { surfaceHeight, surfaceNormal, type WaveState } from '../sim/waveField';
import type { WaveRun } from '../sim/waveRun';
import type { WorldPose } from '../render/SurferRig';

// Animação da onda inteira, conduzida pelo tempo (nunca por quadros) e pelo
// estado real do jogo:
//   - remada deitado, drop com o corpo se levantando de forma contínua, surf e
//     aceleração, tudo vindo da máquina de estados em src/sim/waveRun.ts;
//   - no ar, a pose vem de sequências de keyframes por família de manobra;
//   - o tronco lidera o giro e a prancha segue com atraso (mola amortecida),
//     enquanto os pés continuam presos ao deck pela cinemática inversa;
//   - o centro de massa segue a balística; ao encolher as pernas, a prancha
//     sobe em direção ao corpo;
//   - a rotação só avança com os comandos de rotação certos, o grab só fecha a
//     mão se o comando foi feito, e o pouso mostra o resultado calculado.
//
// Base do surfista: pé direito à frente (no sentido do deslocamento) e de
// frente para a parede da onda, ou seja, de costas para a câmera. Em vez de
// compensar em cada pose, tudo é descrito num "referencial de base": x para o
// bico, y para cima e f para a frente do corpo. A conversão para a prancha é
// feita num único lugar (stanceToBoard) e o corpo é girado 180° (STANCE_YAW).

export interface SprayEvent {
  kind: 'carve' | 'launch' | 'land' | 'fall' | 'bodySplash' | 'boardSlap' | 'crest' | 'paddle' | 'drop';
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  strength: number;
  /** Resultado do pouso, quando o evento é de pouso. */
  outcome?: Outcome;
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
  /** Diferença de giro entre corpo e prancha, em graus (para depuração e testes). */
  bodyBoardLag: number;
  /** Velocidade da prancha na água (m/s), para rastro e spray. */
  speed: number;
  events: SprayEvent[];
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
const Z_AXIS = new THREE.Vector3(0, 0, 1);
/** O corpo fica de frente para -z da prancha (parede da onda), de costas para a câmera. */
export const STANCE_YAW = Math.PI;
/** Lado do corpo que vai para o bico. */
export const FRONT_SIDE = 'right' as const;
/** Altura da pelve sobre o deck no instante da decolagem (pose de compressão). */
const H_TAKEOFF = 0.58;
/** Pés no deck, em metros a partir do centro da prancha. */
const FRONT_X = 0.24;
const BACK_X = -0.33;
/** Tornozelo um pouco para os calcanhares, para o pé ficar centrado na prancha. */
const ANKLE_F = -0.035;

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
  return 0.84 - 0.27 * b.crouch - 0.32 * b.tuck - 0.05 * grab;
}

/** Converte o referencial de base (x bico, y cima, f frente do corpo) para a prancha. */
function stanceToBoard(out: THREE.Vector3, x: number, y: number, f: number): THREE.Vector3 {
  return out.set(x, y, -f);
}

export class AerialAnimator {
  /** Giro alvo do corpo (graus) e giro da prancha, que segue com atraso. */
  private bodyAngle = 0;
  private boardAngle = 0;
  private boardAngVel = 0;
  private lastBodyAngle = 0;
  private bodyAngVel = 0;
  private fallStart: { t: number; pos: THREE.Vector3; vel: THREE.Vector3; boardQuat: THREE.Quaternion; spinAxis: THREE.Vector3; splashed: boolean; slapped: boolean } | null = null;
  private launched = false;
  private landed = false;
  private landingAngle = 0;
  /** Instante (tempo de onda) da decolagem e do pouso; definidos em beginAir. */
  takeoffT = Infinity;
  airEnd = Infinity;
  totalTime = Infinity;
  plan: AerialPlan | null = null;
  private dirSign: number;
  private air: Keyframe[] = [];
  private landingSeq: Keyframe[] | null = null;
  private moveStart = 0;
  private moveEnd = 0;
  private grabIndex: number;
  private track: TrackView;
  private smoothedBody: BodyParams = { ...POSES.base };
  private lastPhase: AirPhase = 'remada';
  private dropSprayed = false;

  // Objetos reaproveitados a cada quadro (sem alocar no laço principal).
  private readonly boardPos = new THREE.Vector3();
  private readonly boardQuat = new THREE.Quaternion();
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();
  private readonly tmpC = new THREE.Vector3();
  private readonly tmpD = new THREE.Vector3();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpQ2 = new THREE.Quaternion();
  private readonly tmpM = new THREE.Matrix4();
  private readonly stanceQ = new THREE.Quaternion().setFromAxisAngle(UP, STANCE_YAW);
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
    kneePole: new THREE.Vector3(),
    elbowPole: new THREE.Vector3(),
  };
  private readonly frame: AnimFrame;

  constructor(
    readonly maneuver: Maneuver,
    readonly wave: WaveState,
    readonly board: BoardShapeInfo,
    readonly run: WaveRun,
  ) {
    this.dirSign = maneuver.direction === 'backside' ? -1 : 1;
    this.grabIndex = maneuver.sequence.findIndex((s) => s.phase === 'grab');
    this.track = { steps: maneuver.sequence, results: maneuver.sequence.map(() => null) };
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
    };
  }

  /** Começa o voo: chamado no instante em que a decolagem é aceita. */
  beginAir(plan: AerialPlan, track: TrackView) {
    this.plan = plan;
    this.track = track;
    this.takeoffT = plan.launchTime;
    this.airEnd = plan.launchTime + plan.airTime;
    this.totalTime = this.airEnd + RIDE_OUT_TIME;
    const moves = this.maneuver.sequence.filter((s) => s.phase === 'rotacao' || s.phase === 'grab').map((s) => s.time);
    this.moveStart = moves.length ? Math.min(...moves) : plan.airTime * 0.4;
    this.moveEnd = moves.length ? Math.max(...moves) : plan.airTime * 0.5;
    this.air = airKeys(this.maneuver.family, plan.airTime, this.moveStart, this.moveEnd);
  }

  /** Troca o plano de voo sem mudar o instante da decolagem (ajuste fino). */
  replan(plan: AerialPlan) {
    this.plan = plan;
  }

  private waveAt(t: number): WaveState {
    return { ...this.wave, time: t };
  }

  /** Orientação da prancha na água: nariz na direção do movimento e deck na normal da água. */
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

  /** Giro alvo: cada comando de rotação certo (ou ainda por vir) soma 180°; Late gira 150°. */
  private rotationTarget(tAir: number): number {
    let target = 0;
    const steps = this.track.steps;
    for (let i = 0; i < steps.length; i++) {
      const st = steps[i];
      if (st.phase !== 'rotacao') continue;
      const r = this.track.results[i];
      if (r === 'miss') continue;
      target += (r === 'late' ? 150 : 180) * smooth((tAir - (st.time - 0.2)) / 0.42);
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
    return hold * smooth((tAir - (gt - 0.12)) / 0.16) * (1 - smooth((tAir - (airTime - 0.28)) / 0.18));
  }

  /** Mola criticamente amortecida: a prancha persegue o giro do corpo com ~0,1 s de atraso. */
  private followBoard(dt: number, stiffness = 260) {
    if (dt <= 0) return;
    const damping = 2 * Math.sqrt(stiffness);
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const acc = stiffness * (this.bodyAngle - this.boardAngle) - damping * this.boardAngVel;
      this.boardAngVel += acc * h;
      this.boardAngle += this.boardAngVel * h;
    }
    // O corpo não consegue ficar mais de 50° à frente da prancha presa nos pés.
    const diff = this.bodyAngle - this.boardAngle;
    if (Math.abs(diff) > 50) this.boardAngle = this.bodyAngle - Math.sign(diff) * 50;
  }

  /** Suaviza a pose do surf (sem saltos quando o estado muda, por exemplo ao soltar W). */
  private ease(target: BodyParams, dt: number, rate = 8): BodyParams {
    const k = 1 - Math.exp(-dt * rate);
    const s = this.smoothedBody;
    for (const key of Object.keys(target) as (keyof BodyParams)[]) s[key] += (target[key] - s[key]) * k;
    return { ...s };
  }

  update(t: number, dt: number, outcome: Outcome | null): AnimFrame {
    const events: SprayEvent[] = [];
    this.frame.events = events;
    const run = this.run;
    let phase: AirPhase;
    let airborne = false;
    let body: BodyParams;
    let grab = 0;
    let windmill = 0;
    let prone = 0; // 1 deitado, 0 em pé
    const boardPos = this.boardPos;
    const boardQuat = this.boardQuat;

    if (run.state === 'fallen' && !this.fallStart) this.startFallFromRide(t);
    if (outcome === 'queda' && !this.fallStart && this.plan && t >= this.airEnd - 0.02) this.startFall(t);
    if (this.fallStart) return this.fallFrame(t, dt, events);

    const plan = this.plan;
    if (!plan || t < this.takeoffT) {
      // Antes da decolagem: remada, drop e surf, seguindo a máquina de estados.
      const w = this.waveAt(t);
      setV(boardPos, run.position());
      const vel = this.tmpD.set(run.speed, 0, 0);
      const next = this.tmpC.copy(boardPos).addScaledVector(vel, 0.05);
      if (run.state === 'dropping') next.z += 0.08; // descendo a face
      const nextCopy = next.clone();
      const lat = run.lateralAccel();
      const roll = run.state === 'riding' ? THREE.MathUtils.clamp(lat * 0.09, -0.55, 0.55) : 0;
      this.rideQuat(boardQuat, boardPos, nextCopy, w, roll);
      const up = run.standing;
      prone = 1 - smooth(up);
      if (run.state === 'paddling') {
        body = { ...POSES.base };
        phase = 'remada';
        if (Math.random() < dt * 6) events.push({ kind: 'paddle', pos: boardPos.clone(), dir: UP.clone(), strength: 0.4 });
      } else if (run.state === 'dropping' || up < 1) {
        body = this.ease(blendPoses(POSES.drop, POSES.base, smooth((t - (run.dropAt ?? t)) / 1.4)), dt);
        phase = 'drop';
        if (!this.dropSprayed) {
          this.dropSprayed = true;
          events.push({ kind: 'drop', pos: boardPos.clone(), dir: new THREE.Vector3(-0.4, 0.8, 0.4).normalize(), strength: 0.9 });
        }
      } else {
        // Surfando: pose base, cavada nas curvas, peso à frente acelerando e compressão chegando ao lip.
        let target = run.accelerating ? { ...POSES.acelerando } : { ...POSES.base };
        const turn = THREE.MathUtils.clamp(-lat / 12, -1, 1);
        if (turn > 0) target = blendPoses(target, POSES.cavada, turn * 0.7);
        if (run.takeoffReady) target = blendPoses(target, POSES.compressao, 0.45 * smooth(1 - Math.abs(run.timeToPeak()) / 0.45));
        if (run.accelerating) target.crouch += 0.12 * Math.sin(t * 7); // bombeando a prancha
        body = this.ease(target, dt);
        phase = run.accelerating ? 'aceleracao' : 'surf';
        if (Math.random() < dt * (12 + run.speed * 3)) {
          events.push({ kind: 'carve', pos: boardPos.clone(), dir: vel.clone().normalize(), strength: 0.25 + Math.abs(roll) * 1.4 + run.speedFactor * 0.6 });
        }
      }
    } else if (t < this.airEnd) {
      // Voo: o centro de massa segue a balística.
      airborne = true;
      const tAir = t - this.takeoffT;
      if (!this.launched) {
        this.launched = true;
        const dir = setV(new THREE.Vector3(), plan.velocity).normalize();
        events.push({ kind: 'launch', pos: setV(new THREE.Vector3(), plan.launch), dir, strength: 0.8 + plan.velocity.y / 8 });
      }
      setV(boardPos, airPosition(plan, tAir));
      const vel = setV(this.tmpC, airVelocity(plan, tAir));

      this.bodyAngle = this.rotationTarget(tAir);
      this.bodyAngVel = (this.bodyAngle - this.lastBodyAngle) / Math.max(dt, 1e-3);
      this.lastBodyAngle = this.bodyAngle;
      this.followBoard(dt);

      body = sampleSequence(this.air, tAir);
      grab = this.grabAmount(tAir, plan.airTime);
      if (this.grabIndex >= 0 && this.track.results[this.grabIndex] === 'miss') {
        body = blendPoses(body, POSES.arNeutro, 0.6);
      }
      // O tronco lidera o giro: a diferença corpo-prancha vira torção.
      body.twist = this.dirSign * THREE.MathUtils.degToRad(this.bodyAngle - this.boardAngle) * 0.6 +
        this.dirSign * THREE.MathUtils.clamp(this.bodyAngVel / 900, -1, 1) * 0.25;
      if (Math.abs(this.bodyAngVel) > 120) body.spread *= 0.6;
      this.smoothedBody = { ...body };

      const x0 = this.tmpA.set(vel.x, 0, vel.z).normalize();
      const z0 = this.tmpB.crossVectors(x0, UP).normalize();
      const base = this.tmpQ.setFromRotationMatrix(this.tmpM.makeBasis(x0, UP, z0));
      let pitch = Math.atan2(vel.y, Math.hypot(vel.x, vel.z)) * 0.55;
      let tweakRoll = 0;
      if (grab > 0 && this.maneuver.grab) {
        // No grab a prancha é puxada e inclinada para a borda segurada (dedos = frente do corpo = -z).
        const toeSide = this.maneuver.grab === 'indy' || this.maneuver.grab === 'mute';
        tweakRoll = (toeSide ? 0.32 : -0.32) * grab;
        pitch += 0.12 * grab;
      } else if (this.maneuver.family === 'aereo') {
        tweakRoll = 0.18 * Math.sin(smooth(tAir / plan.airTime) * Math.PI) * this.dirSign;
      }
      boardQuat.copy(base)
        .multiply(this.tmpQ2.setFromAxisAngle(Z_AXIS, pitch))
        .multiply(this.tmpQ2.setFromAxisAngle(X_AXIS, tweakRoll));
      const ang = THREE.MathUtils.degToRad(this.boardAngle) * this.dirSign;
      if (this.maneuver.axis === 'flip') {
        const axis = this.tmpB.copy(x0).multiplyScalar(0.75).addScaledVector(UP, 0.66).normalize();
        boardQuat.premultiply(this.tmpQ2.setFromAxisAngle(axis, ang));
      } else {
        boardQuat.premultiply(this.tmpQ2.setFromAxisAngle(UP, ang));
      }

      // Chegando na água: a prancha se alinha com a face, mantendo o giro feito.
      const toLand = plan.airTime - tAir;
      if (toLand < 0.2) {
        const w = this.waveAt(this.airEnd);
        const land = setV(new THREE.Vector3(), plan.landing);
        const after = setV(new THREE.Vector3(), rideOutPosition(plan, w, 0.05, this.airEnd + 0.05));
        const ride = this.rideQuat(new THREE.Quaternion(), land, after, w, 0);
        if (this.maneuver.axis !== 'flip') ride.premultiply(this.tmpQ2.setFromAxisAngle(UP, ang));
        boardQuat.slerp(ride, smooth(1 - toLand / 0.2));
      }

      // Encolher as pernas puxa a prancha para cima, em direção ao corpo.
      const h = pelvisHeight(body, grab);
      const lift = THREE.MathUtils.clamp(H_TAKEOFF - h, -0.25, 0.4) * smooth(tAir / 0.12) * (1 - smooth((tAir - (plan.airTime - 0.16)) / 0.16));
      boardPos.addScaledVector(this.tmpA.set(0, 1, 0).applyQuaternion(boardQuat), lift);

      const apexT = plan.velocity.y / 9.81;
      const inMove = Math.abs(this.bodyAngVel) > 90 || grab > 0.1 || (tAir >= this.moveStart - 0.2 && tAir <= this.moveEnd + 0.25);
      phase = tAir < 0.12 ? 'decolagem' : toLand < 0.25 ? 'aterrissagem' : inMove ? 'manobra' : tAir < apexT ? 'subida' : 'descida';
    } else {
      // Pouso e saída
      const tOut = t - this.airEnd;
      const w = this.waveAt(t);
      if (!this.landed) {
        this.landed = true;
        this.landingAngle = this.boardAngle;
        events.push({ kind: 'land', pos: setV(new THREE.Vector3(), plan.landing), dir: new THREE.Vector3(1, 0.4, -0.3).normalize(), strength: outcome === 'instavel' ? 1.6 : 1.1, outcome: outcome ?? undefined });
      }
      if (outcome && outcome !== 'queda' && !this.landingSeq) this.landingSeq = landingKeys(outcome);
      setV(boardPos, rideOutPosition(plan, w, tOut, t));
      const next = setV(new THREE.Vector3(), rideOutPosition(plan, this.waveAt(t + 0.05), tOut + 0.05, t + 0.05));
      const unstable = outcome === 'instavel';
      const wobble = unstable ? Math.sin(tOut * 16) * 0.22 * Math.max(0, 1 - tOut / 1.2) : 0;
      // Descendo a face depois do pouso: curva para os calcanhares (+z).
      const roll = 0.35 * Math.sin(smooth(tOut / 1.2) * Math.PI) + wobble;
      const ride = this.rideQuat(new THREE.Quaternion(), boardPos, next, w, roll);
      // Rotações de 180 e 540 pousam de costas (fakie) e completam o giro na água,
      // voltando à base normal (costas para a câmera) sem virar de uma vez.
      let yaw = THREE.MathUtils.degToRad(this.landingAngle) * this.dirSign;
      const rem = ((this.landingAngle % 360) + 360) % 360;
      if (this.maneuver.axis !== 'flip' && rem > 90 && rem < 270) {
        yaw = THREE.MathUtils.degToRad(this.landingAngle + (360 - rem) * smooth(tOut / 0.7)) * this.dirSign;
      }
      boardQuat.copy(ride);
      if (this.maneuver.axis !== 'flip') boardQuat.premultiply(this.tmpQ2.setFromAxisAngle(UP, yaw));
      body = sampleSequence(this.landingSeq ?? landingKeys('concluida'), tOut);
      windmill = unstable ? tOut * 9 : 0;
      phase = tOut < 0.35 ? 'aterrissagem' : 'saida';
      if (Math.random() < dt * 30) events.push({ kind: 'carve', pos: boardPos.clone(), dir: next.sub(boardPos).normalize(), strength: 0.6 + Math.abs(roll) });
    }

    this.boardPose(body, grab, windmill, t);
    if (prone > 0) this.blendProne(prone, t, run.state === 'paddling');
    const water = surfaceHeight(this.waveAt(t), boardPos.x, boardPos.z);
    const f = this.frame;
    f.phase = phase;
    this.lastPhase = phase;
    f.airborne = airborne;
    f.falling = false;
    f.heightAboveWater = boardPos.y - water;
    f.bodyBoardLag = this.bodyAngle - this.boardAngle;
    f.speed = plan && t >= this.takeoffT ? plan.speed : run.speed;
    return f;
  }

  get phase(): AirPhase {
    return this.lastPhase;
  }

  /** Converte os parâmetros de corpo em alvos no mundo, no referencial de base da prancha. */
  private boardPose(b: BodyParams, grab: number, windmill: number, t: number) {
    const bd = this.board;
    const boardPos = this.boardPos;
    const boardQuat = this.boardQuat;
    const pose = this.pose;
    const toWorld = (out: THREE.Vector3, x: number, y: number, f: number) =>
      stanceToBoard(out, x, y, f).applyQuaternion(boardQuat).add(boardPos);
    const deck = bd.deckY(0, 0);
    const h = pelvisHeight(b, grab);
    // Pelve entre os pés, sentada para trás (calcanhares) quando agacha.
    toWorld(pose.pelvisPos, -0.045 + b.lean * 0.12, deck + h, -0.05 - 0.07 * b.crouch + b.side * 0.07);
    // Corpo virado para a parede da onda; o quadril abre um pouco para o bico.
    const lag = THREE.MathUtils.degToRad(this.bodyAngle - this.boardAngle) * this.dirSign * 0.4;
    const euler = new THREE.Euler(0.12 + 0.22 * b.crouch + 0.2 * b.tuck, STANCE_YAW - 0.28 + lag, -b.side * 0.12, 'YXZ');
    pose.pelvisQuat.copy(boardQuat).multiply(this.tmpQ.setFromEuler(euler));

    // Mãos livres: o braço da frente (direito) aponta para o bico, o de trás (esquerdo) para a rabeta.
    const front = this.tmpA.set(
      0.26 + 0.34 * b.spread,
      deck + h + 0.22 + 0.32 * b.armsUp + (windmill ? Math.sin(windmill) * 0.25 : 0),
      0.16 + 0.08 * b.spread + (windmill ? Math.cos(windmill) * 0.15 : 0),
    );
    const back = this.tmpB.set(
      -0.22 - 0.34 * b.spread,
      deck + h + 0.14 + 0.3 * b.armsUp + (windmill ? Math.sin(windmill + 2) * 0.25 : 0),
      0.2 + (windmill ? Math.cos(windmill + 2) * 0.15 : 0),
    );
    let gripFront = b.grip * 0.5;
    let gripBack = b.grip * 0.5;
    // Grab: o pulso vai até a borda certa da prancha e só então a mão fecha.
    if (grab > 0 && this.maneuver.grab) {
      const L = bd.shape.length;
      const atX = { indy: -0.06, mute: 0.06, melon: -0.04, stalefish: -0.42 }[this.maneuver.grab];
      // Borda dos dedos fica na frente do corpo (+f); a dos calcanhares, atrás (-f).
      const fSign = this.maneuver.grab === 'indy' || this.maneuver.grab === 'mute' ? 1 : -1;
      const target = this.tmpC.set(atX, bd.deckY(atX, 0) + 0.06, fSign * (bd.halfWidth(atX / L + 0.5) + 0.01));
      if (GRAB_HAND[this.maneuver.grab] === 'tras') {
        back.lerp(target, grab);
        gripBack = smooth((grab - 0.6) / 0.4);
      } else {
        front.lerp(target, grab);
        gripFront = smooth((grab - 0.6) / 0.4);
      }
    }
    // Pé direito à frente: frente = direita, trás = esquerda.
    const handFront = FRONT_SIDE === 'right' ? pose.handRight : pose.handLeft;
    const handBack = FRONT_SIDE === 'right' ? pose.handLeft : pose.handRight;
    toWorld(handFront, front.x, front.y, front.z);
    toWorld(handBack, back.x, back.y, back.z);
    pose.gripRight = FRONT_SIDE === 'right' ? gripFront : gripBack;
    pose.gripLeft = FRONT_SIDE === 'right' ? gripBack : gripFront;

    pose.spineBend = 0.2 + 0.35 * b.crouch + 0.45 * b.tuck + 0.55 * grab;
    pose.chestTwist = b.twist;
    pose.spineSide = b.side * 0.25;
    pose.headPitch = b.headPitch - pose.spineBend * 0.6;
    // A cabeça procura o bico e a linha da onda, compensando a torção.
    pose.headYaw = THREE.MathUtils.clamp(-b.twist * 0.8 + 0.25, -1.1, 1.1);
    const footFront = FRONT_SIDE === 'right' ? pose.footRight : pose.footLeft;
    const footBack = FRONT_SIDE === 'right' ? pose.footLeft : pose.footRight;
    toWorld(footFront.pos, FRONT_X, bd.deckY(FRONT_X, 0), ANKLE_F);
    toWorld(footBack.pos, BACK_X, bd.deckY(BACK_X, 0), ANKLE_F);
    // Pés com os dedos para a frente do corpo (mesmo giro de base do corpo).
    footFront.quat.copy(boardQuat).multiply(this.stanceQ);
    footBack.quat.copy(boardQuat).multiply(this.stanceQ);
    toWorld(pose.kneePole, 0.25, 0.15, 1).sub(boardPos).normalize();
    toWorld(pose.elbowPole, 0, -0.6, -0.8).sub(boardPos).normalize();
    void t;
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
    pose.pelvisQuat.slerpQuaternions(prone, pose.pelvisQuat, k);
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
      foot.quat.slerpQuaternions(toesBack, foot.quat, kf);
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
    pose.kneePole.lerpVectors(this.tmpA.set(0, -1, 0).applyQuaternion(boardQuat), pose.kneePole, k).normalize();
    pose.elbowPole.lerpVectors(this.tmpA.set(0, 1, 0).applyQuaternion(boardQuat), pose.elbowPole, k).normalize();
  }

  private startFall(t: number) {
    const plan = this.plan!;
    const tAir = Math.min(t - this.takeoffT, plan.airTime);
    const pos = setV(new THREE.Vector3(), airPosition(plan, Math.max(0, tAir)));
    const vel = setV(new THREE.Vector3(), airVelocity(plan, Math.max(0, tAir)));
    const boardQuat = new THREE.Quaternion().setFromAxisAngle(UP, THREE.MathUtils.degToRad(this.boardAngle) * this.dirSign);
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
      .multiply(this.tmpQ.setFromAxisAngle(UP, THREE.MathUtils.degToRad(this.boardAngle) * this.dirSign + STANCE_YAW));
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
    pose.kneePole.set(0, 0.2, 1).applyQuaternion(pose.pelvisQuat);
    pose.elbowPole.set(0, -1, -0.5).applyQuaternion(pose.pelvisQuat);
    const fr = this.frame;
    fr.events = events;
    fr.phase = 'aterrissagem';
    fr.airborne = false;
    fr.falling = true;
    fr.heightAboveWater = Math.max(0, py - pw);
    fr.bodyBoardLag = 0;
    fr.speed = 2;
    return fr;
  }
}
