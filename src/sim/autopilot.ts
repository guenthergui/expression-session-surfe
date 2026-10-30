import { clamp } from '../core/rng';
import { emptyInput, type GrabKey, type SurferInput } from '../core/controls';
import type { ManeuverDef } from '../core/types';
import { S_LIP } from './surfPhysics';
import { faceWidth } from './waveField';
import type { WaveRun } from './waveRun';

// Piloto automático: aperta as mesmas "teclas" que o jogador para executar um
// aéreo da ficha. Serve para a demonstração dos menus, para as cenas do lab e
// para os testes do sistema inteiro (aproximação, pop, controle no ar e pouso).
// Ele não tem atalhos: usa só a intenção (SurferInput) e lê o estado da onda.

export interface PilotPlan {
  /** Giro alvo em graus (+ frontside, − backside). */
  yaw: number;
  /** Para Frontside e Backside Air: gira até o pico e realinha. */
  peakOnly: boolean;
  flip: boolean;
  grab: GrabKey | null;
  /** Segurar o Grab Air até virar Japan. */
  japan: boolean;
  extension: 'christ' | 'superman' | 'superwoman' | 'varial' | null;
  /** Ângulo de ataque desejado (graus de subida). */
  approach: number;
  minSpeed: number;
  /** Erro de propósito, para as cenas do lab: pousar segurando o grab ou girar de menos. */
  mistake?: 'instavel' | 'queda';
}

export function planFor(def: ManeuverDef): PilotPlan {
  const sign = def.direction === 'backside' ? -1 : 1;
  let yaw = 0;
  let peakOnly = false;
  if (def.id === 'fs-air' || def.id === 'bs-air') {
    yaw = 85 * sign;
    peakOnly = true;
  } else if (def.axis === 'giro') yaw = def.rotation * sign;
  else if (def.axis === 'rodeo') yaw = -180;
  const grab: GrabKey | null = def.extension === 'superman' || def.extension === 'christ' ? 'indy'
    : def.extension === 'superwoman' ? 'mute'
      : def.grab === 'japan' ? 'mute'
        : (def.grab as GrabKey | null);
  return {
    yaw,
    peakOnly,
    flip: def.axis === 'flip' || def.axis === 'rodeo',
    grab,
    japan: def.grab === 'japan',
    extension: def.extension,
    approach: (def.approach[0] + def.approach[1]) / 2,
    minSpeed: def.minSpeed,
  };
}

export class AutoPilot {
  /** Momento em que o piloto aperta D. */
  dropAt = 0.8;
  private phase: 'speed' | 'descend' | 'approach' | 'compress' | 'air' | 'recover' = 'speed';
  private flipping = false;
  private extPressedAt: number | null = null;
  /** Quantos aéreos o piloto já tentou nesta onda. */
  attempts = 0;
  /** Só tenta até este número de aéreos (Infinity = enquanto a onda durar). */
  maxAttempts = Infinity;

  constructor(public plan: PilotPlan) {}

  setPlan(plan: PilotPlan) {
    this.plan = plan;
  }

  input(run: WaveRun): SurferInput {
    const inp = emptyInput();
    const p = this.plan;
    if (run.state === 'paddling') {
      if (run.t >= this.dropAt) run.pressDrop();
      return inp;
    }
    if (run.state === 'dropping' || run.state === 'fallen') return inp;
    const F = faceWidth(run.waveNow);
    if (run.state === 'airborne') return this.airInput(run, inp);
    if (this.phase === 'air') {
      this.phase = 'recover';
      this.flipping = false;
      this.extPressedAt = null;
    }
    const r = run.rider!;
    const s = r.s;
    const done = this.attempts >= this.maxAttempts;
    if (this.phase === 'recover' && !run.recovering) this.phase = 'speed';
    // Linha média com bombeada até ter a velocidade da ficha.
    if (this.phase === 'recover' || this.phase === 'speed' || done) {
      inp.pump = true;
      const target = F * 0.5;
      inp.aimX = 1;
      inp.aimY = clamp((s - target) * 0.9, -0.6, 0.6);
      const gapOk = run.breakGap > 3.5;
      if (!done && this.phase === 'speed' && run.canCompress && r.v >= p.minSpeed + 0.5 && gapOk && run.standing >= 1) this.phase = 'descend';
      return inp;
    }
    if (this.phase === 'descend') {
      // Desce para ganhar espaço e velocidade antes da cavada.
      inp.aimX = 1;
      inp.aimY = -0.9;
      inp.pump = true;
      // Quanto mais vertical a subida, mais fundo começa a cavada.
      if (s > F * (0.42 + 0.3 * (p.approach / 90))) this.phase = 'approach';
      return inp;
    }
    const a = (p.approach * Math.PI) / 180;
    inp.aimX = Math.cos(a);
    inp.aimY = Math.sin(a);
    if (this.phase === 'approach') {
      if (s < S_LIP + 1.7 && Math.sin(r.dir) > 0.15) this.phase = 'compress';
      return inp;
    }
    // Compressão: carrega o giro e solta logo abaixo do lip.
    inp.compress = true;
    if (Math.abs(p.yaw) >= 140 && !p.peakOnly) inp.spin = Math.sign(p.yaw);
    if (s <= S_LIP + 0.14) {
      inp.compress = false;
      this.phase = 'air';
      this.attempts++;
    }
    return inp;
  }

  private airInput(run: WaveRun, inp: SurferInput): SurferInput {
    const a = run.air!;
    const p = this.plan;
    this.phase = 'air';
    const tt = a.timeToTouch();
    const tAir = a.t;
    // Giro: controle em malha fechada sobre o giro previsto no toque.
    if (p.yaw !== 0) {
      const sign = Math.sign(p.yaw);
      const predicted = a.yaw + a.yawRate * Math.max(0, tt - 0.05);
      const want = Math.abs(p.yaw) - (p.mistake === 'queda' ? 90 : 0);
      if (p.peakOnly) {
        if (Math.abs(a.yaw) < want * 0.75 && tt > 0.35) inp.spin = sign;
        else if (Math.abs(a.yawRate) > 30) inp.spin = -Math.sign(a.yawRate);
      } else if (sign * predicted < want - 12) inp.spin = sign;
      else if (sign * predicted > want + 25) inp.spin = -sign;
    }
    // Flip: ↑ cedo até a volta prevista fechar.
    if (p.flip) {
      const predicted = a.flip + a.flipRate * tt;
      if (tAir < 0.5 && predicted < 355) this.flipping = true;
      else if (predicted >= 355) this.flipping = false;
      inp.flip = this.flipping;
    }
    const releaseAt = 0.3;
    // Grab Air é curto; segurado demais vira Japan.
    const holdEnd = p.grab === 'mute' && !p.japan && !p.extension ? 0.42 : Infinity;
    const release = p.mistake === 'instavel' ? 0 : releaseAt;
    if (p.grab && tAir > 0.12 && tAir < holdEnd && tt > release) inp.grabs[p.grab] = true;
    if (p.extension === 'superman' && tAir > 0.12 && tt > releaseAt) inp.grabs.mute = true;
    if (p.extension === 'varial') {
      if (tAir > 0.1 && this.extPressedAt === null) this.extPressedAt = tAir;
      inp.extend = this.extPressedAt !== null && tAir - this.extPressedAt < 0.1;
    } else if (p.extension) {
      inp.extend = tAir > 0.27 && tt > 0.38;
    }
    inp.prep = !p.mistake && tt < (p.peakOnly ? 0.45 : p.flip ? 0.28 : 0.3);
    return inp;
  }
}
