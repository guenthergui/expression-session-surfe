import * as THREE from 'three';
import { colorOf, type BoardLook, type FinLook } from '../data/cosmetics';
import { boardMeters } from '../data/equipment';
import type { Board, FinSetup } from '../core/types';
import { boardArtTexture } from './paint';
import { microNormalTexture, padTexture, waxTexture } from './textures';

// Prancha 3D gerada a partir das medidas reais (em metros): outline, rocker,
// distribuição de espessura, bordas arredondadas, deck abaulado, quilhas e
// antiderrapante. A aparência (cores, arte, acabamento, perfil das quilhas)
// só muda materiais e o desenho do contorno da quilha: medidas, posição e
// ângulos das quilhas vêm do equipamento e não mudam. Eixos locais: +x é o bico, +y sai do deck, +z é a borda do
// lado dos dedos do surfista.

const RINGS = 72;
const SIDES = 36;

export interface BoardShape {
  length: number;
  width: number;
  thickness: number;
}

export class BoardModel {
  readonly group = new THREE.Group();
  readonly shape: BoardShape;
  /** Ponto de fixação do leash, no plug da rabeta. */
  readonly leashPlug = new THREE.Object3D();
  private body: THREE.Mesh;
  private bodyMat: THREE.MeshPhysicalMaterial;
  private resin: THREE.Texture;
  private parts: THREE.Mesh[] = [];
  private finMat: THREE.MeshPhysicalMaterial;
  private fins: THREE.Mesh[] = [];
  private finSpecs: { base: number; depth: number }[] = [];
  private finProfile = '';

