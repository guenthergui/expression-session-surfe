import * as THREE from 'three';
import type { CameraMode } from '../core/save';

// Câmera lateral de acompanhamento: fica do lado da praia, um pouco atrás do
// surfista, e olha para a face da onda. Tudo é amortecido de forma exponencial
// (independente da taxa de quadros). A distância cresce com a altura do aéreo
// para o surfista nunca sair do quadro, e o ponto de pouso continua visível.
//   lateral:  enquadra a onda inteira e o espaço aéreo (padrão)
//   proxima:  mais perto e mais baixa, para ver o corpo e a prancha

const PRESETS: Record<CameraMode, { base: number; perWave: number; perHeight: number; height: number; side: number }> = {
  lateral: { base: 5.8, perWave: 1.1, perHeight: 1.2, height: 1.0, side: 0.32 },
  proxima: { base: 3.6, perWave: 0.6, perHeight: 0.9, height: 0.55, side: 0.42 },
};

export class CameraRig {
  mode: CameraMode = 'lateral';
  /** Quando definido, substitui o enquadramento (usado pelas cenas de validação). */
  override: ((camera: THREE.PerspectiveCamera) => void) | null = null;
  private pos = new THREE.Vector3(0, 3, 14);
  private look = new THREE.Vector3();
  private distance = 9;
  private initialized = false;
  private want = new THREE.Vector3();
  private wantLook = new THREE.Vector3();

  constructor(private camera: THREE.PerspectiveCamera) {}

  /** Coloca a câmera direto na posição, sem suavização (início de onda). */
  snap(target: THREE.Vector3, waveHeight: number) {
    this.initialized = false;
    this.update(target, 0, waveHeight, 0, false);
  }

  update(target: THREE.Vector3, height: number, waveHeight: number, dt: number, airborne: boolean) {
    if (this.override) {
      this.override(this.camera);
      return;
    }
    const p = PRESETS[this.mode];
    // Distância mínima para caber o surfista (1,8 m) mais a altura do voo no campo de visão vertical.
    const halfFov = THREE.MathUtils.degToRad(this.camera.fov / 2);
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
      this.initialized = true;
    } else {
      const kp = 1 - Math.exp(-dt * 2.2);
      const kl = 1 - Math.exp(-dt * 4);
      this.pos.lerp(this.want, kp);
      this.look.lerp(this.wantLook, kl);
    }
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
  }
}
