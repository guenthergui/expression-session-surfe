import { clamp } from '../core/rng';
import { emptyInput, type SurferInput } from '../core/controls';
import { AirBody, type AirRecord } from './airPhysics';
import { evaluateLanding, type LandingResult } from './landing';
import { FaceRider, S_LIP } from './surfPhysics';
import { tryLaunch, type Launch, type LaunchRefusal } from './takeoff';
import { breakX, crestOffset, faceWidth, surfaceHeight, type WaveState } from './waveField';

// Máquina de estados da onda inteira, sem Three.js:
//
//   paddling ──D──▶ dropping ──(0,9 s)──▶ riding ──solta Espaço no lip──▶ airborne
//                                          ▲  │                              │
//                                          │  └─ a quebra alcança ─▶ fallen  │
//                                          └──────── pouso em pé ◀───────────┤
//                                                    pouso ruim ──▶ fallen ◀─┘
//   riding ──(tempo da onda acabou)──▶ finished
//
// Em pé, a navegação é a física de sim/surfPhysics.ts; a decolagem é
// sim/takeoff.ts; o voo é sim/airPhysics.ts; o pouso é sim/landing.ts. Depois
// de um pouso em pé o surfista continua surfando, com um tempo de recuperação
// antes de poder comprimir de novo: dá para emendar vários aéreos na mesma
// onda, desde que a velocidade e a posição permitam. Passo fixo de 1/120 s.

export type RunState = 'paddling' | 'dropping' | 'riding' | 'airborne' | 'fallen' | 'finished';
export type FallCause = 'fechou' | 'pouso';

export interface RunParams {
  forca: number;
  impulsao: number;
  amplitude: number;
  rotacao: number;
  controleAereo: number;
  equilibrio: number;
  leituraOnda: number;
  /** Cansaço da bateria, 0 a 1. */
  fatigue: number;
  /** Prancha + quilhas por fase (pontos). */
  equip: { impulsao: number; rotacao: number; grab: number; aterrissagem: number };
  /** Multiplicador das condições na projeção (vento, seção), perto de 1. */
  conditions: number;
  sectionQuality: number;
  /** Duração da onda depois do drop (s). */
  rideLimit?: number;
  /** Sorte no pouso: número de 0 a 1 (padrão Math.random). */
  rng?: () => number;
}

export const DROP_TIME = 0.9;
export const STANDUP_TIME = 0.75;
export const PADDLE_SPEED = 1.6;
export const RIDE_LIMIT = 32;

export type RunEvent =
  | { kind: 'drop' }
  | { kind: 'compress' }
  | { kind: 'refused'; reason: LaunchRefusal | 'recuperando' | 'levantando' }
  | { kind: 'launch'; launch: Launch }
  | { kind: 'land'; record: AirRecord; landing: LandingResult }
  | { kind: 'fall'; cause: FallCause }
  | { kind: 'topTurn' }
  | { kind: 'finished' };

export interface LandingInfo {
  t: number;
  record: AirRecord;
  result: LandingResult;
  /** Direção do movimento e giro no toque, para a animação completar o giro na água. */
  yaw: number;
  flip: number;
  varial: number;
  /** Velocidade no toque (m/s), para a queda continuar o movimento. */
  vel: { x: number; y: number; z: number };
}

export class WaveRun {
  state: RunState = 'paddling';
  t = 0;
  dropAt: number | null = null;
  takeoffAt: number | null = null;
  rider: FaceRider | null = null;
  air: AirBody | null = null;
  compressing = false;
  compressHeld = 0;
  windup = 0;
  recoverUntil = 0;
  lastLanding: LandingInfo | null = null;
  fallCause: FallCause | null = null;
  fallAt: number | null = null;
  /** Eventos desde a última leitura (o App consome a cada quadro). */
  events: RunEvent[] = [];
  private input: SurferInput = emptyInput();
  private acc = 0;
  private dropX = 0;
  private readonly sPaddle: number;
  readonly sTrough: number;
  readonly vCruise: number;
  private x0 = 0;
  private topTurnCooldown = 0;

