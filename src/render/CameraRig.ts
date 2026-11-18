import * as THREE from 'three';
import type { CameraMode } from '../core/save';

// Câmera lateral de acompanhamento: fica do lado da praia, um pouco atrás do
// surfista, e olha para a face da onda. Tudo é amortecido de forma exponencial
// (independente da taxa de quadros). A distância cresce com a altura do aéreo
// para o surfista nunca sair do quadro, e o ponto de pouso continua visível.
//   lateral:  enquadra a onda inteira e o espaço aéreo (padrão)
//   proxima:  mais perto e mais baixa, para ver o corpo e a prancha
//
// Peso da câmera (sensação de velocidade e impacto):
//   - o campo de visão abre com a velocidade da prancha;
//   - a câmera inclina um pouco acompanhando a curva na face;
//   - pop, pouso e queda dão um tranco curto que some sozinho.
// Tudo isso fica desligado quando o sistema pede menos movimento
// (prefers-reduced-motion) ou quando `motion` é falso.

type Preset = { base: number; perWave: number; perHeight: number; height: number; side: number };

/**
 * Câmera didática da tela de treino: mais perto, um pouco mais alta e mais de
 * lado, para ver ao mesmo tempo o corpo, a prancha e o lip. Não substitui a
 * escolha do jogador; só vale enquanto a demonstração está na tela.
 */
const TEACH: Preset = { base: 3.9, perWave: 0.75, perHeight: 1.0, height: 0.8, side: 0.5 };

const PRESETS: Record<CameraMode, Preset> = {
  lateral: { base: 5.8, perWave: 1.1, perHeight: 1.2, height: 1.0, side: 0.32 },
  proxima: { base: 3.6, perWave: 0.6, perHeight: 0.9, height: 0.55, side: 0.42 },
};

/** Graus a mais no campo de visão na velocidade máxima. */
export const FOV_SPEED_GAIN = 7;
/** Velocidade (m/s) em que o campo de visão começa a abrir e em que chega ao máximo. */
const FOV_SPEED_FROM = 5;
const FOV_SPEED_TO = 13;
/** Inclinação máxima na curva (rad, ~2,9°). */
const MAX_ROLL = 0.05;
/** Tranco máximo: rotação (rad) e deslocamento (m). */
const SHAKE_ROT = 0.022;
const SHAKE_POS = 0.09;

const reducedMotion = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Ruído suave e determinístico (soma de senos), em [-1, 1]. */
const wobble = (t: number, seed: number): number =>
  (Math.sin(t * 31.7 + seed * 1.3) * 0.6 + Math.sin(t * 57.1 + seed * 2.9) * 0.3 + Math.sin(t * 91.3 + seed * 4.1) * 0.1);

export class CameraRig {
  mode: CameraMode = 'lateral';
  /** Enquadramento didático (tela de treino). */
  teach = false;
  /** Liga o peso da câmera (campo de visão, inclinação e tranco). */
  motion = !reducedMotion();
  /** Quando definido, substitui o enquadramento (usado pelas cenas de validação). */
  override: ((camera: THREE.PerspectiveCamera) => void) | null = null;
  private pos = new THREE.Vector3(0, 3, 14);
  private look = new THREE.Vector3();
  private distance = 9;
  private initialized = false;
  private want = new THREE.Vector3();
  private wantLook = new THREE.Vector3();
  private readonly baseFov: number;
  private fov: number;
  private roll = 0;
  private trauma = 0;
  private clock = 0;
  private lastZ = 0;
  private vz = 0;
  private az = 0;
  private shakeOff = new THREE.Vector3();

  constructor(private camera: THREE.PerspectiveCamera) {
    this.baseFov = camera.fov;
    this.fov = camera.fov;
  }

  /** Coloca a câmera direto na posição, sem suavização (início de onda). */
  snap(target: THREE.Vector3, waveHeight: number) {
    this.initialized = false;
    this.trauma = 0;
    this.roll = 0;
    this.vz = 0;
    this.az = 0;
    this.fov = this.baseFov;
    this.update(target, 0, waveHeight, 0, false, 0);
  }

