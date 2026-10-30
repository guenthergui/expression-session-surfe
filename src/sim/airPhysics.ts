import { clamp } from '../core/rng';
import type { GrabKey, SurferInput } from '../core/controls';
import { crestOffset, faceWidth, surfaceHeight, type WaveState } from './waveField';
import type { Launch } from './takeoff';

// Execução do aéreo: voo e controle ativo do corpo, sem Three.js.
//
// Translação: o centro de massa segue a balística (gravidade 9,81 m/s²). Ao
// longo da onda (x) e na vertical (y) é balística pura; na direção da praia a
// posição é medida a partir da crista, que continua se movendo: a onda alcança
// o surfista no voo e o pouso acontece na parte alta da face.
//
// Rotação: cada eixo tem um momento angular L e a velocidade angular é
// ω = L / I. O momento de inércia I depende da pose: encolhido no grab gira
// mais rápido, aberto (Christ, Superman) gira mais devagar.
//   - giro (yaw, + frontside): começa com a carga da compressão; ← e → somam
//     impulso, forte logo depois do pop (o corpo ainda empurra a prancha) e
//     fraco depois; a tecla oposta freia, sem inverter;
//   - flip (+ para trás): só começa com ↑ apertado depois do pop e precisa de
//     impulso cedo (a cabeça vai para trás logo na saída);
//   - preparar o pouso (↓) estende as pernas, nivela a prancha e realinha até
//     ~70°, mas também segura o giro: apertado cedo demais, mata a rotação.
// Grabs e extensões levam um tempo para a mão alcançar a borda e precisam ser
// soltos antes de tocar a água. No Varial, só a prancha gira, sob os pés.

export const AIR_G = 9.81;
export const VARIAL_TIME = 0.5;
/** Grau mínimo para o pouso de costas (fakie) contar como intenção de giro. */
export const FAKIE_MIN = 140;

export type BodyExtension = 'christ' | 'superman' | 'superwoman';

export interface AirParams {
  rotacao: number;
  controleAereo: number;
  /** Prancha + quilhas, fases de rotação e grab (pontos). */
  equipRotation: number;
  equipGrab: number;
}

export interface GrabState {
  amount: number;
  /** Tempo com a mão firme na borda (s). */
  held: number;
  /** Tempo com a tecla segurada (s), para o tweak (Japan). */
  pressed: number;
  maxAmount: number;
}

export interface AirRecord {
  launch: Launch;
  airTime: number;
  /** Altura máxima do centro de massa acima do ponto de decolagem (m). */
  apex: number;
  distance: number;
  yaw: number;
  flip: number;
  /** Maior giro durante o voo (graus, em módulo) e o valor com sinal nesse instante. */
  maxYaw: number;
  peakYaw: number;
  grabs: Record<GrabKey, number>;
  /** Grab Air segurado o bastante para virar Japan. */
  japan: boolean;
  ext: Record<BodyExtension, number>;
  varial: boolean;
  /** Varial ou pés fora da prancha no toque. */
  feetOffAtTouch: number;
  grabAtTouch: number;
  prepAtTouch: number;
  /** Segundos de ↓ antes do toque. */
  prepTime: number;
  /** Trocas de sentido do giro no ar (falta de controle). */
  reversals: number;
  landedBehind: boolean;
  /** Velocidade vertical no toque (m/s, negativa descendo). */
  vyTouch: number;
  /** Distância do toque até a crista (m). */
  sTouch: number;
  faceWidth: number;
}

export function emptyGrabs(): Record<GrabKey, GrabState> {
  const g = (): GrabState => ({ amount: 0, held: 0, pressed: 0, maxAmount: 0 });
  return { indy: g(), mute: g(), method: g(), stalefish: g(), tail: g() };
}

const GRAB_KEYS: GrabKey[] = ['indy', 'mute', 'method', 'stalefish', 'tail'];

