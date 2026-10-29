import { clamp } from '../core/rng';
import type { Judgement } from '../core/types';
import { breakX, faceWidth, surfaceHeight, type WaveState } from './waveField';

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
  /** Fase da linha de subida e descida da face (pico do lip em π). */
  private phase = 0;
  private readonly zPaddle: number;
  private readonly zTrough: number;
  readonly zLip = 0.3;
  readonly vCruise: number;
  readonly vMax: number;
  readonly vMinTakeoff: number;
  private readonly accel: number;

  constructor(readonly wave: WaveState, readonly params: RunParams) {
    const F = faceWidth(wave);
    this.zPaddle = F * 0.45;
    this.zTrough = F * 0.92;
    this.z = this.zPaddle;
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
    const w = this.omega();
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

  /** Aceleração lateral na face (m/s²): negativa subindo para o lip, positiva descendo. Usada para inclinar a prancha. */
  lateralAccel(): number {
    if (this.state !== 'riding') return 0;
    const w = this.omega();
    return 0.5 * (this.zLip - this.zTrough) * w * w * Math.cos(this.phase);
  }

  update(dt: number) {
    if (dt <= 0) return;
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
        this.z = this.zPaddle + (this.zTrough - this.zPaddle) * e;
        this.speed = PADDLE_SPEED + (this.vCruise - PADDLE_SPEED) * Math.sin((u * Math.PI) / 2);
        this.x += this.speed * dt;
        if (u >= 1) {
          this.state = 'riding';
          this.phase = 0;
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
        this.phase += this.omega() * dt;
        this.z = this.zTrough + (this.zLip - this.zTrough) * (0.5 - 0.5 * Math.cos(this.phase));
        this.x += this.speed * dt;
        // Lento demais, a quebra alcança o surfista.
        if (this.breakGap < 0.8) this.state = 'fallen';
        break;
      }
      default:
        break;
    }
  }
}