  constructor(readonly wave: WaveState, readonly params: RunParams) {
    const F = faceWidth(wave);
    this.sPaddle = F * 0.2;
    this.sTrough = F * 0.82;
    this.dropS = this.sPaddle;
    this.vCruise = 6.6 + wave.power * 0.012;
    this.wave.breakX0 = this.x0 - this.paddleGap() - this.wave.peelSpeed * this.t;
  }

  // ---------- Leitura de estado ----------

  get standing(): number {
    if (this.dropAt === null) return 0;
    return clamp((this.t - this.dropAt) / STANDUP_TIME, 0, 1);
  }

  get x(): number {
    if (this.air) return this.air.x;
    if (this.rider) return this.rider.x;
    return this.state === 'paddling' ? this.x0 : this.dropX;
  }

  /** Distância até a crista (m). */
  get s(): number {
    if (this.air) return this.air.s;
    if (this.rider) return this.rider.s;
    return this.dropS;
  }

  private dropS = 0;

  get z(): number {
    return crestOffset(this.waveNow, this.x) + this.s;
  }

  get waveNow(): WaveState {
    return { ...this.wave, time: this.t };
  }

  /** Velocidade na água (m/s). */
  get speed(): number {
    if (this.air) return Math.hypot(this.air.vx, this.air.vs);
    if (this.rider) return this.rider.v;
    return this.state === 'paddling' ? PADDLE_SPEED : this.dropSpeed;
  }

  private dropSpeed = PADDLE_SPEED;

  get groundSpeed(): number {
    return this.speed;
  }

  get vMax(): number {
    return this.rider?.vMax ?? 11;
  }

  get speedFactor(): number {
    return clamp((this.speed - 5) / (this.vMax - 5), 0, 1);
  }

  get accelerating(): boolean {
    return this.state === 'riding' && this.input.pump;
  }

  get recovering(): boolean {
    return this.t < this.recoverUntil;
  }

  get breakGap(): number {
    return this.x - breakX(this.waveNow);
  }

  get criticality(): number {
    return this.rider ? this.rider.criticality(this.waveNow) : 0;
  }

  get rideLimit(): number {
    return this.params.rideLimit ?? RIDE_LIMIT;
  }

  /** Segundos que faltam para a onda acabar (null antes do drop). */
  get timeLeft(): number | null {
    return this.dropAt === null ? null : Math.max(0, this.rideLimit - (this.t - this.dropAt));
  }

  /** Pronto para comprimir e decolar. */
  get canCompress(): boolean {
    return this.state === 'riding' && this.standing >= 1 && !this.recovering;
  }

  /** Compressão de 0 a 1, para a animação. */
  get compression(): number {
    return this.compressing ? clamp(this.compressHeld / 0.3, 0, 1) : 0;
  }

  /** Perto do lip, subindo e rápido: a decolagem vai virar aéreo. */
  get takeoffReady(): boolean {
    const r = this.rider;
    if (!r || !this.canCompress) return false;
    return r.s <= S_LIP + 0.7 && Math.sin(r.dir) >= 0.18 && r.v >= 4.6;
  }

  /** Direção na face (rad): 0 seguindo a onda, +π/2 subindo. */
  get dir(): number {
    return this.rider?.dir ?? (this.state === 'dropping' ? -1.05 : 0);
  }

  /** Aceleração lateral da curva (m/s²): negativa curvando para a parede (borda dos dedos). */
  lateralAccel(): number {
    return this.state === 'riding' || this.state === 'finished' ? this.rider?.lat ?? 0 : 0;
  }

  /** Trecho da linha, para a pose: base, subida, topo ou descida. */
  lineSegment(): 'base' | 'subida' | 'topo' | 'descida' | null {
    const r = this.rider;
    if (!r || (this.state !== 'riding' && this.state !== 'finished')) return null;
    const F = faceWidth(this.waveNow);
    const up = Math.sin(r.dir);
    if (r.s > F * 0.7 && r.omega * Math.cos(r.dir) > 0.4) return 'base';
    if (r.s < F * 0.3) return 'topo';
    return up > 0.15 ? 'subida' : up < -0.15 ? 'descida' : null;
  }

