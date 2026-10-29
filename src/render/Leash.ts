import * as THREE from 'three';
import { Rope, constrainToLength } from '../sim/rope';

// Leash de 6 pés (1,83 m): uma corda simulada (src/sim/rope.ts) desenhada como
// um tubo fino. A malha é atualizada no lugar a cada quadro, sem recriar geometria.

const SIDES = 6;
const RADIUS = 0.0045;

export class Leash {
  readonly mesh: THREE.Mesh;
  readonly rope: Rope;
  private geo: THREE.BufferGeometry;
  private started = false;
  private tmp = new THREE.Vector3();
  private tangent = new THREE.Vector3();
  private normal = new THREE.Vector3();
  private binormal = new THREE.Vector3();

  constructor(scene: THREE.Scene, length = 1.83) {
    this.rope = new Rope(length, 16);
    const n = this.rope.count;
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * SIDES * 3), 3));
    this.geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * SIDES * 3), 3));
    const idx: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      for (let k = 0; k < SIDES; k++) {
        const a = i * SIDES + k;
        const b = i * SIDES + ((k + 1) % SIDES);
        idx.push(a, a + SIDES, b, b, a + SIDES, b + SIDES);
      }
    }
    this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(this.geo, new THREE.MeshStandardMaterial({ color: 0x1d2a33, roughness: 0.45 }));
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    scene.add(this.mesh);
  }

  reset() {
    this.started = false;
  }

  /**
   * Atualiza a corda presa no tornozelo e no plug. Se a corda esticar além do
   * comprimento (queda), devolve a posição corrigida da prancha; senão null.
   */
  update(dt: number, ankle: THREE.Vector3, plug: THREE.Vector3, floor: (x: number, z: number) => number, falling: boolean): THREE.Vector3 | null {
    if (!this.started) {
      this.rope.reset(ankle, plug);
      this.started = true;
    }
    const stretch = this.rope.step(Math.min(dt, 1 / 30), ankle, plug, floor);
    let corrected: THREE.Vector3 | null = null;
    if (falling && stretch > 0) {
      const c = constrainToLength(ankle, plug, this.rope.length);
      corrected = this.tmp.set(c.x - plug.x, c.y - plug.y, c.z - plug.z);
    }
    this.writeMesh();
    return corrected;
  }

  private writeMesh() {
    const pts = this.rope.points;
    const pos = this.geo.attributes.position.array as Float32Array;
    const nor = this.geo.attributes.normal.array as Float32Array;
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(n - 1, i + 1)];
      this.tangent.set(b.x - a.x, b.y - a.y, b.z - a.z).normalize();
      const ref = Math.abs(this.tangent.y) < 0.9 ? THREE.Object3D.DEFAULT_UP : this.tmp.set(1, 0, 0);
      this.normal.crossVectors(this.tangent, ref).normalize();
      this.binormal.crossVectors(this.tangent, this.normal);
      for (let k = 0; k < SIDES; k++) {
        const ang = (k / SIDES) * Math.PI * 2;
        const cx = Math.cos(ang);
        const sx = Math.sin(ang);
        const nx = this.normal.x * cx + this.binormal.x * sx;
        const ny = this.normal.y * cx + this.binormal.y * sx;
        const nz = this.normal.z * cx + this.binormal.z * sx;
        const v = (i * SIDES + k) * 3;
        pos[v] = pts[i].x + nx * RADIUS;
        pos[v + 1] = pts[i].y + ny * RADIUS;
        pos[v + 2] = pts[i].z + nz * RADIUS;
        nor[v] = nx;
        nor[v + 1] = ny;
        nor[v + 2] = nz;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.normal.needsUpdate = true;
  }
}
