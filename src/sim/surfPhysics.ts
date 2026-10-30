import { clamp } from '../core/rng';
import { breakX, crestOffset, faceWidth, surfaceHeight, type WaveState } from './waveField';

// Física da navegação na face da onda, sem Three.js e com passo fixo.
//
// O surfista é um ponto na face com posição (x ao longo da onda, s a partir da
// crista: 0 no lip, cresce descendo), direção e velocidade. A direção é um
// ângulo no plano da face: 0 segue a onda (+x), +90° sobe direto para o lip,
// −90° desce para a base e 180° volta para a espuma.
//
// Forças ao longo da trajetória:
//   - gravidade na inclinação real da face: descer acelera, subir freia;
//   - empurrão da onda: a face em movimento empurra a prancha, mais forte na
//     parte íngreme e perto da quebra (a parte crítica) e fraco longe dela;
//   - arrasto da água: c₀ + c₂·v², maior fora da face (na base, nos flats);
//   - curva: a borda segura até uma aceleração lateral máxima, então o raio
//     mínimo cresce com a velocidade; cada curva gasta um pouco de velocidade;
//   - bombeada (W): transferência de peso que soma velocidade, mais eficiente
//     na parte alta da face e com retorno decrescente perto do limite.
// Sem tecla, a direção se mantém e a gravidade puxa a linha devagar para baixo.
// Subindo até o lip sem decolar, a borda segura na crista e a prancha
// redireciona para baixo (uma batida natural, que não pontua).

export const G = 9.81;
/** Distância da crista em que fica o lip, onde a decolagem acontece (m). */
export const S_LIP = 0.3;
export const OMEGA_CAP = 3.1;
const C0 = 0.35;
const C2 = 0.032;
const PUSH = 5;
/**
 * Parte da gravidade que vale ao longo da face. No referencial da onda a água
 * sobe a face, carregando a prancha: subir custa menos do que numa rampa parada.
 */
const GRAVITY_ON_FACE = 0.45;
const PUMP = 5.6;
const TURN_DRAG = 0.02;

export interface RiderParams {
  /** Atributos de 0 a 100. */
  forca: number;
  equilibrio: number;
  leituraOnda: number;
  /** Cansaço da bateria (0 a 1): reduz a bombeada. */
  fatigue: number;
  /** Modificadores do equipamento em pontos (prancha + quilhas). */
  equipImpulse: number;
  equipLanding: number;
}

export interface SteerInput {
  aimX: number;
  aimY: number;
  pump: boolean;
  /** Comprimindo: a linha fica travada e as curvas ficam mais abertas. */
  compressing: boolean;
}

