import { clamp } from '../core/rng';
import type { Judgement } from '../core/types';
import { breakX, crestOffset, faceWidth, surfaceHeight, type WaveState } from './waveField';

// Máquina de estados da aproximação, do início da onda até a decolagem:
//
//   paddling ──D──▶ dropping ──(0,9 s)──▶ riding ⇄ (W) accelerating
//                                          │
//                                          ├─ espaço perto do lip com velocidade ─▶ airborne
//                                          └─ a quebra alcança o surfista ─▶ fallen ("fechou")
//
// Depois da decolagem, o voo, o pouso e a queda continuam no animador
// (airborne → landing → waveResult). Tudo aqui é lógica pura, sem Three.js.
//
// Remando, o surfista está deitado no alto da face. O drop desce a face até a
// base, ganhando velocidade com a gravidade, enquanto o corpo se levanta. Em pé,
// ele sobe e desce a face numa linha: cada subida chega perto do lip, que é o
// ponto ideal para decolar. W acelera até um limite; solto, a velocidade volta
// aos poucos para a de cruzeiro. A quebra da onda avança atrás do surfista: quem
// fica lento demais é alcançado.
//
// A linha é medida a partir da crista (s, em metros), e não numa posição fixa
// do cenário: a crista ondula ao longo da onda, e o surfista acompanha a face
// real. Subindo a face ele perde velocidade (troca energia cinética por altura)
// e descendo ganha, como na água. A simulação usa passo fixo de 1/120 s, então
// o resultado não depende da taxa de quadros.

export type RunState = 'paddling' | 'dropping' | 'riding' | 'airborne' | 'fallen';

export interface RunParams {
  /** Força do surfista (0 a 100). */
  forca: number;
  /** Controle aéreo, para a janela Perfect da decolagem. */
  controleAereo: number;
  /** Modificador de impulsão do equipamento (prancha + quilhas). */
  equipImpulse: number;
  /** Segundos depois do drop antes de poder decolar (o tempo da barra de comandos começar). */
  takeoffDelay?: number;
}

export const DROP_TIME = 0.9;
/** Tempo do drop até ficar completamente em pé. */
export const STANDUP_TIME = 0.75;
export const PADDLE_SPEED = 1.6;
/** Janela total, para cada lado do pico da subida, em que a decolagem é aceita. */
export const TAKEOFF_WINDOW = 0.45;

export interface TakeoffAttempt {
  ok: boolean;
  /** Motivo da recusa, para mostrar ao jogador. */
  reason?: 'deitado' | 'levantando' | 'aguarde' | 'velocidade' | 'posicao' | 'jaDecolou';
  judgement?: Judgement;
  /** Segundos entre o toque e o pico da subida (negativo = cedo). */
  offset?: number;
}

export class WaveRun {
  state: RunState = 'paddling';
  /** Tempo de onda (s) desde o início desta onda. */
  t = 0;
  x = 0;
  z: number;
  speed = PADDLE_SPEED;
  accelerating = false;
  /** Momento do D e da decolagem. */
  dropAt: number | null = null;
  takeoffAt: number | null = null;
  /** Distância até a crista (m): 0 no lip, cresce descendo a face. */
  s: number;
  /** Fase da linha de subida e descida da face (pico do lip em π). */
  private phase = 0;
  private readonly sPaddle: number;
  readonly sTrough: number;
  readonly sLip = 0.3;
  /** Altura média da linha, referência da troca de energia. */
  private hRef = 0;
  /** Fator de velocidade pela altura na face (1 na altura média). */
  energy = 1;
  private acc = 0;
  readonly vCruise: number;
  readonly vMax: number;
  readonly vMinTakeoff: number;
  private readonly accel: number;

  constructor(readonly wave: WaveState, readonly params: RunParams) {
    const F = faceWidth(wave);
    this.sPaddle = F * 0.45;
    this.sTrough = F * 0.92;
    this.s = this.sPaddle;
    this.z = crestOffset(wave, 0) + this.s;
    this.vCruise = 5.0 + wave.power * 0.012;
    this.vMax = 8.2 + params.forca * 0.012 + params.equipImpulse * 0.08 + wave.power * 0.008;
    this.vMinTakeoff = Math.min(this.vMax - 0.8, 6.3);
    this.accel = 1.9 + params.forca * 0.018 + params.equipImpulse * 0.06;
    this.wave.breakX0 = this.x - this.paddleGap() - this.wave.peelSpeed * this.t;
  }

  /** Em pé: 0 deitado, 1 de pé. */
  get standing(): number {
    if (this.dropAt === null) return 0;
    return clamp((this.t - this.dropAt) / STANDUP_TIME, 0, 1);
  }

