import * as THREE from 'three';
import { sprayTexture } from './textures';

// Spray e espuma com um único sistema de partículas reutilizado (sem criar
// objetos a cada quadro). O vento empurra as gotas e a gravidade as derruba.

export class Spray {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private size: Float32Array;
  private alpha: Float32Array;
  private next = 0;
  wind = new THREE.Vector3();

  constructor(scene: THREE.Scene, private count: number) {
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count).fill(1);
    this.size = new Float32Array(count);
    this.alpha = new Float32Array(count);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: sprayTexture() }, scale: { value: 600 }, tint: { value: new THREE.Color(2.4, 2.5, 2.6) } },
      vertexShader: `
        attribute float size;
        attribute float alpha;
        varying float vAlpha;
        uniform float scale;
        void main() {
          vAlpha = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * scale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D map;
        uniform vec3 tint;
        varying float vAlpha;
        void main() {
          vec4 t = texture2D(map, gl_PointCoord);
          // Borda bem suave: a nuvem de gotas não vira bolinhas.
          gl_FragColor = vec4(tint, t.a * t.a * vAlpha);
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

  emit(p: THREE.Vector3, dir: THREE.Vector3, n: number, speed: number, spread: number, size: number, life: number) {
    for (let i = 0; i < n; i++) {
      const k = this.next;
      this.next = (this.next + 1) % this.count;
      this.pos[k * 3] = p.x + (Math.random() - 0.5) * 0.2;
      this.pos[k * 3 + 1] = p.y + Math.random() * 0.1;
      this.pos[k * 3 + 2] = p.z + (Math.random() - 0.5) * 0.2;
      const s = speed * (0.5 + Math.random() * 0.7);
      this.vel[k * 3] = dir.x * s + (Math.random() - 0.5) * spread;
      this.vel[k * 3 + 1] = dir.y * s + Math.random() * spread;
      this.vel[k * 3 + 2] = dir.z * s + (Math.random() - 0.5) * spread;
      this.life[k] = life * (0.6 + Math.random() * 0.6);
      this.maxLife[k] = this.life[k];
      this.size[k] = size * (0.5 + Math.random());
    }
  }

  update(dt: number) {
    const drag = Math.exp(-dt * 1.4);
    for (let k = 0; k < this.count; k++) {
      if (this.life[k] <= 0) {
        this.alpha[k] = 0;
        continue;
      }
      this.life[k] -= dt;
      const i = k * 3;
      this.vel[i] = this.vel[i] * drag + this.wind.x * dt;
      this.vel[i + 1] = this.vel[i + 1] * drag - 9.81 * dt * 0.7 + this.wind.y * dt;
      this.vel[i + 2] = this.vel[i + 2] * drag + this.wind.z * dt;
      this.pos[i] += this.vel[i] * dt;
      this.pos[i + 1] += this.vel[i + 1] * dt;
      this.pos[i + 2] += this.vel[i + 2] * dt;
      const u = this.life[k] / this.maxLife[k];
      this.alpha[k] = Math.min(1, u * 2) * 0.85;
      this.size[k] *= 1 + dt * 0.6;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.size.needsUpdate = true;
    g.attributes.alpha.needsUpdate = true;
  }

  clear() {
    this.life.fill(0);
    this.alpha.fill(0);
  }
}
