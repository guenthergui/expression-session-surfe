import * as THREE from 'three';
import { sprayTexture } from './textures';

// Spray e espuma com um único sistema de partículas reutilizado (sem criar
// objetos a cada quadro). O vento empurra as gotas e a gravidade as derruba.
//
// Dois tipos de partícula no mesmo sistema:
//   gota  — pequena e nítida, cai rápido; forma o leque e os respingos;
//   névoa — grande, quase transparente, flutua e cresce; é o borrifo fino que
//           fica no ar depois de uma batida, de um pouso ou soprado da crista.

export const DROP = 0;
export const MIST = 1;
export type SprayKind = typeof DROP | typeof MIST;

const tmpSide = new THREE.Vector3();
const tmpDir = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class Spray {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private size: Float32Array;
  private alpha: Float32Array;
  private kind: Float32Array;
  private seed: Float32Array;
  private next = 0;
  wind = new THREE.Vector3();

  constructor(scene: THREE.Scene, private count: number) {
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count).fill(1);
    this.size = new Float32Array(count);
    this.alpha = new Float32Array(count);
    this.kind = new Float32Array(count);
    this.seed = new Float32Array(count);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    g.setAttribute('kind', new THREE.BufferAttribute(this.kind, 1));
    g.setAttribute('seed', new THREE.BufferAttribute(this.seed, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: sprayTexture() }, scale: { value: 600 }, tint: { value: new THREE.Color(2.4, 2.5, 2.6) } },
      vertexShader: `
        attribute float size;
        attribute float alpha;
        attribute float kind;
        attribute float seed;
        varying float vAlpha;
        varying float vKind;
        varying float vSeed;
        uniform float scale;
        void main() {
          vAlpha = alpha;
          vKind = kind;
          vSeed = seed;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * scale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D map;
        uniform vec3 tint;
        varying float vAlpha;
        varying float vKind;
        varying float vSeed;
        float sHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float sNoise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p); vec2 w = f * f * (3.0 - 2.0 * f);
          return mix(mix(sHash(i), sHash(i + vec2(1.0, 0.0)), w.x), mix(sHash(i + vec2(0.0, 1.0)), sHash(i + vec2(1.0, 1.0)), w.x), w.y);
        }
        void main() {
          vec2 uv = gl_PointCoord;
          float r = length(uv - 0.5) * 2.0;
          float a;
          vec3 col = tint;
          if (vKind < 0.5) {
            // Gota: núcleo pequeno e nítido com um brilho de borda suave.
            a = (1.0 - smoothstep(0.25, 0.55, r)) + (1.0 - smoothstep(0.4, 1.0, r)) * 0.25;
          } else {
            // Névoa: nuvem irregular (ruído) e bem transparente, um pouco mais azulada.
            vec2 q = uv * 3.0 + vSeed * 17.0;
            float n = sNoise(q) * 0.6 + sNoise(q * 2.3 + 4.0) * 0.4;
            a = (1.0 - smoothstep(0.2, 1.0, r)) * smoothstep(0.25, 0.75, n + 0.25 * (1.0 - r));
            col *= vec3(0.92, 0.97, 1.0);
          }
          gl_FragColor = vec4(col, a * vAlpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  /** Gotas tomam a cor da luz do local (douradas ao entardecer), com o mesmo tone mapping da cena. */
  setLight(sun: THREE.Color, sky: THREE.Color, sunIntensity: number, exposure: number) {
    const tint = (this.points.material as THREE.ShaderMaterial).uniforms.tint.value as THREE.Color;
    tint.copy(sun).multiplyScalar(sunIntensity * 0.32).add(sky.clone().multiplyScalar(0.35)).multiplyScalar(0.9 / Math.max(0.05, exposure) / 1.7);
  }

  setScale(viewportHeight: number) {
    (this.points.material as THREE.ShaderMaterial).uniforms.scale.value = viewportHeight * 0.9;
  }

  /** Quantas partículas estão vivas (para testes e depuração). */
  get alive(): number {
    let n = 0;
    for (let k = 0; k < this.count; k++) if (this.life[k] > 0) n++;
    return n;
  }

  emit(p: THREE.Vector3, dir: THREE.Vector3, n: number, speed: number, spread: number, size: number, life: number, kind: SprayKind = DROP) {
    for (let i = 0; i < n; i++) {
      const s = speed * (0.5 + Math.random() * 0.7);
      this.spawn(
        p,
        dir.x * s + (Math.random() - 0.5) * spread,
        dir.y * s + Math.random() * spread,
        dir.z * s + (Math.random() - 0.5) * spread,
        size * (0.5 + Math.random()),
        life * (0.6 + Math.random() * 0.6),
        kind,
      );
    }
  }

  /**
   * Leque: a água sai da borda da prancha como uma cortina aberta para os
   * lados. `back` é a direção principal (para trás e para cima); as gotas se
   * espalham num arco de ±`fan` radianos em volta dela, mais rápidas no meio.
   */
  emitFan(p: THREE.Vector3, back: THREE.Vector3, n: number, speed: number, fan: number, size: number, life: number) {
    tmpSide.crossVectors(back, UP);
    if (tmpSide.lengthSq() < 1e-6) tmpSide.set(1, 0, 0);
    tmpSide.normalize();
    for (let i = 0; i < n; i++) {
      const u = (Math.random() * 2 - 1);
      const ang = u * fan;
      tmpDir.copy(back).multiplyScalar(Math.cos(ang)).addScaledVector(tmpSide, Math.sin(ang));
      const s = speed * (0.75 + 0.35 * (1 - Math.abs(u))) * (0.85 + Math.random() * 0.3);
      this.spawn(
        p,
        tmpDir.x * s + (Math.random() - 0.5) * 0.25,
        tmpDir.y * s + (Math.random() - 0.5) * 0.25,
        tmpDir.z * s + (Math.random() - 0.5) * 0.25,
        size * (0.6 + Math.random() * 0.8),
        life * (0.7 + Math.random() * 0.5),
        DROP,
      );
    }
  }

  private spawn(p: THREE.Vector3, vx: number, vy: number, vz: number, size: number, life: number, kind: SprayKind) {
    const k = this.next;
    this.next = (this.next + 1) % this.count;
    this.pos[k * 3] = p.x + (Math.random() - 0.5) * 0.2;
    this.pos[k * 3 + 1] = p.y + Math.random() * 0.1;
    this.pos[k * 3 + 2] = p.z + (Math.random() - 0.5) * 0.2;
    this.vel[k * 3] = vx;
    this.vel[k * 3 + 1] = vy;
    this.vel[k * 3 + 2] = vz;
    this.life[k] = life;
    this.maxLife[k] = life;
    this.size[k] = size;
    this.kind[k] = kind;
    this.seed[k] = Math.random();
  }

  update(dt: number) {
    const dropDrag = Math.exp(-dt * 1.4);
    const mistDrag = Math.exp(-dt * 2.6);
    for (let k = 0; k < this.count; k++) {
      if (this.life[k] <= 0) {
        this.alpha[k] = 0;
        continue;
      }
      this.life[k] -= dt;
      const i = k * 3;
      const mist = this.kind[k] === MIST;
      const drag = mist ? mistDrag : dropDrag;
      // A névoa quase não cai e o vento a leva mais.
      const g = mist ? 0.6 : 9.81 * 0.7;
      const w = mist ? 1.6 : 1;
      this.vel[i] = this.vel[i] * drag + this.wind.x * w * dt;
      this.vel[i + 1] = this.vel[i + 1] * drag - g * dt + this.wind.y * dt;
      this.vel[i + 2] = this.vel[i + 2] * drag + this.wind.z * w * dt;
      this.pos[i] += this.vel[i] * dt;
      this.pos[i + 1] += this.vel[i + 1] * dt;
      this.pos[i + 2] += this.vel[i + 2] * dt;
      const u = this.life[k] / this.maxLife[k];
      if (mist) {
        // Aparece rápido, some devagar, sempre bem transparente.
        this.alpha[k] = Math.min(1, (1 - u) * 6) * u * 0.42;
        this.size[k] *= 1 + dt * 1.1;
      } else {
        this.alpha[k] = Math.min(1, u * 2) * 0.9;
        this.size[k] *= 1 + dt * 0.4;
      }
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.size.needsUpdate = true;
    g.attributes.alpha.needsUpdate = true;
    g.attributes.kind.needsUpdate = true;
    g.attributes.seed.needsUpdate = true;
  }

  clear() {
    this.life.fill(0);
    this.alpha.fill(0);
  }
}