export class AirBody {
  t = 0;
  x: number;
  y: number;
  s: number;
  readonly vx: number;
  readonly vy0: number;
  private readonly vs0: number;
  private readonly as: number;
  yaw = 0;
  flip = 0;
  /** Giro só da prancha, relativo ao corpo (Varial), em graus. */
  varial = 0;
  yawL: number;
  flipL = 0;
  inertia = 1;
  grabs = emptyGrabs();
  ext: Record<BodyExtension, number> = { christ: 0, superman: 0, superwoman: 0 };
  extHeld: Record<BodyExtension, number> = { christ: 0, superman: 0, superwoman: 0 };
  feetOff = 0;
  prep = 0;
  private prepTime = 0;
  private varialT: number | null = null;
  private extendWas = false;
  private lastSpin = 0;
  private reversals = 0;
  private maxYaw = 0;
  private peakYaw = 0;
  private apexY: number;
  private readonly launchY: number;
  private readonly launchS: number;
  /** Maior tempo segurando o Grab Air de uma vez: depois de 0,45 s o tweak vira Japan. */
  private japanMax = 0;
  readonly yawMax: number;
  readonly flipMax: number;
  private readonly ctrl: number;
  private readonly reach: number;

  constructor(
    readonly wave: WaveState,
    readonly launch: Launch,
    readonly launchTime: number,
    x: number,
    y: number,
    s: number,
    readonly params: AirParams,
  ) {
    this.x = x;
    this.y = y;
    this.s = s;
    this.apexY = y;
    this.launchY = y;
    this.launchS = s;
    this.vx = launch.vx;
    this.vy0 = launch.vy;
    this.vs0 = launch.vs;
    this.ctrl = 0.75 + params.controleAereo / 200;
    this.yawMax = 430 + params.rotacao * 3 + params.equipRotation * 14;
    this.flipMax = 360 + params.rotacao * 2 + params.equipRotation * 8;
    this.yawL = launch.windup * this.yawMax;
    this.reach = clamp(0.2 - params.controleAereo * 0.0008 - params.equipGrab * 0.004, 0.11, 0.24);
    // A onda alcança a prancha: escolhe a aceleração em s para o pouso cair na parte alta da face.
    const F = faceWidth(wave);
    const climb = Math.sin(clamp((launch.approachDeg * Math.PI) / 180, 0, Math.PI / 2));
    const sLand = F * (0.24 + 0.14 * (1 - climb));
    let T = (2 * this.vy0) / AIR_G + 0.15;
    let as = 0;
    for (let i = 0; i < 4; i++) {
      as = (2 * (sLand - s - this.vs0 * T)) / (T * T);
      const xL = x + this.vx * T;
      const w = { ...wave, time: launchTime + T };
      const hL = surfaceHeight(w, xL, crestOffset(w, xL) + sLand) + 0.04;
      // y(T) = hL → T = (vy + √(vy² + 2g(y − hL))) / g
      const disc = this.vy0 * this.vy0 + 2 * AIR_G * (y - hL);
      T = (this.vy0 + Math.sqrt(Math.max(0, disc))) / AIR_G;
    }
    this.as = as;
  }

  get vy(): number {
    return this.vy0 - AIR_G * this.t;
  }

  /** Velocidade de giro atual (graus/s). */
  get yawRate(): number {
    return this.yawL / this.inertia;
  }

  get flipRate(): number {
    return this.flipL / this.inertia;
  }

  get vs(): number {
    return this.vs0 + this.as * this.t;
  }

  /** Grab mais firme no momento (id e quanto). */
  activeGrab(): { id: GrabKey; amount: number } | null {
    let best: { id: GrabKey; amount: number } | null = null;
    for (const k of GRAB_KEYS) {
      const a = this.grabs[k].amount;
      if (a > 0.02 && (!best || a > best.amount)) best = { id: k, amount: a };
    }
    return best;
  }

  /** Extensão mais forte no momento. */
  activeExt(): { id: BodyExtension; amount: number } | null {
    let best: { id: BodyExtension; amount: number } | null = null;
    for (const k of Object.keys(this.ext) as BodyExtension[]) {
      const a = this.ext[k];
      if (a > 0.02 && (!best || a > best.amount)) best = { id: k, amount: a };
    }
    return best;
  }

  get varialProgress(): number | null {
    return this.varialT === null ? null : clamp(this.varialT / VARIAL_TIME, 0, 1);
  }