  /**
   * Tranco curto (pop, pouso, queda). `amount` de 0 a 1 se soma ao que já
   * existe; a intensidade visível é o quadrado, então trancos pequenos quase
   * não aparecem e os grandes se destacam.
   */
  kick(amount: number) {
    if (!this.motion) return;
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** Intensidade atual do tranco (0 a 1), para testes e depuração. */
  get shake(): number {
    return this.trauma * this.trauma;
  }

  /** Campo de visão atual em graus. */
  get currentFov(): number {
    return this.fov;
  }

  update(target: THREE.Vector3, height: number, waveHeight: number, dt: number, airborne: boolean, speed = 0) {
    if (this.override) {
      this.setFov(this.baseFov);
      this.override(this.camera);
      return;
    }
    const p = this.teach ? TEACH : PRESETS[this.mode];
    const motion = this.motion && !this.teach;

    // Campo de visão: abre com a velocidade (rápido para abrir, devagar para fechar).
    const speedT = THREE.MathUtils.clamp((speed - FOV_SPEED_FROM) / (FOV_SPEED_TO - FOV_SPEED_FROM), 0, 1);
    const wantFov = this.baseFov + (motion ? FOV_SPEED_GAIN * speedT * speedT * (3 - 2 * speedT) : 0);
    if (!this.initialized) this.fov = wantFov;
    else this.fov += (wantFov - this.fov) * (1 - Math.exp(-dt * (wantFov > this.fov ? 2.5 : 1.2)));
    this.setFov(this.fov);

    // Distância mínima para caber o surfista (1,8 m) mais a altura do voo no campo de visão vertical.
    // Usa o campo de visão de base para o enquadramento não "respirar" junto com a velocidade.
    const halfFov = THREE.MathUtils.degToRad(this.baseFov / 2);
    const fit = (height + 2.2) / Math.tan(halfFov) * 0.75;
    const wantDist = Math.max(p.base + waveHeight * p.perWave + height * p.perHeight, fit);
    // A câmera afasta rápido quando o surfista sobe e volta devagar, sem trancos.
    const rate = wantDist > this.distance ? 3 : 1.4;
    const k = 1 - Math.exp(-dt * rate);
    this.distance = this.initialized ? this.distance + (wantDist - this.distance) * k : wantDist;
    this.want.set(
      target.x - this.distance * p.side,
      Math.max(1.5 * p.height + 0.4, waveHeight * 0.6 * p.height + 1.0 * p.height) + height * 0.4,
      Math.max(4.5 * p.height + 1.5, target.z) + this.distance,
    );
    // Olha um pouco à frente e mais abaixo no voo, para o ponto de pouso não sumir.
    this.wantLook.set(target.x + 2.2, Math.max(0.5, target.y * (airborne ? 0.6 : 0.7) + 0.25), target.z - 0.6);
    if (!this.initialized) {
      this.pos.copy(this.want);
      this.look.copy(this.wantLook);
      this.lastZ = target.z;
      this.initialized = true;
    } else {
      const kp = 1 - Math.exp(-dt * 2.2);
      const kl = 1 - Math.exp(-dt * 4);
      this.pos.lerp(this.want, kp);
      this.look.lerp(this.wantLook, kl);
    }

    // Inclinação na curva: a aceleração para dentro e para fora da face (eixo z)
    // vira um pequeno giro do horizonte, como um câmera que acompanha o corpo.
    if (dt > 0) {
      const vz = (target.z - this.lastZ) / dt;
      this.lastZ = target.z;
      const az = (vz - this.vz) / dt;
      this.vz += (vz - this.vz) * (1 - Math.exp(-dt * 8));
      this.az += (az - this.az) * (1 - Math.exp(-dt * 3));
    }
    const wantRoll = motion && !airborne ? THREE.MathUtils.clamp(-this.az * 0.004, -MAX_ROLL, MAX_ROLL) : 0;
    this.roll += (wantRoll - this.roll) * (1 - Math.exp(-dt * 2.5));

    // Tranco: some em ~0,6 s.
    this.clock += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.7);
    const s = this.trauma * this.trauma;
    const t = this.clock;
    this.shakeOff.set(wobble(t, 1), wobble(t, 2), 0).multiplyScalar(SHAKE_POS * s);

    this.camera.position.copy(this.pos).add(this.shakeOff);
    this.camera.lookAt(this.look);
    if (s > 0 || this.roll !== 0) {
      this.camera.rotateZ(this.roll + wobble(t, 3) * SHAKE_ROT * s * 0.6);
      this.camera.rotateX(wobble(t, 4) * SHAKE_ROT * s);
      this.camera.rotateY(wobble(t, 5) * SHAKE_ROT * s * 0.5);
    }
  }

  private setFov(fov: number) {
    if (Math.abs(this.camera.fov - fov) < 1e-3) return;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }
}