  /** Posição atual (y na superfície ou no ar). */
  position(): { x: number; y: number; z: number } {
    if (this.air) return { x: this.air.x, y: this.air.y, z: this.air.z(this.t) };
    const w = this.waveNow;
    const x = this.x;
    const z = crestOffset(w, x) + this.s;
    return { x, y: surfaceHeight(w, x, z) + 0.04, z };
  }

  /** Velocidade em x e z (m/s): a prancha aponta para onde ela vai. */
  velocity(): { x: number; z: number } {
    const w = this.waveNow;
    const e = 0.05;
    const dCrest = (crestOffset(w, this.x + e) - crestOffset(w, this.x - e)) / (2 * e);
    if (this.air) return { x: this.air.vx, z: this.air.vs + dCrest * this.air.vx };
    if (this.rider) {
      const vx = this.rider.v * Math.cos(this.rider.dir);
      const vs = -this.rider.v * Math.sin(this.rider.dir);
      return { x: vx, z: vs + dCrest * vx };
    }
    if (this.state === 'dropping') {
      const u = clamp((this.t - this.dropAt!) / DROP_TIME, 0, 1);
      const ds = ((this.sTrough - this.sPaddle) * 6 * u * (1 - u)) / DROP_TIME;
      return { x: this.dropSpeed, z: ds + dCrest * this.dropSpeed };
    }
    return { x: PADDLE_SPEED, z: dCrest * PADDLE_SPEED };
  }

  paddleGap(): number {
    return 11 + 14 * Math.exp(-this.t / 1.5);
  }

  // ---------- Comandos ----------

  pressDrop(): boolean {
    if (this.state !== 'paddling') return false;
    this.state = 'dropping';
    this.dropAt = this.t;
    this.dropX = this.x0;
    this.dropS = this.sPaddle;
    this.events.push({ kind: 'drop' });
    return true;
  }

  setInput(inp: SurferInput) {
    this.input = inp;
  }

  /** Lê e esvazia a fila de eventos. */
  drain(): RunEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  update(dt: number) {
    if (dt <= 0) return;
    this.acc += dt;
    const h = 1 / 120;
    while (this.acc >= h - 1e-9) {
      this.acc -= h;
      this.step(h);
    }
  }

  // ---------- Simulação ----------

  private step(dt: number) {
    this.t += dt;
    switch (this.state) {
      case 'paddling':
        this.x0 += PADDLE_SPEED * dt;
        this.wave.breakX0 = this.x0 - this.paddleGap() - this.wave.peelSpeed * this.t;
        break;
      case 'dropping': {
        const u = clamp((this.t - this.dropAt!) / DROP_TIME, 0, 1);
        const e = u * u * (3 - 2 * u);
        this.dropS = this.sPaddle + (this.sTrough - this.sPaddle) * e;
        this.dropSpeed = PADDLE_SPEED + (this.vCruise - PADDLE_SPEED) * Math.sin((u * Math.PI) / 2);
        this.dropX += this.dropSpeed * dt;
        if (u >= 1) {
          this.state = 'riding';
          const p = this.params;
          this.rider = new FaceRider(this.wave, {
            forca: p.forca,
            equilibrio: p.equilibrio,
            leituraOnda: p.leituraOnda,
            fatigue: p.fatigue,
            equipImpulse: p.equip.impulsao,
            equipLanding: p.equip.aterrissagem,
          }, this.dropX, this.dropS, this.dropSpeed);
          this.rider.dir = -0.25;
        }
        break;
      }
      case 'riding':
      case 'finished':
        this.ride(dt);
        break;
      case 'airborne':
        this.fly(dt);
        break;
      default:
        break;
    }
  }