  /** Estimativa do tempo até tocar a água (s), para a animação preparar o pouso. */
  timeToTouch(): number {
    let tt = 0.3;
    for (let i = 0; i < 4; i++) {
      const T = this.t + tt;
      const xL = this.x + this.vx * tt;
      const sL = this.s + this.vs * tt + 0.5 * this.as * tt * tt;
      const w = { ...this.wave, time: this.launchTime + T };
      const hL = surfaceHeight(w, xL, crestOffset(w, xL) + sL) + 0.04;
      const vy = this.vy;
      const disc = vy * vy + 2 * AIR_G * (this.y - hL);
      tt = Math.max(0, (vy + Math.sqrt(Math.max(0, disc))) / AIR_G);
    }
    return tt;
  }

  /** Avança o voo. Retorna true no instante em que a prancha toca a água. */
  step(dt: number, inp: SurferInput): boolean {
    this.t += dt;
    const t = this.t;
    const ctrl = this.ctrl;

    // Grabs: a mão leva um tempo para chegar à borda e um pouco menos para soltar.
    for (const k of GRAB_KEYS) {
      const g = this.grabs[k];
      // Durante o Varial os pés chutam a prancha e as mãos ficam livres.
      const on = inp.grabs[k] && this.varialT === null;
      g.pressed = on ? g.pressed + dt : 0;
      g.amount = clamp(g.amount + (on ? dt / this.reach : -dt / 0.12), 0, 1);
      if (g.amount > 0.85) g.held += dt;
      g.maxAmount = Math.max(g.maxAmount, g.amount);
    }
    this.japanMax = Math.max(this.japanMax, this.grabs.mute.pressed);
    const indy = this.grabs.indy.amount;
    const front = this.grabs.mute.amount;

    // Extensões (S): dependem de qual mão já segura a prancha.
    const extendPress = inp.extend && !this.extendWas;
    this.extendWas = inp.extend;
    const want: BodyExtension | null = !inp.extend ? null : indy > 0.6 && front > 0.6 ? 'superman' : indy > 0.6 ? 'christ' : front > 0.6 ? 'superwoman' : null;
    for (const k of Object.keys(this.ext) as BodyExtension[]) {
      const on = want === k;
      this.ext[k] = clamp(this.ext[k] + (on ? dt / 0.16 : -dt / 0.2), 0, 1);
      if (this.ext[k] > 0.7) this.extHeld[k] += dt;
    }
    // Varial: S sem grab chuta a prancha, que gira uma volta sob os pés.
    if (extendPress && !want && this.varialT === null && this.activeGrab() === null) this.varialT = 0;
    let feet = Math.max(this.ext.superman, this.ext.superwoman);
    if (this.varialT !== null) {
      this.varialT += dt;
      const u = clamp(this.varialT / VARIAL_TIME, 0, 1);
      this.varial = 360 * (u * u * (3 - 2 * u));
      feet = Math.max(feet, Math.sin(Math.PI * u) * 0.9);
    }
    this.feetOff = feet;

    // Preparação do pouso
    this.prep = clamp(this.prep + (inp.prep ? dt * 7 : -dt * 4), 0, 1);
    if (inp.prep) this.prepTime += dt;

    // Inércia pela pose: encolhido gira mais rápido, aberto mais devagar.
    const grabSum = Math.min(1, Math.max(...GRAB_KEYS.map((k) => this.grabs[k].amount)));
    const open = Math.max(this.ext.christ, this.ext.superman, this.ext.superwoman);
    const tuck = this.flipL > 60 ? 0.5 : 0;
    this.inertia = clamp(1 - 0.24 * grabSum - 0.12 * tuck + 0.38 * open + 0.1 * this.prep, 0.62, 1.45);

    // Giro
    const throwK = t < 0.3 ? 1 : 0.32;
    const tau = 980 * ctrl * throwK;
    if (inp.spin !== 0) {
      if (Math.sign(inp.spin) !== this.lastSpin && this.lastSpin !== 0) this.reversals++;
      this.lastSpin = Math.sign(inp.spin);
      if (this.yawL === 0 || Math.sign(this.yawL) === Math.sign(inp.spin)) {
        this.yawL = clamp(this.yawL + inp.spin * tau * dt, -this.yawMax * 1.3, this.yawMax * 1.3);
      } else {
        const b = 1300 * ctrl * dt;
        this.yawL = Math.abs(this.yawL) <= b ? 0 : this.yawL - Math.sign(this.yawL) * b;
      }
    }

    // Flip: ↑ só funciona cedo de verdade; depois quase não muda o giro.
    if (inp.flip) {
      const k = t < 0.45 ? 1 : 0.25;
      this.flipL = clamp(this.flipL + 1150 * ctrl * k * dt, 0, this.flipMax * 1.2);
    }

    // Preparar o pouso: segura o giro e realinha com as pernas.
    if (this.prep > 0.05) {
      const damp = Math.exp(-dt * 3.2 * this.prep);
      this.yawL *= damp;
      this.flipL *= damp;
      const yawTarget = this.landableYaw();
      const err = yawTarget - this.yaw;
      // Sem giro de verdade (Frontside e Backside Air), as pernas trazem a prancha de volta de mais longe.
      const reach = this.maxYaw < FAKIE_MIN ? 125 : 70;
      if (Math.abs(err) < reach) this.yaw += clamp(err * 7, -260, 260) * ctrl * this.prep * dt;
      const flipTarget = Math.round(this.flip / 360) * 360;
      const ferr = flipTarget - this.flip;
      if (Math.abs(ferr) < 55) this.flip += clamp(ferr * 6, -200, 200) * ctrl * this.prep * dt;
    }

    this.yaw += (this.yawL / this.inertia) * dt;
    this.flip += (this.flipL / this.inertia) * dt;
    if (Math.abs(this.yaw) > this.maxYaw) {
      this.maxYaw = Math.abs(this.yaw);
      this.peakYaw = this.yaw;
    }

    // Translação
    this.x += this.vx * dt;
    this.y = this.launchY + this.vy0 * t - 0.5 * AIR_G * t * t;
    this.s = this.launchS + this.vs0 * t + 0.5 * this.as * t * t;
    this.apexY = Math.max(this.apexY, this.y);
    if (t < 0.12 || this.vy > 0) return false;
    const w = { ...this.wave, time: this.launchTime + t };
    const water = surfaceHeight(w, this.x, crestOffset(w, this.x) + this.s) + 0.04;
    return this.y <= water;
  }