  constructor(readonly board: Board, fins: FinSetup, look: BoardLook, finLook: FinLook) {
    this.shape = boardMeters(board.dims);
    this.bodyMat = new THREE.MeshPhysicalMaterial({ metalness: 0, sheen: 0.2 });
    // Verniz de resina com leve "casca de laranja": o reflexo do céu ondula de leve, como numa prancha de verdade.
    this.resin = microNormalTexture(23).clone();
    this.resin.needsUpdate = true;
    this.resin.repeat.set(9, 3);
    this.bodyMat.clearcoatNormalMap = this.resin;
    this.bodyMat.clearcoatNormalScale.set(0.06, 0.06);
    this.finMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: 0 });
    this.body = new THREE.Mesh(this.buildBody(), this.bodyMat);
    this.body.castShadow = true;
    this.body.receiveShadow = true;
    this.group.add(this.body);
    this.buildPad();
    this.buildWax();
    this.buildFins(fins);
    this.setFinish(look, finLook);
    this.leashPlug.position.set(-this.shape.length / 2 + 0.06, this.deckY(-this.shape.length / 2 + 0.06, 0) + 0.004, 0);
    this.group.add(this.leashPlug);
    this.buildPlug();
  }

  /**
   * Parafina: uma película irregular sobre o deck, da frente do deck pad até
   * pouco depois do pé da frente, mais grossa onde os pés pisam.
   */
  private buildWax() {
    const L = this.shape.length;
    const x0 = -L / 2 + 0.35;
    const x1 = L * 0.22;
    const segs = 24;
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= segs; i++) {
      const x = x0 + ((x1 - x0) * i) / segs;
      const u = x / L + 0.5;
      const hw = this.halfWidth(u) * 0.93;
      for (let k = 0; k <= 12; k++) {
        const z = -hw + (2 * hw * k) / 12;
        pos.push(x, this.deckY(x, z) + 0.0012, z);
        uv.push(i / segs, k / 12);
      }
    }
    for (let i = 0; i < segs; i++) {
      for (let k = 0; k < 12; k++) {
        const a = i * 13 + k;
        idx.push(a, a + 1, a + 13, a + 1, a + 14, a + 13);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const tex = waxTexture();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
      map: tex,
      bumpMap: tex,
      bumpScale: 1.4,
      transparent: true,
      depthWrite: false,
      roughness: 0.9,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }));
    m.receiveShadow = true;
    this.group.add(m);
    this.parts.push(m);
  }

  /** Plug do leash: copo embutido na rabeta com a barrinha onde a cordinha prende. */
  private buildPlug() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x20262b, roughness: 0.6 });
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.004, 16), mat);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 0.02, 6), mat);
    bar.rotation.z = Math.PI / 2;
    bar.position.y = 0.002;
    this.leashPlug.add(cup, bar);
    this.parts.push(cup, bar);
  }

  /** Aplica a aparência escolhida: cores e arte da prancha, acabamento e visual das quilhas. */
  setFinish(look: BoardLook, fin: FinLook) {
    this.bodyMat.map = boardArtTexture({
      deck: colorOf(look.deck, 0xf3f1ec),
      bottom: colorOf(look.bottom, 0xf3f1ec),
      art: look.art,
      artColor: colorOf(look.artColor, 0x1f5d9e),
      noseTail: look.noseTail ? colorOf(look.noseTail) : null,
    });
    // Brilhante: verniz espelhado. Fosco: lixado, sem verniz.
    const gloss = look.finish !== 'acab-fosco';
    this.bodyMat.roughness = gloss ? 0.32 : 0.78;
    this.bodyMat.clearcoat = gloss ? 1 : 0.05;
    this.bodyMat.clearcoatRoughness = gloss ? 0.08 : 0.6;
    this.bodyMat.needsUpdate = true;

    if (fin.profile !== this.finProfile) {
      this.finProfile = fin.profile;
      this.fins.forEach((m, i) => {
        m.geometry.dispose();
        m.geometry = this.finGeometry(this.finSpecs[i].base, this.finSpecs[i].depth, fin.profile);
      });
    }
    // Cor por vértice: base numa cor e ponta na outra (bicolor), ou tudo igual.
    const c1 = new THREE.Color(colorOf(fin.color, 0x23303b));
    const c2 = fin.twoTone ? new THREE.Color(colorOf(fin.color2, 0x2fb4d6)) : c1;
    for (const [i, m] of this.fins.entries()) {
      const g = m.geometry;
      const pos = g.attributes.position as THREE.BufferAttribute;
      const colors = new Float32Array(pos.count * 3);
      const depth = this.finSpecs[i].depth;
      const tmp = new THREE.Color();
      for (let k = 0; k < pos.count; k++) {
        const t = THREE.MathUtils.clamp(-pos.getY(k) / depth, 0, 1);
        tmp.copy(t > 0.55 ? c2 : c1);
        colors.set([tmp.r, tmp.g, tmp.b], k * 3);
      }
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
    const finGloss = fin.finish !== 'acab-fosco';
    this.finMat.roughness = finGloss ? 0.22 : 0.7;
    this.finMat.clearcoat = finGloss ? 0.8 : 0;
    // Resina cristal: deixa ver o mar através da quilha.
    this.finMat.transparent = fin.transparent;
    this.finMat.opacity = fin.transparent ? 0.5 : 1;
    this.finMat.depthWrite = !fin.transparent;
    this.finMat.needsUpdate = true;
  }

  /** Meia largura (m) na posição u, de 0 (rabeta) a 1 (bico). */
  halfWidth(u: number): number {
    const tailW = { squash: 0.6, swallow: 0.64, round: 0.48, pin: 0.3 }[this.board.tail];
    let f: number;
    if (u < 0.52) {
      const t = u / 0.52;
      f = tailW + (1 - tailW) * Math.pow(Math.sin((Math.PI / 2) * t), 0.75);
    } else {
      const t = (u - 0.52) / 0.48;
      f = Math.pow(Math.cos((Math.PI / 2) * t), 0.55 + (1 - this.board.noseWidth) * 0.6);
    }
    return (this.shape.width / 2) * f;
  }

  /** Curva de rocker: quanto o centro da prancha sobe em u. */
  rocker(u: number): number {
    if (u < 0.35) return this.board.tailRocker * Math.pow(1 - u / 0.35, 2);
    if (u > 0.5) return this.board.noseRocker * Math.pow((u - 0.5) / 0.5, 2.3);
    return 0;
  }

  thickness(u: number): number {
    const t = Math.min(0.985, Math.max(0.015, u));
    return this.shape.thickness * (0.3 + 0.7 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.9)), 0.55));
  }

  /** Altura local do deck na posição x (m) e z (m), para apoiar os pés. */
  deckY(x: number, z: number): number {
    const u = THREE.MathUtils.clamp(x / this.shape.length + 0.5, 0, 1);
    const hw = Math.max(0.01, this.halfWidth(u));
    const across = Math.min(1, Math.abs(z) / hw);
    return this.rocker(u) + this.thickness(u) * 0.6 * Math.pow(1 - across * across, 0.35);
  }

  private buildBody(): THREE.BufferGeometry {
    const L = this.shape.length;
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    const swallow = this.board.tail === 'swallow';
    for (let i = 0; i <= RINGS; i++) {
      const u = i / RINGS;
      const hw = Math.max(0.0015, this.halfWidth(u));
      const th = this.thickness(u);
      const r = this.rocker(u);
      for (let k = 0; k <= SIDES; k++) {
        const v = k / SIDES;
        const phi = v * Math.PI * 2;
        const cz = Math.cos(phi);
        const sy = Math.sin(phi);
        // Borda arredondada: |cos|^0.35 empurra o volume para fora (rail cheio).
        const z = hw * Math.sign(cz) * Math.pow(Math.abs(cz), 0.35);
        const y = sy >= 0 ? th * 0.6 * Math.pow(sy, 0.85) : th * 0.4 * -Math.pow(-sy, 1.6);
        let x = (u - 0.5) * L;
        if (swallow && i <= 3) x += 0.09 * (1 - Math.abs(z) / hw) * (1 - i / 4);
        pos.push(x, r + y, z);
        uv.push(u, 1 - v);
      }
    }
    const row = SIDES + 1;
    for (let i = 0; i < RINGS; i++) {
      for (let k = 0; k < SIDES; k++) {
        const a = i * row + k;
        idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
      }
    }
    // Tampa da rabeta (squash, round e swallow têm largura no fim)
    const center = pos.length / 3;
    pos.push(-L / 2, this.rocker(0), 0);
    uv.push(0, 0.5);
    for (let k = 0; k < SIDES; k++) idx.push(center, k, k + 1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  private buildPad() {
    const L = this.shape.length;
    const x0 = -L / 2 + 0.04;
    const len = 0.3;
    const segs = 10;
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= segs; i++) {
      const x = x0 + (len * i) / segs;
      const u = x / L + 0.5;
      const hw = this.halfWidth(u) * 0.86;
      for (let k = 0; k <= 8; k++) {
        const z = -hw + (2 * hw * k) / 8;
        // Rabo levantado (kick) nos últimos centímetros
        const kick = i < 3 ? (3 - i) * 0.006 : 0;
        pos.push(x, this.deckY(x, z) + 0.005 + kick, z);
        uv.push(i / segs, k / 8);
      }
    }
    for (let i = 0; i < segs; i++) {
      for (let k = 0; k < 8; k++) {
        const a = i * 9 + k;
        idx.push(a, a + 1, a + 9, a + 1, a + 10, a + 9);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: padTexture(), roughness: 0.95, side: THREE.DoubleSide }));
    m.castShadow = true;
    this.group.add(m);
    this.parts.push(m);
  }

  /** Contorno da quilha. O perfil é só visual: base e profundidade (a função) não mudam. */
  private finGeometry(base: number, depth: number, profile = 'perfil-classico'): THREE.BufferGeometry {
    // Inclinação da ponta para trás: clássico, mais inclinado ou quase reto.
    const rake = profile === 'perfil-inclinado' ? 0.6 : profile === 'perfil-reto' ? 0.08 : 0.35;
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(base, 0);
    s.bezierCurveTo(base * 0.55, -depth * 0.35, base * (0.1 - rake * 0.3), -depth * 0.85, -base * rake, -depth);
    s.bezierCurveTo(-base * (rake * 0.55), -depth * 0.6, -base * 0.05, -depth * 0.3, 0, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0015, bevelSegments: 2, steps: 1 });
    g.translate(-base * 0.5, 0, -0.003);
    return g;
  }

  private buildFins(setup: FinSetup) {
    const L = this.shape.length;
    const mat = this.finMat;
    const add = (fromTail: number, inFromRail: number, side: -1 | 0 | 1, base: number, depth: number, cant: number) => {
      const x = -L / 2 + fromTail;
      const u = x / L + 0.5;
      const z = side === 0 ? 0 : side * (this.halfWidth(u) - inFromRail);
      const bottom = this.rocker(u) - this.thickness(u) * 0.4;
      const fin = new THREE.Mesh(this.finGeometry(base, depth, this.finProfile), mat);
      this.fins.push(fin);
      this.finSpecs.push({ base, depth });
      fin.position.set(x, bottom + 0.002, z);
      // Cant: as laterais inclinam para fora; toe-in: apontam um pouco para o centro.
      fin.rotation.x = side * THREE.MathUtils.degToRad(cant);
      fin.rotation.y = -side * THREE.MathUtils.degToRad(3);
      fin.castShadow = true;
      this.group.add(fin);
      this.parts.push(fin);
    };
    if (setup === 'thruster') {
      add(0.29, 0.03, 1, 0.11, 0.115, 6);
      add(0.29, 0.03, -1, 0.11, 0.115, 6);
      add(0.09, 0, 0, 0.105, 0.11, 0);
    } else if (setup === 'twin') {
      add(0.34, 0.035, 1, 0.135, 0.125, 5);
      add(0.34, 0.035, -1, 0.135, 0.125, 5);
    } else {
      add(0.3, 0.03, 1, 0.105, 0.11, 6);
      add(0.3, 0.03, -1, 0.105, 0.11, 6);
      add(0.17, 0.065, 1, 0.09, 0.095, 4);
      add(0.17, 0.065, -1, 0.09, 0.095, 4);
    }
  }

  dispose() {
    this.body.geometry.dispose();
    this.bodyMat.dispose();
    this.resin.dispose();
    for (const p of this.parts) {
      p.geometry.dispose();
      (p.material as THREE.Material).dispose();
    }
    this.finMat.dispose();
  }
}
