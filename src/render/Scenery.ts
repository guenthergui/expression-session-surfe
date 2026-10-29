import * as THREE from 'three';
import type { LocationVisual } from '../core/types';
import { groundTexture } from './textures';

// Cenário de fundo de cada local: praia com coqueiros, pontal de pedras ou
// piscina de ondas. Tudo fica longe da ação e reaproveita geometrias.

function rand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function displaced(geo: THREE.BufferGeometry, amount: number, seed: number) {
  const r = rand(seed);
  const p = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const cache = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    if (!cache.has(key)) cache.set(key, 1 + (r() - 0.5) * amount);
    v.multiplyScalar(cache.get(key)!);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

export class Scenery {
  readonly group = new THREE.Group();
  private disposables: { dispose(): void }[] = [];

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  build(v: LocationVisual) {
    this.clear();
    if (v.scenery === 'praia') this.beach(v);
    else if (v.scenery === 'pontal') this.point(v);
    else this.pool();
  }

  private keep<T extends { dispose(): void }>(o: T): T {
    this.disposables.push(o);
    return o;
  }

  /** Faixa de areia ao longo do eixo z, do lado esquerdo do quadro. */
  private bay(x: number, color: number) {
    const mat = this.keep(new THREE.MeshStandardMaterial({ color, map: groundTexture('areia'), roughness: 0.95 }));
    const sand = new THREE.Mesh(this.keep(new THREE.PlaneGeometry(60, 500).rotateX(-Math.PI / 2)), mat);
    sand.position.set(x - 25, 0.35, -60);
    sand.receiveShadow = true;
    const wet = new THREE.Mesh(this.keep(new THREE.PlaneGeometry(10, 500).rotateX(-Math.PI / 2).rotateZ(0.04)), this.keep(new THREE.MeshStandardMaterial({ color: 0xa89670, roughness: 0.35 })));
    wet.position.set(x + 8, 0.05, -60);
    this.group.add(sand, wet);
  }

  private hills(z: number, color: number, height: number, seed: number) {
    const r = rand(seed);
    const mat = this.keep(new THREE.MeshStandardMaterial({ color, roughness: 1 }));
    for (let i = 0; i < 9; i++) {
      const geo = this.keep(displaced(new THREE.SphereGeometry(1, 40, 20), 0.12, seed + i));
      const m = new THREE.Mesh(geo, mat);
      const s = 40 + r() * 70;
      m.scale.set(s * (1.4 + r()), height * (0.6 + r() * 0.8), s);
      m.position.set(-500 + i * 130 + r() * 40, -4, z + r() * 60);
      this.group.add(m);
    }
  }

  private palm(x: number, z: number, h: number, seed: number) {
    const r = rand(seed);
    const trunkMat = this.keep(new THREE.MeshStandardMaterial({ color: 0x7a5a3c, roughness: 0.9 }));
    const leafMat = this.keep(new THREE.MeshStandardMaterial({ color: 0x2f6b2c, roughness: 0.8, side: THREE.DoubleSide }));
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.6, h * 0.4, 0.2),
      new THREE.Vector3(1.6, h * 0.8, 0.3),
      new THREE.Vector3(2.4, h, 0.2),
    ]);
    const trunk = new THREE.Mesh(this.keep(new THREE.TubeGeometry(curve, 16, 0.22, 8)), trunkMat);
    trunk.castShadow = true;
    const top = curve.getPoint(1);
    const g = new THREE.Group();
    g.add(trunk);
    for (let i = 0; i < 9; i++) {
      const leaf = new THREE.Mesh(this.keep(new THREE.PlaneGeometry(4.5, 0.9, 6, 1)), leafMat);
      const pos = leaf.geometry.attributes.position as THREE.BufferAttribute;
      for (let k = 0; k < pos.count; k++) {
        const lx = pos.getX(k) + 2.25;
        pos.setY(k, pos.getY(k) * (1 - lx / 4.5) - 0.08 * lx * lx);
        pos.setX(k, lx);
      }
      leaf.geometry.computeVertexNormals();
      leaf.position.copy(top);
      leaf.rotation.set(0, (i / 9) * Math.PI * 2 + r(), 0.3);
      g.add(leaf);
    }
    g.position.set(x, 0.25, z);
    this.group.add(g);
  }

  private beach(v: LocationVisual) {
    this.hills(-950, 0x3f5d4a, 70, 3);
    // Baía de areia à esquerda, com coqueiros
    this.bay(-115, 0xd9c49a);
    for (let i = 0; i < 16; i++) this.palm(-128 - (i % 3) * 6, -150 + i * 16, 8 + (i % 3) * 1.5, i + 1);
    void v;
  }

  private point(v: LocationVisual) {
    this.bay(-120, 0xc9ad84);
    this.hills(-950, 0x2f3440, 95, 9);
    const rockMat = this.keep(new THREE.MeshStandardMaterial({ map: groundTexture('pedra'), color: 0x8a8076, roughness: 0.92, flatShading: true }));
    const r = rand(5);
    // Pontal de pedras entrando no mar, à esquerda da onda
    for (let i = 0; i < 26; i++) {
      const geo = this.keep(displaced(new THREE.DodecahedronGeometry(1, 1), 0.45, 40 + i));
      const m = new THREE.Mesh(geo, rockMat);
      const s = 3 + r() * 7;
      m.scale.set(s * 1.3, s * (0.5 + r() * 0.5), s);
      m.position.set(-62 - r() * 14 - (i % 6) * 6, s * 0.15 - 0.6, -40 + i * 3.2 + r() * 4);
      m.castShadow = true;
      this.group.add(m);
    }
    void v;
  }

  private pool() {
    const concrete = this.keep(new THREE.MeshStandardMaterial({ map: groundTexture('concreto'), roughness: 0.85 }));
    // Muro do fundo e bordas da piscina
    const wall = new THREE.Mesh(this.keep(new THREE.BoxGeometry(1400, 4, 3)), concrete);
    wall.position.set(0, 1.2, -120);
    this.group.add(wall);
    const deck = new THREE.Mesh(this.keep(new THREE.BoxGeometry(1400, 1, 60)), concrete);
    deck.position.set(0, 0, 105);
    const side = new THREE.Mesh(this.keep(new THREE.BoxGeometry(4, 3, 260)), concrete);
    side.position.set(-95, 0.8, -20);
    this.group.add(side);
    deck.receiveShadow = true;
    this.group.add(deck);
    // Postes de iluminação e prédio da piscina
    const poleMat = this.keep(new THREE.MeshStandardMaterial({ color: 0x3b4148, metalness: 0.6, roughness: 0.4 }));
    const lampMat = this.keep(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3c4, emissiveIntensity: 0.8 }));
    for (let i = 0; i < 12; i++) {
      const pole = new THREE.Mesh(this.keep(new THREE.CylinderGeometry(0.25, 0.35, 18, 10)), poleMat);
      pole.position.set(-330 + i * 60, 9, -118);
      const lamp = new THREE.Mesh(this.keep(new THREE.BoxGeometry(3, 0.8, 1.2)), lampMat);
      lamp.position.set(-330 + i * 60, 18.2, -117);
      this.group.add(pole, lamp);
    }
    const bldMat = this.keep(new THREE.MeshStandardMaterial({ color: 0xe9eef2, roughness: 0.7 }));
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(this.keep(new THREE.BoxGeometry(60, 14 + i * 4, 20)), bldMat);
      b.position.set(-200 + i * 140, 7 + i * 2, 135);
      this.group.add(b);
    }
  }

  clear() {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.group.clear();
  }
}
