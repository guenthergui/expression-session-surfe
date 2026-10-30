import * as THREE from 'three';
import type { LocationVisual } from '../core/types';
import { groundTexture } from './textures';

// Cenário de fundo de cada local: praia com morro de mata atlântica, casas e
// coqueiros; pontal de pedras com farol; ou piscina de ondas. Os morros são
// terrenos de ruído fractal com cor por altura e inclinação, cobertos de copas
// de árvores instanciadas (uma chamada de desenho para centenas de árvores).
// Tudo fica longe da ação; a quantidade de detalhe segue a qualidade gráfica.

function rand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Ruído de valor 2D determinístico (para relevo e distribuição de árvores). */
function hash2(x: number, z: number, seed: number) {
  let h = (x * 374761393 + z * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function noise2(x: number, z: number, seed: number) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

function fbm(x: number, z: number, seed: number, octaves = 5) {
  let v = 0;
  let a = 0.5;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    v += a * noise2(x * f, z * f, seed + i * 17);
    f *= 2.07;
    a *= 0.5;
  }
  return v;
}

function displaced(geo: THREE.BufferGeometry, amount: number, seed: number) {
  const p = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    // Ruído pela posição: vértices repetidos nas emendas recebem o mesmo deslocamento.
    const n = fbm(v.x * 1.7 + 11, v.z * 1.7 + v.y * 1.3, seed, 3);
    v.multiplyScalar(1 + (n - 0.5) * amount);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Terreno: retângulo em x/z com a função de altura dada. */
interface Ridge {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  height: (x: number, z: number) => number;
}

const VEG_DARK = new THREE.Color(0x203a22);
const VEG_LIGHT = new THREE.Color(0x4a6b34);
const ROCK = new THREE.Color(0x6e675e);
const SAND = new THREE.Color(0xcdb68a);
const DRY = new THREE.Color(0x7d7a4c);

export class Scenery {
  readonly group = new THREE.Group();
  private disposables: { dispose(): void }[] = [];
  private detail = 1;
  private visual: LocationVisual | null = null;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  build(v: LocationVisual, detail = this.detail) {
    this.clear();
    this.visual = v;
    this.detail = detail;
    if (v.scenery === 'praia') this.beach();
    else if (v.scenery === 'pontal') this.point();
    else this.pool();
  }

  /** Refaz o cenário com outro nível de detalhe (troca de qualidade). */
  setDetail(detail: number) {
    if (detail === this.detail || !this.visual) {
      this.detail = detail;
      return;
    }
    this.build(this.visual, detail);
  }

  private keep<T extends { dispose(): void }>(o: T): T {
    this.disposables.push(o);
    return o;
  }

  // ---------- Peças ----------

  /** Morro com relevo fractal, cor por altura e inclinação e mata por cima. */
  private terrain(r: Ridge, seed: number, opts: { segs: number; trees: number; treeSize: [number, number]; rocky?: number }) {
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    const sx = Math.max(8, Math.round(opts.segs * (0.5 + 0.5 * this.detail)));
    const sz = Math.max(4, Math.round(sx * (d / w) * 1.5));
    const geo = this.keep(new THREE.PlaneGeometry(w, d, sx, sz).rotateX(-Math.PI / 2));
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + r.x0 + w / 2;
      const z = pos.getZ(i) + r.z0 + d / 2;
      pos.setXYZ(i, x, r.height(x, z), z);
    }
    geo.computeVertexNormals();
    const nrm = geo.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const slope = 1 - nrm.getY(i);
      const n = fbm(x * 0.02, z * 0.02, seed + 5, 3);
      c.copy(VEG_DARK).lerp(VEG_LIGHT, n * 0.9);
      if (n > 0.62) c.lerp(DRY, (n - 0.62) * 1.6);
      // Pedra exposta nas encostas íngremes; areia no pé do morro.
      c.lerp(ROCK, THREE.MathUtils.clamp((slope - 0.25) * 3 + (opts.rocky ?? 0), 0, 1));
      c.lerp(SAND, THREE.MathUtils.clamp(1 - y / 2.5, 0, 1));
      colors.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = this.keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.group.add(mesh);

    // Copas: esferas achatadas e deformadas, instanciadas, com variação de verde.
    const count = Math.round(opts.trees * this.detail);
    if (count <= 0) return;
    const crown = this.keep(displaced(new THREE.IcosahedronGeometry(1, 1), 0.5, seed + 3));
    const crownMat = this.keep(new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }));
    const trees = this.keep(new THREE.InstancedMesh(crown, crownMat, count));
    const rnd = rand(seed * 31 + 7);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    let placed = 0;
    for (let tries = 0; tries < count * 6 && placed < count; tries++) {
      const x = r.x0 + rnd() * w;
      const z = r.z0 + rnd() * d;
      const y = r.height(x, z);
      if (y < 3) continue;
      // Menos árvores nas encostas mais íngremes (pedra) e em clareiras.
      const e = 2;
      const slope = Math.hypot(r.height(x + e, z) - r.height(x - e, z), r.height(x, z + e) - r.height(x, z - e)) / (2 * e);
      if (slope > 0.9 || fbm(x * 0.015, z * 0.015, seed + 9, 2) < 0.32) continue;
      const size = opts.treeSize[0] + rnd() * (opts.treeSize[1] - opts.treeSize[0]);
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rnd() * Math.PI * 2);
      s.set(size * (0.9 + rnd() * 0.4), size * (0.7 + rnd() * 0.5), size * (0.9 + rnd() * 0.4));
      p.set(x, y + size * 0.15, z);
      trees.setMatrixAt(placed, m.compose(p, q, s));
      c.copy(VEG_DARK).lerp(VEG_LIGHT, rnd() * 0.9).multiplyScalar(0.85 + rnd() * 0.3);
      trees.setColorAt(placed, c);
      placed++;
    }
    trees.count = placed;
    trees.instanceMatrix.needsUpdate = true;
    if (trees.instanceColor) trees.instanceColor.needsUpdate = true;
    this.group.add(trees);
  }

  /** Faixa de areia ao longo do eixo z, do lado esquerdo do quadro, com areia molhada e espuma na beira. */
  private bay(x: number, color: number) {
    const mat = this.keep(new THREE.MeshStandardMaterial({ color, map: groundTexture('areia'), roughness: 0.95 }));
    const sand = new THREE.Mesh(this.keep(new THREE.PlaneGeometry(60, 500).rotateX(-Math.PI / 2)), mat);
    sand.position.set(x - 25, 0.35, -60);
    sand.receiveShadow = true;
    // Areia molhada: escura e lisa, espelha um pouco o céu.
    const wet = new THREE.Mesh(
      this.keep(new THREE.PlaneGeometry(10, 500).rotateX(-Math.PI / 2).rotateZ(0.04)),
      this.keep(new THREE.MeshPhysicalMaterial({ color: 0x8f7d5a, roughness: 0.18, clearcoat: 0.6, clearcoatRoughness: 0.1 })),
    );
    wet.position.set(x + 8, 0.05, -60);
    // Linha de espuma na beira.
    const foam = new THREE.Mesh(
      this.keep(new THREE.PlaneGeometry(2.2, 500, 1, 60).rotateX(-Math.PI / 2)),
      this.keep(new THREE.MeshStandardMaterial({ color: 0xf2f5f5, map: this.foamStrip(), transparent: true, depthWrite: false, roughness: 0.8 })),
    );
    foam.position.set(x + 12.5, 0.12, -60);
    this.group.add(sand, wet, foam);
  }

  private foamStrip(): THREE.Texture {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 512;
    const g = c.getContext('2d')!;
    const r = rand(77);
    for (let i = 0; i < 1400; i++) {
      const x = 16 + (r() - 0.5) * 30 + Math.sin(i * 0.05) * 6;
      g.fillStyle = `rgba(255,255,255,${0.15 + r() * 0.5})`;
      g.beginPath();
      g.arc(x, r() * 512, 1 + r() * 4, 0, Math.PI * 2);
      g.fill();
    }
    const t = this.keep(new THREE.CanvasTexture(c));
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1, 6);
    return t;
  }

  private palm(x: number, z: number, h: number, seed: number, mats: { trunk: THREE.Material; leaf: THREE.Material }, geos: { leaf: THREE.BufferGeometry }) {
    const r = rand(seed);
    const lean = 0.8 + r() * 1.8;
    const dir = r() * Math.PI * 2;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(lean * 0.25, h * 0.4, 0),
      new THREE.Vector3(lean * 0.65, h * 0.8, 0),
      new THREE.Vector3(lean, h, 0),
    ]);
    const tube = this.keep(new THREE.TubeGeometry(curve, 14, 0.2, 7));
    // Tronco afina para cima e tem os anéis das folhas antigas.
    const tp = tube.attributes.position as THREE.BufferAttribute;
    const tuv = tube.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < tp.count; i++) {
      const u = tuv.getX(i);
      const pt = curve.getPoint(u);
      const k = (1.25 - 0.5 * u) * (1 + 0.06 * Math.sin(u * 90));
      tp.setXYZ(i, pt.x + (tp.getX(i) - pt.x) * k, pt.y + (tp.getY(i) - pt.y) * k, pt.z + (tp.getZ(i) - pt.z) * k);
    }
    tube.computeVertexNormals();
    const trunk = new THREE.Mesh(tube, mats.trunk);
    trunk.castShadow = true;
    const top = curve.getPoint(1);
    const g = new THREE.Group();
    g.add(trunk);
    const n = 10 + Math.round(r() * 4);
    for (let i = 0; i < n; i++) {
      const leaf = new THREE.Mesh(geos.leaf, mats.leaf);
      leaf.position.copy(top);
      // Folhas novas apontam para cima, as velhas caem.
      const droop = 0.1 + r() * 0.9;
      leaf.rotation.set(0, (i / n) * Math.PI * 2 + r() * 0.4, droop - 0.3, 'YZX');
      leaf.scale.setScalar(0.8 + r() * 0.4);
      g.add(leaf);
    }
    // Cocos
    for (let i = 0; i < 3; i++) {
      const coco = new THREE.Mesh(this.coconutGeo ??= this.keep(new THREE.SphereGeometry(0.16, 8, 6)), mats.trunk);
      coco.position.copy(top).add(new THREE.Vector3(Math.cos(i * 2.1) * 0.22, -0.25, Math.sin(i * 2.1) * 0.22));
      g.add(coco);
    }
    g.rotation.y = dir;
    g.position.set(x, 0.25, z);
    this.group.add(g);
  }
  private coconutGeo: THREE.BufferGeometry | undefined;

  /** Folha de coqueiro: nervura arqueada com folíolos dos dois lados (uma malha só). */
  private leafGeometry(): THREE.BufferGeometry {
    const pos: number[] = [];
    const idx: number[] = [];
    const L = 4.6;
    const segs = 14;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const x = t * L;
      const y = 0.9 * t - 1.6 * t * t;
      const span = 1.1 * Math.sin(Math.PI * Math.min(1, t * 1.1)) + 0.05;
      // Folíolos caem para os lados em "V".
      pos.push(x, y, 0, x + 0.2, y - span * 0.45, span, x + 0.2, y - span * 0.45, -span);
    }
    for (let i = 0; i < segs; i++) {
      const a = i * 3;
      const b = a + 3;
      idx.push(a, b, a + 1, a + 1, b, b + 1, a, a + 2, b, a + 2, b + 2, b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return this.keep(g);
  }

  private palms(list: [number, number, number][]) {
    const mats = {
      trunk: this.keep(new THREE.MeshStandardMaterial({ color: 0x6d5640, roughness: 0.95 })),
      leaf: this.keep(new THREE.MeshStandardMaterial({ color: 0x3d6b2a, roughness: 0.75, side: THREE.DoubleSide })),
    };
    const geos = { leaf: this.leafGeometry() };
    list.forEach(([x, z, h], i) => this.palm(x, z, h, i * 7 + 1, mats, geos));
  }

  /** Casinhas de praia: paredes claras, telhado de duas águas, janelas escuras. */
  private houses(spots: [number, number, number][], seed: number) {
    const r = rand(seed);
    const wallColors = [0xf1ece2, 0xe8d9b5, 0xd8e3e6, 0xf2d4c2, 0xffffff, 0xc9dccb];
    const roofColors = [0xa4482f, 0x8a3c2a, 0x5e5a55, 0xb76a3b];
    const box = this.keep(new THREE.BoxGeometry(1, 1, 1));
    const roof = this.keep(new THREE.CylinderGeometry(0.72, 0.72, 1, 3, 1).rotateZ(Math.PI / 2).rotateX(Math.PI / 6));
    const win = this.keep(new THREE.PlaneGeometry(1, 1));
    const winMat = this.keep(new THREE.MeshPhysicalMaterial({ color: 0x1d2a33, roughness: 0.08, clearcoat: 1 }));
    const wallMats = wallColors.map((c) => this.keep(new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 })));
    const roofMats = roofColors.map((c) => this.keep(new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 })));
    for (const [x, z, y] of spots) {
      const w = 6 + r() * 6;
      const d = 5 + r() * 5;
      const h = 3 + r() * (r() > 0.7 ? 4 : 1.5);
      const g = new THREE.Group();
      const body = new THREE.Mesh(box, wallMats[Math.floor(r() * wallMats.length)]);
      body.scale.set(w, h, d);
      body.position.y = h / 2;
      const top = new THREE.Mesh(roof, roofMats[Math.floor(r() * roofMats.length)]);
      top.scale.set(w * 1.08, d * 0.55, d * 0.82);
      top.position.y = h + d * 0.18;
      body.castShadow = top.castShadow = true;
      g.add(body, top);
      // Janelas na fachada voltada para o mar (+x)
      for (let k = 0; k < Math.floor(w / 3); k++) {
        const wi = new THREE.Mesh(win, winMat);
        wi.scale.set(1.2, 1.1, 1);
        wi.rotation.y = Math.PI / 2;
        wi.position.set(w / 2 + 0.02, h * 0.55, -d / 2 + 1.3 + k * ((d - 2.6) / Math.max(1, Math.floor(w / 3) - 1)));
        g.add(wi);
      }
      g.position.set(x, y, z);
      g.rotation.y = (r() - 0.5) * 0.3;
      this.group.add(g);
    }
  }

  /** Pedras arredondadas com cor variando por pedra (instanciadas). */
  private rocks(spots: { x: number; z: number; s: number; y?: number }[], seed: number, color = 0x6f6a63) {
    if (!spots.length) return;
    const geo = this.keep(displaced(new THREE.IcosahedronGeometry(1, 2), 0.55, seed));
    const mat = this.keep(new THREE.MeshStandardMaterial({ map: groundTexture('pedra'), color, roughness: 0.88 }));
    const mesh = this.keep(new THREE.InstancedMesh(geo, mat, spots.length));
    const r = rand(seed);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    spots.forEach((sp, i) => {
      q.setFromEuler(new THREE.Euler(r() * 0.5, r() * Math.PI * 2, r() * 0.5));
      m.compose(new THREE.Vector3(sp.x, sp.y ?? sp.s * 0.12 - 0.5, sp.z), q, new THREE.Vector3(sp.s * (1 + r() * 0.5), sp.s * (0.45 + r() * 0.4), sp.s * (0.9 + r() * 0.4)));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c.setHex(0xffffff).multiplyScalar(0.75 + r() * 0.4));
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  /** Cadeira de salva-vidas na areia. */
  private lifeguard(x: number, z: number) {
    const wood = this.keep(new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.7 }));
    const red = this.keep(new THREE.MeshStandardMaterial({ color: 0xc8352b, roughness: 0.6 }));
    const leg = this.keep(new THREE.BoxGeometry(0.15, 3.2, 0.15));
    const g = new THREE.Group();
    for (const [lx, lz] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) {
      const l = new THREE.Mesh(leg, wood);
      l.position.set(lx, 1.6, lz);
      g.add(l);
    }
    const cabin = new THREE.Mesh(this.keep(new THREE.BoxGeometry(2, 1.6, 2)), red);
    cabin.position.y = 4;
    const roof = new THREE.Mesh(this.keep(new THREE.BoxGeometry(2.4, 0.15, 2.4)), wood);
    roof.position.y = 4.9;
    g.add(cabin, roof);
    g.traverse((o) => (o.castShadow = true));
    g.position.set(x, 0.3, z);
    this.group.add(g);
  }

  /** Guarda-sóis coloridos espalhados pela areia. */
  private umbrellas(x: number, count: number, seed: number) {
    const r = rand(seed);
    const pole = this.keep(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 5));
    const top = this.keep(new THREE.ConeGeometry(1.2, 0.45, 10, 1, true));
    const poleMat = this.keep(new THREE.MeshStandardMaterial({ color: 0xdddddd }));
    const colors = [0xe94f37, 0x2f7fd3, 0xf3c623, 0x2aa876, 0xffffff];
    const mats = colors.map((c) => this.keep(new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, side: THREE.DoubleSide })));
    for (let i = 0; i < count; i++) {
      const g = new THREE.Group();
      const p = new THREE.Mesh(pole, poleMat);
      p.position.y = 1.1;
      const t = new THREE.Mesh(top, mats[Math.floor(r() * mats.length)]);
      t.position.y = 2.2;
      t.castShadow = true;
      g.add(p, t);
      g.position.set(x - r() * 22, 0.35, -200 + r() * 330);
      g.rotation.z = (r() - 0.5) * 0.2;
      this.group.add(g);
    }
  }

  /** Farol listrado no alto do pontal. */
  private lighthouse(x: number, y: number, z: number) {
    const white = this.keep(new THREE.MeshStandardMaterial({ color: 0xf4f2ee, roughness: 0.6 }));
    const red = this.keep(new THREE.MeshStandardMaterial({ color: 0xb8322a, roughness: 0.6 }));
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Mesh(this.keep(new THREE.CylinderGeometry(2.2 - (i + 1) * 0.18, 2.2 - i * 0.18, 4, 16)), i % 2 ? red : white);
      s.position.y = 2 + i * 4;
      s.castShadow = true;
      g.add(s);
    }
    const lamp = new THREE.Mesh(this.keep(new THREE.CylinderGeometry(1.1, 1.1, 2, 12)), this.keep(new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffe9a0, emissiveIntensity: 1.5 })));
    lamp.position.y = 21;
    const cap = new THREE.Mesh(this.keep(new THREE.ConeGeometry(1.5, 1.6, 12)), red);
    cap.position.y = 22.8;
    g.add(lamp, cap);
    g.position.set(x, y, z);
    this.group.add(g);
  }

  /** Cordilheira distante em camadas: a névoa deixa as de trás mais azuladas. */
  private backRange(seed: number, height: number, rocky = 0) {
    this.terrain(
      {
        x0: -1700,
        x1: 1700,
        z0: -1250,
        z1: -820,
        height: (x, z) => {
          const back = THREE.MathUtils.smoothstep(-z, 820, 930);
          const peaks = fbm(x * 0.0035, z * 0.004, seed, 5);
          return back * height * (0.25 + peaks * 1.3) - 4;
        },
      },
      seed,
      { segs: 140, trees: 1800, treeSize: [4.5, 8], rocky },
    );
  }

  // ---------- Locais ----------

  private beach() {
    this.backRange(3, 120);
    const sandX = -115;
    this.bay(sandX, 0xd9c49a);
    // Morro de mata logo atrás da praia, à esquerda.
    this.terrain(
      {
        x0: -520,
        x1: sandX - 52,
        z0: -420,
        z1: 220,
        height: (x, z) => {
          const rise = THREE.MathUtils.smoothstep(-x, -sandX + 52, -sandX + 140);
          return rise * (14 + 70 * fbm(x * 0.008, z * 0.008, 21, 5)) + 0.3;
        },
      },
      21,
      { segs: 90, trees: 1400, treeSize: [2.5, 5] },
    );
    const pr = rand(4);
    const palms: [number, number, number][] = [];
    const nPalms = Math.round(14 + 26 * this.detail);
    for (let i = 0; i < nPalms; i++) palms.push([sandX - 14 - pr() * 26, -260 + (i / nPalms) * 440 + pr() * 8, 7 + pr() * 4]);
    this.palms(palms);
    const hr = rand(8);
    const houses: [number, number, number][] = [];
    for (let i = 0; i < Math.round(4 + 10 * this.detail); i++) houses.push([sandX - 44 - hr() * 10, -240 + i * 34 + hr() * 10, 0.3]);
    this.houses(houses, 8);
    this.lifeguard(sandX - 6, -40);
    this.umbrellas(sandX - 6, Math.round(6 + 14 * this.detail), 12);
    const rr = rand(15);
    const spots = Array.from({ length: Math.round(8 + 14 * this.detail) }, () => ({ x: sandX + 4 + rr() * 8, z: 140 + rr() * 60, s: 1 + rr() * 3 }));
    this.rocks(spots, 15);
  }

  private point() {
    this.bay(-120, 0xc9ad84);
    this.backRange(9, 150, 0.15);
    // Encosta rochosa atrás do pontal.
    const slope = (x: number, z: number) => THREE.MathUtils.smoothstep(-x, 150, 230) * (20 + 90 * fbm(x * 0.007, z * 0.007, 31, 5)) + 0.3;
    this.terrain({ x0: -560, x1: -150, z0: -360, z1: 160, height: slope }, 31, { segs: 90, trees: 900, treeSize: [2.5, 5], rocky: 0.2 });
    // Pontal de pedras entrando no mar, à esquerda da onda
    const r = rand(5);
    const spots: { x: number; z: number; s: number }[] = [];
    for (let i = 0; i < Math.round(26 + 34 * this.detail); i++) {
      const s = 2.5 + r() * 7;
      spots.push({ x: -60 - r() * 18 - (i % 6) * 5, z: -60 + i * 2.6 + r() * 4, s });
    }
    this.rocks(spots, 40, 0x857b70);
    this.lighthouse(-205, slope(-205, -60) - 0.5, -60);
    const hr = rand(18);
    const houses: [number, number, number][] = [];
    for (let i = 0; i < Math.round(3 + 6 * this.detail); i++) {
      const x = -158 - hr() * 8;
      const z = -200 + i * 40;
      houses.push([x, slope(x, z) - 0.3, z]);
    }
    this.houses(houses, 18);
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
    const glass = this.keep(new THREE.MeshPhysicalMaterial({ color: 0x23323d, roughness: 0.05, metalness: 0.3, clearcoat: 1 }));
    for (let i = 0; i < 4; i++) {
      const h = 14 + i * 4;
      const b = new THREE.Mesh(this.keep(new THREE.BoxGeometry(60, h, 20)), bldMat);
      b.position.set(-200 + i * 140, 7 + i * 2, 135);
      // Faixas de vidro em cada andar
      for (let f = 0; f < Math.floor(h / 4); f++) {
        const band = new THREE.Mesh(this.keep(new THREE.BoxGeometry(56, 1.4, 0.2)), glass);
        band.position.set(-200 + i * 140, 2.5 + f * 4, 124.9);
        this.group.add(band);
      }
      this.group.add(b);
    }
    // Coqueiros no deck e serra ao fundo
    this.palms(Array.from({ length: Math.round(8 + 10 * this.detail) }, (_, i) => [-300 + i * 36, 95 + (i % 2) * 6, 7 + (i % 3)] as [number, number, number]));
    this.backRange(27, 100);
  }

  clear() {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.group.clear();
    this.coconutGeo = undefined;
  }
}