function wrap(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** Estado na face. Atualizado por FaceRider.step. */
export class FaceRider {
  x: number;
  s: number;
  dir = 0;
  v: number;
  /** Velocidade de giro (rad/s, + para a esquerda do surfista = borda dos dedos indo para a direita). */
  omega = 0;
  /** Aceleração lateral da curva (m/s²), negativa curvando para a parede. */
  lat = 0;
  /** Velocidade vertical suavizada da prancha (m/s), usada na decolagem. */
  vyFace = 0;
  /** Peso nos pés: −1 todo no pé de trás, +1 no da frente. */
  weight = 0;
  /** Batida no lip neste passo (para spray e som). */
  topTurn = false;
  private lastY: number | null = null;

  constructor(readonly wave: WaveState, readonly params: RiderParams, x: number, s: number, v: number) {
    this.x = x;
    this.s = s;
    this.v = v;
  }

  get vMax(): number {
    return 10.6 + this.params.forca * 0.018 + this.params.equipImpulse * 0.07 + this.wave.power * 0.012;
  }

  height(w: WaveState, x: number, s: number): number {
    return surfaceHeight(w, x, crestOffset(w, x) + s);
  }

  /** Inclinação (dh/dx, dh/ds) da face no ponto atual. */
  slope(w: WaveState): { hx: number; hs: number } {
    const e = 0.05;
    return {
      hx: (this.height(w, this.x + e, this.s) - this.height(w, this.x - e, this.s)) / (2 * e),
      hs: (this.height(w, this.x, this.s + e) - this.height(w, this.x, this.s - e)) / (2 * e),
    };
  }

  /** Distância até a quebra (m). */
  breakGap(w: WaveState): number {
    return this.x - breakX(w);
  }

  /** Parte crítica (0 a 1): perto do lip e perto da quebra. */
  criticality(w: WaveState): number {
    const F = faceWidth(w);
    const nearLip = 1 - clamp((this.s - S_LIP) / (F * 0.55), 0, 1);
    const pocket = Math.exp(-Math.max(0, this.breakGap(w) - 2) / 12);
    return clamp(nearLip * (0.35 + 0.65 * pocket), 0, 1);
  }

  /** Quanto o ponto está na face útil (0 fora, 1 no meio). */
  onFace(w: WaveState): number {
    const F = faceWidth(w);
    const sm = (a: number, b: number, v: number) => {
      const t = clamp((v - a) / (b - a), 0, 1);
      return t * t * (3 - 2 * t);
    };
    return sm(0, F * 0.18, this.s) * (1 - sm(F * 0.8, F * 1.15, this.s));
  }

  step(dt: number, time: number, inp: SteerInput) {
    const w = { ...this.wave, time };
    const F = faceWidth(w);
    const p = this.params;
    const { hx, hs } = this.slope(w);
    const ux = Math.cos(this.dir);
    const uy = Math.sin(this.dir); // + subindo (s diminuindo)
    // Inclinação ao longo da trajetória: s cresce descendo, então subir é −s.
    const dhdl = hx * ux - hs * uy;
    const aGrav = (-G * GRAVITY_ON_FACE * dhdl) / Math.sqrt(1 + dhdl * dhdl);
    const face = this.onFace(w);
    const steep = clamp(-hs, 0, 1.3);
    const gap = this.breakGap(w);
    const pocket = 0.4 + 0.6 * Math.exp(-Math.max(0, gap - 3) / 16);
    const read = 0.9 + p.leituraOnda / 500;
    const powerK = 0.75 + w.power / 200;
    // A face empurra para onde a prancha aponta; voltando para a espuma, empurra menos.
    const push = PUSH * powerK * read * face * steep * pocket * (ux > -0.2 ? 1 : 0.45);

    // Curva: controlador proporcional até o giro máximo que a borda aguenta.
    const aLatMax = 15.5 + p.equilibrio * 0.05 + p.equipLanding * 0.15;
    const turnMax = Math.min(OMEGA_CAP, aLatMax / Math.max(2.2, this.v)) * (inp.compressing ? 0.55 : 1);
    let omega: number;
    if (inp.aimX !== 0 || inp.aimY !== 0) {
      const target = Math.atan2(inp.aimY, inp.aimX);
      omega = clamp(wrap(target - this.dir) * 7, -turnMax, turnMax);
    } else {
      // A componente lateral da gravidade puxa a linha para baixo da face.
      const latDown = hx * -uy + hs * ux; // gradiente lateral (+ = esquerda mais baixa)
      omega = clamp((-G * latDown * 0.32) / Math.max(3, this.v), -0.9, 0.9);
    }
    // A mudança de giro tem inércia (a borda entra e sai da água aos poucos).
    this.omega += (omega - this.omega) * (1 - Math.exp(-dt * 14));

    // Lip: sem decolar, a borda segura na crista e a prancha redireciona para baixo.
    this.topTurn = false;
    if (this.s <= S_LIP && uy > 0) {
      // Indo para a direita, descer é girar no sentido horário; indo para a esquerda, no anti-horário.
      this.omega = ux >= 0 ? Math.min(this.omega, -turnMax * 1.15) : Math.max(this.omega, turnMax * 1.15);
      this.topTurn = true;
    }
    // Base e flats: a prancha volta naturalmente para a onda.
    if (this.s > F * 1.05 && uy < 0.2) {
      const up = ux >= 0 ? 1 : -1;
      this.omega += up * clamp((this.s - F * 1.05) * 1.5, 0, 1.6) * dt * 20;
      this.omega = clamp(this.omega, -turnMax, turnMax);
    }
    this.dir = wrap(this.dir + this.omega * dt);
    this.lat = -this.v * this.omega;

    // Velocidade
    let aPump = 0;
    if (inp.pump && !inp.compressing) {
      const where = 0.55 + 0.45 * clamp(1 - this.s / (F * 0.9), 0, 1);
      aPump = PUMP * (1 - p.fatigue * 0.35) * (0.85 + p.forca / 300) * where * face * clamp(1 - this.v / this.vMax, 0, 1) * (1 - 0.5 * Math.abs(this.omega) / OMEGA_CAP);
    }
    const flats = this.s > F * 0.95 ? 0.9 * clamp((this.s - F * 0.95) / F, 0, 1) : 0;
    const drag = C0 + C2 * this.v * this.v + flats * this.v * 0.25;
    const turnDrag = TURN_DRAG * Math.abs(this.lat) + (this.topTurn ? 0.5 : 0);
    this.v = clamp(this.v + (aGrav + push + aPump - drag - turnDrag) * dt, 0.6, this.vMax * 1.12);

    // Posição
    this.x += this.v * Math.cos(this.dir) * dt;
    this.s -= this.v * Math.sin(this.dir) * dt;
    this.s = clamp(this.s, S_LIP - 0.08, F * 1.6);

    // Peso: curva fechada e compressão carregam o pé de trás; bombeada e reta, o da frente.
    const turnLoad = Math.abs(this.omega) / OMEGA_CAP;
    const wTarget = clamp(0.15 - turnLoad * 0.8 - (inp.compressing ? 0.45 : 0) + (inp.pump ? 0.3 : 0), -1, 1);
    this.weight += (wTarget - this.weight) * (1 - Math.exp(-dt * 8));

    const y = this.height(w, this.x, this.s);
    if (this.lastY !== null && dt > 0) {
      const vy = (y - this.lastY) / dt;
      this.vyFace += (vy - this.vyFace) * (1 - Math.exp(-dt / 0.12));
    }
    this.lastY = y;
  }
}