  private ride(dt: number) {
    const r = this.rider!;
    const inp = this.input;
    const standing = this.standing >= 1;
    // Compressão: segurar o espaço com o surfista pronto.
    if (this.state === 'riding' && inp.compress && standing) {
      if (!this.compressing) {
        if (this.recovering) {
          if (!this.refusedRecovery) this.events.push({ kind: 'refused', reason: 'recuperando' });
          this.refusedRecovery = true;
        } else {
          this.compressing = true;
          this.compressHeld = 0;
          this.windup = 0;
          this.events.push({ kind: 'compress' });
        }
      }
      if (this.compressing) {
        this.compressHeld += dt;
        this.windup = clamp(this.windup + inp.spin * dt / 0.4, -1, 1);
      }
    } else if (!inp.compress) {
      this.refusedRecovery = false;
      if (this.compressing) {
        this.compressing = false;
        if (this.launch()) return;
      }
    }
    const steer = this.recovering ? 0.55 : 1;
    r.step(dt, this.t, { aimX: inp.aimX * steer, aimY: inp.aimY * steer, pump: inp.pump && standing, compressing: this.compressing });
    // Comprimindo até o lip sem soltar: o pop sai sozinho, já atrasado.
    if (this.compressing && r.s <= S_LIP + 0.02 && Math.sin(r.dir) > 0.15) {
      this.compressing = false;
      if (this.launch()) return;
    }
    this.topTurnCooldown -= dt;
    if (r.topTurn && this.topTurnCooldown <= 0) {
      this.topTurnCooldown = 0.6;
      this.events.push({ kind: 'topTurn' });
    }
    if (this.breakGap < 0.8) {
      this.fall('fechou');
      return;
    }
    if (this.state === 'riding' && this.dropAt !== null && this.t - this.dropAt > this.rideLimit && !this.compressing) {
      this.state = 'finished';
      this.events.push({ kind: 'finished' });
    }
  }

  private refusedRecovery = false;

  private launch(): boolean {
    const r = this.rider!;
    const p = this.params;
    const w = this.waveNow;
    const res = tryLaunch(
      { speed: r.v, dir: r.dir, s: r.s, vyFace: r.vyFace, compressHeld: this.compressHeld, windup: this.windup, criticality: r.criticality(w) },
      { impulsao: p.impulsao, amplitude: p.amplitude, equipImpulse: p.equip.impulsao, conditions: p.conditions, power: w.power, sectionQuality: p.sectionQuality },
    );
    this.compressHeld = 0;
    if (!res.ok) {
      this.events.push({ kind: 'refused', reason: res.reason });
      this.windup = 0;
      return false;
    }
    const pos = this.position();
    this.air = new AirBody(this.wave, res, this.t, r.x, pos.y, r.s, {
      rotacao: p.rotacao,
      controleAereo: p.controleAereo,
      equipRotation: p.equip.rotacao,
      equipGrab: p.equip.grab,
    });
    this.state = 'airborne';
    this.takeoffAt = this.t;
    this.windup = 0;
    this.events.push({ kind: 'launch', launch: res });
    return true;
  }

  private fly(dt: number) {
    const a = this.air!;
    if (!a.step(dt, this.input)) return;
    const record = a.record();
    const p = this.params;
    const rng = p.rng ?? Math.random;
    const landing = evaluateLanding(record, { equilibrio: p.equilibrio, equipLanding: p.equip.aterrissagem }, (rng() - 0.5) * 0.08);
    this.lastLanding = { t: this.t, record, result: landing, yaw: a.yaw, flip: a.flip, varial: a.varial, vel: { x: a.vx, y: a.vy, z: a.vs } };
    this.events.push({ kind: 'land', record, landing });
    const r = this.rider!;
    r.x = a.x;
    r.s = Math.max(S_LIP + 0.05, a.s);
    const sign = a.vx >= 0 ? 1 : -1;
    // Parte da queda vira velocidade descendo a face; o pouso define quanto sobra.
    r.v = clamp((Math.abs(a.vx) + Math.abs(a.vs) * 0.5 + Math.abs(a.vy) * 0.3) * landing.speedKeep, 0.6, r.vMax);
    r.dir = sign > 0 ? -0.5 : Math.PI + 0.5;
    r.omega = 0;
    this.air = null;
    if (landing.outcome === 'queda') {
      this.fall('pouso');
      return;
    }
    this.state = 'riding';
    this.recoverUntil = this.t + landing.recovery;
  }

  private fall(cause: FallCause) {
    this.state = 'fallen';
    this.fallCause = cause;
    this.fallAt = this.t;
    this.compressing = false;
    this.events.push({ kind: 'fall', cause });
  }
}