  get canAccelerate(): boolean {
    return this.state === 'riding';
  }

  /** Quão perto da decolagem ideal (0 longe, 1 no pico da subida). */
  lipCloseness(): number {
    if (this.state !== 'riding') return 0;
    return 0.5 - 0.5 * Math.cos(this.phase);
  }

  /** Segundos até o pico da subida mais próximo (negativo = já passou). */
  timeToPeak(): number {
    const w = this.omega() * this.energy;
    const p = ((this.phase % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    // p < π: o pico desta subida ainda vem; p > π: já passou.
    return (Math.PI - p) / w;
  }

  /**
   * Segundos até o próximo pico em que ainda dá para decolar: se o pico desta
   * subida já passou da janela, conta o da próxima subida.
   */
  nextPeakIn(): number {
    const tp = this.timeToPeak();
    return tp < -TAKEOFF_WINDOW ? tp + (2 * Math.PI) / this.omega() : tp;
  }

  /** Pronto para decolar: em pé, rápido o bastante e na janela do lip. */
  get takeoffReady(): boolean {
    return this.state === 'riding' && this.standing >= 1 && !this.waiting && this.speed >= this.vMinTakeoff && Math.abs(this.timeToPeak()) <= TAKEOFF_WINDOW;
  }

  /** Ainda dentro do tempo de espera depois do drop. */
  get waiting(): boolean {
    return this.dropAt === null || this.t - this.dropAt < (this.params.takeoffDelay ?? 0);
  }

  /** Velocidade de 0 (cruzeiro) a 1 (máxima), para a interface e para a chance. */
  get speedFactor(): number {
    return clamp((this.speed - this.vCruise) / (this.vMax - this.vCruise), 0, 1);
  }

  /** Distância da quebra até o surfista (m). */
  get breakGap(): number {
    return this.x - breakX({ ...this.wave, time: this.t });
  }

  /** Distância da quebra durante a remada: começa longe e chega a 11 m. */
  paddleGap(): number {
    return 11 + 14 * Math.exp(-this.t / 1.5);
  }

  private omega(): number {
    // Em velocidade maior a linha fica mais longa e rápida: cerca de 2,4 s por subida a 7 m/s.
    return (Math.PI * Math.max(3, this.speed)) / 8.5;
  }

  /** D: começa o drop. Só vale remando; repetições são ignoradas. */
  pressDrop(): boolean {
    if (this.state !== 'paddling') return false;
    this.state = 'dropping';
    this.dropAt = this.t;
    return true;
  }

  setAccelerate(on: boolean) {
    this.accelerating = on;
  }

  /** Espaço: tenta decolar. Recusas não gastam nada e explicam o motivo. */
  tryTakeoff(): TakeoffAttempt {
    if (this.state === 'paddling') return { ok: false, reason: 'deitado' };
    if (this.state === 'dropping' || this.standing < 1) return { ok: false, reason: 'levantando' };
    if (this.state !== 'riding') return { ok: false, reason: 'jaDecolou' };
    if (this.waiting) return { ok: false, reason: 'aguarde' };
    if (this.speed < this.vMinTakeoff) return { ok: false, reason: 'velocidade' };
    const offset = -this.timeToPeak();
    if (Math.abs(offset) > TAKEOFF_WINDOW) return { ok: false, reason: 'posicao' };
    const perfect = 0.1 + this.params.controleAereo * 0.0008;
    const abs = Math.abs(offset);
    const judgement: Judgement = abs <= perfect ? 'perfect' : abs <= 0.24 ? 'good' : 'late';
    this.state = 'airborne';
    this.takeoffAt = this.t;
    this.accelerating = false;
    return { ok: true, judgement, offset };
  }

  /** Posição atual na água (y na superfície). */
  position(): { x: number; y: number; z: number } {
    return { x: this.x, y: surfaceHeight({ ...this.wave, time: this.t }, this.x, this.z) + 0.04, z: this.z };
  }

  /** Velocidade de deslocamento ao longo da onda (m/s), com a troca de energia na face. */
  get groundSpeed(): number {
    return this.speed * this.energy;
  }

  /** Velocidade na água (m/s) em x e z: a prancha aponta para onde ela vai. */
  velocity(): { x: number; z: number } {
    const vx = this.state === 'paddling' ? this.speed : this.groundSpeed;
    let ds = 0;
    if (this.state === 'dropping') {
      const u = clamp((this.t - this.dropAt!) / DROP_TIME, 0, 1);
      ds = ((this.sTrough - this.sPaddle) * 6 * u * (1 - u)) / DROP_TIME;
    } else if (this.state === 'riding') {
      ds = (this.sLip - this.sTrough) * 0.5 * Math.sin(this.phase) * this.omega() * this.energy;
    }
    // A crista ondula ao longo da onda: a linha acompanha.
    const e = 0.05;
    const w = { ...this.wave, time: this.t };
    const dCrest = (crestOffset(w, this.x + e) - crestOffset(w, this.x - e)) / (2 * e);
    return { x: vx, z: ds + dCrest * vx };
  }

  /**
   * Aceleração lateral (m/s²) da curva na face: negativa curvando para a parede
   * (bottom turn, borda dos dedos), positiva voltando a descer. Inclina a prancha
   * pelo ângulo de equilíbrio atan(a/g).
   */
  lateralAccel(): number {
    if (this.state !== 'riding') return 0;
    const w = this.omega() * this.energy;
    const az = 0.5 * (this.sLip - this.sTrough) * w * w * Math.cos(this.phase);
    const v = this.velocity();
    return (az * v.x) / Math.max(0.5, Math.hypot(v.x, v.z));
  }

  /** Trecho da linha: base (bottom turn), subida, topo (perto do lip) ou descida. */
  lineSegment(): 'base' | 'subida' | 'topo' | 'descida' | null {
    if (this.state !== 'riding') return null;
    const p = ((this.phase % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    if (p < Math.PI * 0.3 || p > Math.PI * 1.75) return 'base';
    if (p < Math.PI * 0.8) return 'subida';
    if (p < Math.PI * 1.2) return 'topo';
    return 'descida';
  }

  update(dt: number) {
    if (dt <= 0) return;
    // Passo fixo: o mesmo resultado a 30 ou a 144 quadros por segundo.
    this.acc += dt;
    const h = 1 / 120;
    while (this.acc >= h - 1e-9) {
      this.acc -= h;
      this.step(h);
    }
  }

  private step(dt: number) {
    this.t += dt;
    switch (this.state) {
      case 'paddling':
        this.speed = PADDLE_SPEED;
        this.x += this.speed * dt;
        // A seção quebrando se aproxima e espera o drop a 11 m (a onda não passa sem o surfista).
        this.wave.breakX0 = this.x - this.paddleGap() - this.wave.peelSpeed * this.t;
        break;
      case 'dropping': {
        // Desce a face: a gravidade dá velocidade até a de cruzeiro.
        const u = clamp((this.t - this.dropAt!) / DROP_TIME, 0, 1);
        const e = u * u * (3 - 2 * u);
        this.s = this.sPaddle + (this.sTrough - this.sPaddle) * e;
        this.speed = PADDLE_SPEED + (this.vCruise - PADDLE_SPEED) * Math.sin((u * Math.PI) / 2);
        this.x += this.speed * dt;
        if (u >= 1) {
          this.state = 'riding';
          this.phase = 0;
          // Altura média da linha (entre a base e o lip), para a troca de energia.
          const w = { ...this.wave, time: this.t };
          const sMid = (this.sLip + this.sTrough) / 2;
          this.hRef = surfaceHeight(w, this.x, crestOffset(w, this.x) + sMid);
        }
        break;
      }
      case 'riding': {
        // W acelera progressivamente até o limite; solto, volta devagar ao cruzeiro.
        if (this.accelerating && this.standing >= 1) {
          this.speed += this.accel * (1 - this.speed / this.vMax) * dt * 2.2;
        } else if (this.speed > this.vCruise) {
          this.speed -= (this.speed - this.vCruise) * 0.35 * dt;
        }
        this.speed = clamp(this.speed, PADDLE_SPEED, this.vMax);
        // Energia: v² = v₀² + 2·g·η·(h_ref − h). Mais lento no alto, mais rápido na base.
        const w = { ...this.wave, time: this.t };
        const hNow = surfaceHeight(w, this.x, this.z);
        this.energy = Math.sqrt(clamp(1 + (2 * 9.81 * 0.55 * (this.hRef - hNow)) / (this.speed * this.speed), 0.55, 1.6));
        this.phase += this.omega() * this.energy * dt;
        this.s = this.sTrough + (this.sLip - this.sTrough) * (0.5 - 0.5 * Math.cos(this.phase));
        this.x += this.groundSpeed * dt;
        // Lento demais, a quebra alcança o surfista.
        if (this.breakGap < 0.8) this.state = 'fallen';
        break;
      }
      default:
        break;
    }
    this.z = crestOffset({ ...this.wave, time: this.t }, this.x) + this.s;
  }
}