  /** Orientação de pouso mais próxima: frente (múltiplos de 360) ou de costas, se houve giro de verdade. */
  landableYaw(): number {
    const step = Math.abs(this.yaw) >= FAKIE_MIN || this.maxYaw >= FAKIE_MIN ? 180 : 360;
    return Math.round(this.yaw / step) * step;
  }

  /** Posição z no mundo. */
  z(time: number): number {
    const w = { ...this.wave, time };
    return crestOffset(w, this.x) + this.s;
  }

  record(): AirRecord {
    const g = this.grabs;
    const active = this.activeGrab();
    return {
      launch: this.launch,
      airTime: this.t,
      apex: this.apexY - this.launchY,
      distance: Math.abs(this.vx) * this.t,
      yaw: this.yaw,
      flip: this.flip,
      maxYaw: this.maxYaw,
      peakYaw: this.peakYaw,
      grabs: { indy: g.indy.held, mute: g.mute.held, method: g.method.held, stalefish: g.stalefish.held, tail: g.tail.held },
      japan: g.mute.held > 0.2 && this.japanMax >= 0.45,
      ext: { ...this.extHeld },
      varial: this.varialT !== null && this.varialT >= VARIAL_TIME * 0.9,
      feetOffAtTouch: this.varialT !== null && this.varialT < VARIAL_TIME ? 1 : this.feetOff,
      grabAtTouch: active?.amount ?? 0,
      prepAtTouch: this.prep,
      prepTime: this.prepTime,
      reversals: this.reversals,
      landedBehind: this.s < -0.15,
      vyTouch: this.vy,
      sTouch: this.s,
      faceWidth: faceWidth(this.wave),
    };
  }

  get japanTweak(): number {
    const p = this.grabs.mute.pressed;
    return clamp((p - 0.35) / 0.2, 0, 1) * this.grabs.mute.amount;
  }
}
