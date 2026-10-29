import * as THREE from 'three';
import type { Cosmetic } from '../data/cosmetics';
import { hairTexture, neopreneBump, skinTexture, tattooTexture } from './textures';

// Surfista provisório, articulado e gerado por código, com 1,78 m de altura.
// Não é uma malha contínua com skinning: cada segmento é uma peça rígida presa
// a uma junta, e as juntas têm "tampas" esféricas para o corpo não abrir nas
// articulações. A hierarquia é a de um esqueleto humano:
//   pelve → coluna → peito → pescoço → cabeça
//   ombro → braço → antebraço → punho → dedos (3 falanges; polegar com 2)
//   quadril → coxa → canela → tornozelo → pé com dedos
// Pernas e braços são resolvidos por cinemática inversa de dois ossos, com
// limite de flexão. O jogo só informa onde ficam pés, mãos, pelve e tronco.
//
// Para trocar por um modelo GLB com esqueleto, basta implementar a mesma
// interface SurferAvatar mapeando as juntas do rig.

export interface SurferLook {
  suit: Cosmetic;
  hair: Cosmetic;
  hairColor: Cosmetic;
  tattoo: Cosmetic;
  accessory: Cosmetic;
}

/** Pose em coordenadas do mundo, calculada pelo animador a cada quadro. */
export interface WorldPose {
  pelvisPos: THREE.Vector3;
  pelvisQuat: THREE.Quaternion;
  /** Flexão do tronco para frente, torção e inclinação lateral (radianos). */
  spineBend: number;
  chestTwist: number;
  spineSide: number;
  headPitch: number;
  headYaw: number;
  footLeft: { pos: THREE.Vector3; quat: THREE.Quaternion };
  footRight: { pos: THREE.Vector3; quat: THREE.Quaternion };
  handLeft: THREE.Vector3;
  handRight: THREE.Vector3;
  /** Mão aberta (0) a fechada (1). */
  gripLeft: number;
  gripRight: number;
  /** Direção para onde os joelhos apontam (mundo). */
  kneePole: THREE.Vector3;
  elbowPole: THREE.Vector3;
}

export interface SurferAvatar {
  readonly root: THREE.Object3D;
  applyPose(p: WorldPose): void;
  applyLook(l: SurferLook): void;
  /** Movimento secundário (cabelo) e aparência molhada, com o tempo do quadro. */
  update(dt: number, wind: THREE.Vector3): void;
  setWetness(w: number): void;
  ankleBack(): THREE.Vector3;
}

// Medidas do corpo em metros
export const BODY = {
  thigh: 0.45,
  shin: 0.44,
  upperArm: 0.3,
  forearm: 0.27,
  ankleHeight: 0.075,
  hipHalfWidth: 0.09,
  shoulderHalfWidth: 0.19,
  spine: 0.12,
  chest: 0.27,
  neck: 0.22,
};

/** Distância mínima entre raiz e ponta: limita a flexão de joelhos (~145°) e cotovelos (~150°). */
const MIN_REACH = { leg: 0.24, arm: 0.15 };

type Role = 'hips' | 'abdomen' | 'chest' | 'upperArm' | 'forearm' | 'thigh' | 'shin';

/** Membro afinado e arredondado (torno em volta do eixo Y, crescendo para -Y). */
function limbGeometry(len: number, rTop: number, rBottom: number, bulge = 0, bulgeAt = 0.35, radial = 20): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const n = 16;
  pts.push(new THREE.Vector2(0.0001, rTop * 0.55));
  for (let i = 0; i <= 3; i++) {
    const a = (i / 3) * (Math.PI / 2);
    pts.push(new THREE.Vector2(rTop * Math.sin(a), rTop * 0.55 * Math.cos(a)));
  }
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const r = rTop + (rBottom - rTop) * t + bulge * Math.exp(-Math.pow((t - bulgeAt) / 0.22, 2));
    pts.push(new THREE.Vector2(r, -len * t));
  }
  for (let i = 0; i <= 3; i++) {
    const a = (i / 3) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.max(0.0001, rBottom * Math.cos(a)), -len - rBottom * 0.55 * Math.sin(a)));
  }
  const g = new THREE.LatheGeometry(pts, radial);
  g.computeVertexNormals();
  return g;
}

function torsoGeometry(profile: [number, number][], scaleX: number, scaleZ: number): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 28);
  g.scale(scaleX, 1, scaleZ);
  g.computeVertexNormals();
  return g;
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpV3 = new THREE.Vector3();
const tA = new THREE.Vector3();
const tT = new THREE.Vector3();
const tKnee = new THREE.Vector3();
const tMid = new THREE.Vector3();
const tPole = new THREE.Vector3();
const tD = new THREE.Vector3();
const tBend = new THREE.Vector3();

/** Gira a junta para o eixo -Y local apontar para `to` e o +Z ficar o mais perto possível de `pole`. */
function aim(joint: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, pole: THREE.Vector3) {
  const yAxis = tmpV.subVectors(from, to).normalize(); // -Y aponta para o alvo
  const zAxis = tmpV2.copy(pole).addScaledVector(yAxis, -pole.dot(yAxis));
  if (zAxis.lengthSq() < 1e-8) zAxis.set(0, 0, 1).addScaledVector(yAxis, -yAxis.z);
  zAxis.normalize();
  const xAxis = tmpV3.crossVectors(yAxis, zAxis).normalize();
  tmpM.makeBasis(xAxis, yAxis, zAxis);
  setWorldQuaternion(joint, tmpQ.setFromRotationMatrix(tmpM));
}

function setWorldQuaternion(obj: THREE.Object3D, world: THREE.Quaternion) {
  const parent = obj.parent!;
  parent.updateWorldMatrix(true, false);
  parent.getWorldQuaternion(tmpQ2);
  obj.quaternion.copy(tmpQ2.invert().multiply(world));
  obj.updateMatrixWorld(true);
}

/** Resolve uma cadeia de dois ossos e escreve em `out` a posição do joelho/cotovelo. */
export function solveTwoBone(
  a: THREE.Vector3,
  target: THREE.Vector3,
  l1: number,
  l2: number,
  pole: THREE.Vector3,
  minReach: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const d = tD.subVectors(target, a);
  const dist = THREE.MathUtils.clamp(d.length(), Math.max(Math.abs(l1 - l2) + 0.01, minReach), l1 + l2 - 0.002);
  d.normalize();
  const cosA = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const bend = tBend.copy(pole).addScaledVector(d, -pole.dot(d));
  if (bend.lengthSq() < 1e-8) bend.set(0, 0, 1);
  bend.normalize();
  return out.copy(a).addScaledVector(d, l1 * cosA).addScaledVector(bend, l1 * sinA);
}

interface Limb {
  root: THREE.Object3D;
  mid: THREE.Object3D;
  end: THREE.Object3D;
  l1: number;
  l2: number;
  minReach: number;
}

/** Dedo com falanges encadeadas; a flexão de cada uma vem do grip. */
interface Finger {
  joints: THREE.Object3D[];
  /** Flexão máxima por falange (radianos) com a mão fechada. */
  curl: number[];
  /** Flexão relaxada (mão aberta). */
  rest: number[];
}

interface HairStrand {
  pivot: THREE.Object3D;
  /** Rotação de repouso e estado da mola. */
  base: THREE.Euler;
  angle: THREE.Vector2;
  vel: THREE.Vector2;
  stiffness: number;
}

export class SurferRig implements SurferAvatar {
  readonly root = new THREE.Group();
  readonly pelvis = new THREE.Object3D();
  readonly spine = new THREE.Object3D();
  readonly chest = new THREE.Object3D();
  readonly neck = new THREE.Object3D();
  readonly head = new THREE.Object3D();
  private legF: Limb;
  private legB: Limb;
  private armF: Limb;
  private armB: Limb;
  private fingersF: Finger[] = [];
  private fingersB: Finger[] = [];
  private toes: THREE.Object3D[] = [];
  private skin: THREE.MeshPhysicalMaterial;
  private suit: THREE.MeshPhysicalMaterial;
  private accent: THREE.MeshPhysicalMaterial;
  private hairMat: THREE.MeshStandardMaterial;
  private segments: { mesh: THREE.Mesh; role: Role }[] = [];
  private hairStyles = new Map<string, THREE.Object3D>();
  private hairStrands = new Map<string, HairStrand[]>();
  private activeHair = 'curto';
  private tattoos = new Map<string, THREE.Mesh>();
  private accessories = new Map<string, THREE.Object3D>();
  private suitBands: THREE.Mesh[] = [];
  private suitStyle = 'longo';
  private lastHeadPos = new THREE.Vector3();
  private lastHeadVel = new THREE.Vector3();
  private hasHeadPos = false;
  private wetness = 0;

  constructor() {
    this.skin = new THREE.MeshPhysicalMaterial({
      color: 0xb87c58,
      map: skinTexture(),
      roughness: 0.55,
      sheen: 0.22,
      sheenColor: new THREE.Color(0xff9b7a),
      sheenRoughness: 0.7,
      clearcoat: 0,
      clearcoatRoughness: 0.35,
    });
    this.suit = new THREE.MeshPhysicalMaterial({
      color: 0x16191d,
      roughness: 0.62,
      bumpMap: neopreneBump(),
      bumpScale: 0.6,
      sheen: 0.4,
      sheenColor: new THREE.Color(0x6c7a88),
      clearcoat: 0.1,
      clearcoatRoughness: 0.4,
    });
    this.accent = new THREE.MeshPhysicalMaterial({ color: 0x2fb4d6, roughness: 0.5, clearcoat: 0.2 });
    this.hairMat = new THREE.MeshStandardMaterial({ color: 0x3b2618, map: hairTexture(), bumpMap: hairTexture(), bumpScale: 0.8, roughness: 0.68 });

    this.root.add(this.pelvis);
    this.pelvis.add(this.spine);
    this.spine.position.set(0, BODY.spine, 0);
    this.spine.add(this.chest);
    this.chest.position.set(0, BODY.chest, 0);
    this.chest.add(this.neck);
    this.neck.position.set(0, BODY.neck, 0);
    this.neck.add(this.head);
    this.head.position.set(0, 0.085, 0.01);

    this.buildTorso();
    this.buildHead();
    // +x é o lado esquerdo do corpo. A base (qual pé vai à frente) é definida pelo animador.
    this.legF = this.buildLeg(1);
    this.legB = this.buildLeg(-1);
    this.armF = this.buildArm(1, this.fingersF);
    this.armB = this.buildArm(-1, this.fingersB);
    this.buildAccessories();
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }

  private seg(geo: THREE.BufferGeometry, role: Role, parent: THREE.Object3D, mat = this.suit): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    parent.add(m);
    this.segments.push({ mesh: m, role });
    return m;
  }

  /** Tampa esférica numa articulação, com o material do segmento indicado. */
  private cap(parent: THREE.Object3D, radius: number, role: Role, scale?: [number, number, number]) {
    const m = this.seg(new THREE.SphereGeometry(radius, 18, 14), role, parent);
    if (scale) m.scale.set(...scale);
    return m;
  }

  private buildTorso() {
    // Quadril: do alto das coxas até a cintura, com volume de glúteos atrás.
    this.seg(torsoGeometry([[0.0001, -0.11], [0.11, -0.1], [0.16, -0.05], [0.168, 0.02], [0.152, 0.1], [0.0001, 0.12]], 1, 0.7), 'hips', this.pelvis);
    const glute = this.cap(this.pelvis, 0.085, 'hips', [1.5, 0.9, 0.9]);
    glute.position.set(0, -0.04, -0.04);
    // Abdômen, mais estreito na cintura
    this.seg(torsoGeometry([[0.0001, -0.03], [0.148, -0.01], [0.138, 0.08], [0.146, 0.18], [0.155, 0.25], [0.0001, 0.29]], 1, 0.66), 'abdomen', this.spine);
    // Peito, dorsais e ombros
    this.seg(torsoGeometry([[0.0001, -0.03], [0.158, -0.01], [0.178, 0.08], [0.18, 0.15], [0.15, 0.2], [0.1, 0.225], [0.05, 0.24], [0.0001, 0.245]], 1.13, 0.62), 'chest', this.chest);
    // Trapézio ligando pescoço e ombro, achatado para não formar bolhas
    for (const s of [-1, 1]) {
      const trap = this.cap(this.chest, 0.05, 'chest', [1.7, 0.45, 0.85]);
      trap.position.set(s * 0.095, 0.205, -0.01);
    }
    // Pescoço sempre de pele, com esternocleidomastoideo sugerido
    const neckMesh = new THREE.Mesh(limbGeometry(0.11, 0.05, 0.06), this.skin);
    neckMesh.position.y = 0.105;
    this.neck.add(neckMesh);
    // Faixas de destaque da roupa (painel no peito e cintura)
    const band = new THREE.Mesh(torsoGeometry([[0.16, 0.08], [0.181, 0.11], [0.18, 0.135], [0.161, 0.165]], 1.14, 0.63), this.accent);
    this.chest.add(band);
    const waist = new THREE.Mesh(torsoGeometry([[0.17, -0.005], [0.17, 0.025]], 1.0, 0.71), this.accent);
    this.pelvis.add(waist);
    this.suitBands.push(band, waist);
  }

  private buildHead() {
    const h = this.head;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.1, 36, 28), this.skin);
    skull.scale.set(0.9, 1.1, 1.0);
    skull.position.y = 0.06;
    h.add(skull);
    // Mandíbula e queixo
    const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.075, 28, 18), this.skin);
    jaw.scale.set(0.92, 0.78, 1);
    jaw.position.set(0, -0.005, 0.025);
    h.add(jaw);
    const chin = new THREE.Mesh(new THREE.SphereGeometry(0.02, 16, 12), this.skin);
    chin.scale.set(1.25, 0.85, 0.8);
    chin.position.set(0, -0.03, 0.074);
    h.add(chin);
    // Nariz com ponte e ponta
    const bridge = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.03, 4, 10), this.skin);
    bridge.position.set(0, 0.052, 0.1);
    bridge.rotation.x = 0.35;
    h.add(bridge);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.0105, 14, 10), this.skin);
    tip.scale.set(1.2, 0.85, 0.9);
    tip.position.set(0, 0.033, 0.104);
    h.add(tip);
    const eyeWhiteMat = new THREE.MeshPhysicalMaterial({ color: 0xf2efe9, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 });
    const irisMat = new THREE.MeshStandardMaterial({ color: 0x4a3322, roughness: 0.25 });
    const pupilMat = new THREE.MeshStandardMaterial({ color: 0x0a0806, roughness: 0.2 });
    for (const s of [-1, 1]) {
      // Orelha: concha achatada com lóbulo
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.024, 14, 12), this.skin);
      ear.scale.set(0.4, 1, 0.75);
      ear.position.set(s * 0.09, 0.05, -0.005);
      ear.rotation.y = s * 0.3;
      h.add(ear);
      // Maçãs do rosto
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.022, 14, 10), this.skin);
      cheek.scale.set(1.1, 0.7, 0.5);
      cheek.position.set(s * 0.047, 0.036, 0.07);
      h.add(cheek);
      // Olho: esclera brilhante, íris e pupila, dentro da órbita
      const eye = new THREE.Group();
      eye.position.set(s * 0.034, 0.066, 0.084);
      const white = new THREE.Mesh(new THREE.SphereGeometry(0.0125, 16, 12), eyeWhiteMat);
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.0062, 14, 10), irisMat);
      iris.position.z = 0.009;
      iris.scale.z = 0.5;
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.0028, 10, 8), pupilMat);
      pupil.position.z = 0.0118;
      eye.add(white, iris, pupil);
      h.add(eye);
      // Pálpebra superior
      const lid = new THREE.Mesh(new THREE.SphereGeometry(0.0138, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), this.skin);
      lid.position.copy(eye.position);
      lid.rotation.x = 0.5;
      h.add(lid);
      // Sobrancelha
      const brow = new THREE.Mesh(new THREE.CapsuleGeometry(0.0035, 0.024, 3, 6), this.hairMat);
      brow.rotation.z = Math.PI / 2 + s * 0.12;
      brow.position.set(s * 0.036, 0.086, 0.096);
      h.add(brow);
    }
    // Lábios (boca) superior e inferior
    const lipMat = new THREE.MeshPhysicalMaterial({ color: 0xa5574a, roughness: 0.4, clearcoat: 0.3 });
    const upper = new THREE.Mesh(new THREE.SphereGeometry(0.017, 14, 8), lipMat);
    upper.scale.set(1.45, 0.32, 0.55);
    upper.position.set(0, 0.006, 0.094);
    const lower = new THREE.Mesh(new THREE.SphereGeometry(0.016, 14, 8), lipMat);
    lower.scale.set(1.3, 0.38, 0.55);
    lower.position.set(0, -0.006, 0.092);
    h.add(upper, lower);

    this.buildHair();
  }

  /**
   * Penteados: uma calota de couro cabeludo mais mechas com mola. As mechas
   * respondem à aceleração da cabeça e ao vento (movimento secundário).
   */
  private buildHair() {
    const h = this.head;
    const scalp = (scale: number, cut = 0.58, messy = 0.004) => {
      const g = new THREE.SphereGeometry(0.104 * scale, 48, 28, 0, Math.PI * 2, 0, Math.PI * cut);
      // Relevo irregular de tufos: desloca os vértices para fora com ruído suave.
      const p = g.attributes.position as THREE.BufferAttribute;
      const v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        const n = Math.sin(v.x * 90) * Math.cos(v.z * 80) + Math.sin((v.x + v.z) * 140) * 0.5;
        v.multiplyScalar(1 + (messy * n) / 0.104);
        p.setXYZ(i, v.x, v.y, v.z);
      }
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, this.hairMat);
      m.scale.set(0.93, 1.12, 1.04);
      m.position.set(0, 0.078, -0.016);
      // Inclina para trás para a linha do cabelo ficar na testa, acima das sobrancelhas.
      m.rotation.x = -0.82;
      return m;
    };
    const strand = (group: THREE.Group, list: HairStrand[], pos: [number, number, number], rot: [number, number, number], len: number, r: number, stiffness: number) => {
      const pivot = new THREE.Object3D();
      pivot.position.set(...pos);
      pivot.rotation.set(...rot);
      const m = new THREE.Mesh(limbGeometry(len, r, r * 0.25, r * 0.15, 0.3, 10), this.hairMat);
      m.scale.set(1.3, 1, 0.6);
      pivot.add(m);
      group.add(pivot);
      list.push({ pivot, base: pivot.rotation.clone(), angle: new THREE.Vector2(), vel: new THREE.Vector2(), stiffness });
    };

    const styles: [string, (g: THREE.Group, l: HairStrand[]) => void][] = [
      ['curto', (g, l) => {
        // Cabelo curto: volume despenteado no próprio couro cabeludo, sem mechas soltas.
        g.add(scalp(1.06, 0.56, 0.012));
      }],
      ['longo', (g, l) => {
        g.add(scalp(1.06, 0.62));
        // Mechas longas caindo até os ombros
        for (let i = 0; i < 11; i++) {
          const a = (i / 10 - 0.5) * 2.6;
          strand(g, l, [Math.sin(a) * 0.085, 0.1, Math.cos(a) * -0.07], [0.25 + Math.abs(a) * 0.05, a * 0.2, -Math.sin(a) * 0.25], 0.2 + (1 - Math.abs(a) / 1.3) * 0.06, 0.022, 45);
        }
      }],
      ['coque', (g, l) => {
        g.add(scalp(1.03));
        const bun = new THREE.Mesh(new THREE.SphereGeometry(0.045, 18, 14), this.hairMat);
        bun.position.set(0, 0.15, -0.075);
        g.add(bun);
        strand(g, l, [0, 0.17, -0.09], [0.5, 0, 0], 0.07, 0.018, 70);
        strand(g, l, [0.075, 0.07, 0.03], [0.3, 0, 0.2], 0.06, 0.009, 90);
        strand(g, l, [-0.075, 0.07, 0.03], [0.3, 0, -0.2], 0.06, 0.009, 90);
      }],
      ['raspado', (g) => {
        g.add(scalp(1.005, 0.6));
      }],
    ];
    for (const [id, build] of styles) {
      const g = new THREE.Group();
      const list: HairStrand[] = [];
      build(g, list);
      g.visible = false;
      h.add(g);
      this.hairStyles.set(id, g);
      this.hairStrands.set(id, list);
    }
  }

  private buildLeg(side: 1 | -1): Limb {
    const root = new THREE.Object3D();
    root.position.set(side * BODY.hipHalfWidth, -0.06, 0);
    this.pelvis.add(root);
    this.cap(root, 0.088, 'thigh');
    this.seg(limbGeometry(BODY.thigh, 0.088, 0.056, 0.016, 0.3), 'thigh', root);
    const mid = new THREE.Object3D();
    mid.position.y = -BODY.thigh;
    root.add(mid);
    // Joelho e canela (a panturrilha vem do volume do próprio torno)
    this.cap(mid, 0.054, 'shin');
    this.seg(limbGeometry(BODY.shin, 0.055, 0.035, 0.012, 0.22), 'shin', mid);
    const end = new THREE.Object3D();
    end.position.y = -BODY.shin;
    mid.add(end);
    this.buildFoot(end);
    // Tatuagem de ondas na panturrilha (só aparece com a perna descoberta)
    if (side === 1) {
      const tat = new THREE.Mesh(limbGeometry(0.12, 0.0505, 0.046), new THREE.MeshStandardMaterial({ map: tattooTexture('ondas'), transparent: true, roughness: 0.5, depthWrite: false }));
      tat.position.y = -0.1;
      tat.visible = false;
      mid.add(tat);
      this.tattoos.set('ondas', tat);
    }
    return { root, mid, end, l1: BODY.thigh, l2: BODY.shin, minReach: MIN_REACH.leg };
  }

  /** Pé com calcanhar, arco, peito do pé e cinco dedos (o dedão maior). */
  private buildFoot(ankle: THREE.Object3D) {
    const sole = -BODY.ankleHeight;
    const ankleBone = new THREE.Mesh(new THREE.SphereGeometry(0.036, 14, 10), this.skin);
    ankleBone.scale.set(1.15, 1, 1);
    ankle.add(ankleBone);
    const heel = new THREE.Mesh(new THREE.SphereGeometry(0.034, 16, 12), this.skin);
    heel.scale.set(1, 1, 1.15);
    heel.position.set(0, sole + 0.032, -0.025);
    ankle.add(heel);
    // Corpo do pé: mais alto atrás (peito do pé), achatado na frente.
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 22, 14), this.skin);
    body.scale.set(0.043, 0.03, 0.095);
    body.position.set(0, sole + 0.03, 0.06);
    body.rotation.x = -0.12;
    ankle.add(body);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), this.skin);
    ball.scale.set(0.047, 0.02, 0.03);
    ball.position.set(0, sole + 0.02, 0.135);
    ankle.add(ball);
    // Dedos: o lado do dedão fica para dentro (o pé é espelhado pela rotação do tornozelo).
    const toeData: [number, number, number][] = [
      [0.026, 0.0115, 0.032], [0.009, 0.0085, 0.025], [-0.006, 0.008, 0.023], [-0.019, 0.0075, 0.02], [-0.031, 0.0068, 0.017],
    ];
    for (const [x, r, len] of toeData) {
      const joint = new THREE.Object3D();
      joint.position.set(x, sole + 0.012, 0.152);
      const toe = new THREE.Mesh(new THREE.CapsuleGeometry(r, len - 2 * r, 3, 8), this.skin);
      toe.rotation.x = Math.PI / 2;
      toe.position.z = len / 2;
      joint.add(toe);
      ankle.add(joint);
      this.toes.push(joint);
    }
  }

  private buildArm(side: 1 | -1, fingers: Finger[]): Limb {
    const root = new THREE.Object3D();
    root.position.set(side * BODY.shoulderHalfWidth, 0.19, -0.005);
    this.chest.add(root);
    // Deltoide arredondando o ombro
    this.cap(root, 0.046, 'upperArm', [1, 0.85, 0.92]).position.y = -0.012;
    this.seg(limbGeometry(BODY.upperArm, 0.052, 0.038, 0.012, 0.35), 'upperArm', root);
    const mid = new THREE.Object3D();
    mid.position.y = -BODY.upperArm;
    root.add(mid);
    this.cap(mid, 0.035, 'forearm');
    this.seg(limbGeometry(BODY.forearm, 0.041, 0.026, 0.01, 0.2), 'forearm', mid);
    const end = new THREE.Object3D();
    end.position.y = -BODY.forearm;
    mid.add(end);
    this.buildHand(end, side, fingers);
    if (side === 1) {
      const tat = new THREE.Mesh(limbGeometry(0.1, 0.039, 0.033), new THREE.MeshStandardMaterial({ map: tattooTexture('tribal'), transparent: true, roughness: 0.5, depthWrite: false }));
      tat.position.y = -0.08;
      tat.visible = false;
      mid.add(tat);
      this.tattoos.set('tribal', tat);
    }
    return { root, mid, end, l1: BODY.upperArm, l2: BODY.forearm, minReach: MIN_REACH.arm };
  }

  /** Mão: palma, quatro dedos com três falanges e polegar com duas, que se fecham juntos. */
  private buildHand(wrist: THREE.Object3D, _side: 1 | -1, fingers: Finger[]) {
    const wristBone = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), this.skin);
    wristBone.scale.set(1.2, 0.8, 0.85);
    wrist.add(wristBone);
    const palm = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), this.skin);
    palm.scale.set(0.042, 0.048, 0.017);
    palm.position.y = -0.048;
    wrist.add(palm);
    // Dedos ao longo de x (largura da mão); a palma olha para +z.
    const specs: [number, number, number[]][] = [
      // [posição x, raio, comprimentos das falanges]
      [0.027, 0.0082, [0.042, 0.026, 0.02]],
      [0.009, 0.0086, [0.046, 0.029, 0.021]],
      [-0.009, 0.0082, [0.043, 0.027, 0.02]],
      [-0.026, 0.0072, [0.034, 0.021, 0.017]],
    ];
    for (const [x, r, lens] of specs) {
      const f: Finger = { joints: [], curl: [1.45, 1.6, 1.1], rest: [0.18, 0.25, 0.18] };
      let parent: THREE.Object3D = wrist;
      let y = -0.092;
      for (let i = 0; i < 3; i++) {
        const j = new THREE.Object3D();
        j.position.set(i === 0 ? x : 0, y, 0);
        const bone = new THREE.Mesh(new THREE.CapsuleGeometry(r * (1 - i * 0.12), lens[i] - r, 3, 8), this.skin);
        bone.position.y = -lens[i] / 2;
        j.add(bone);
        parent.add(j);
        f.joints.push(j);
        parent = j;
        y = -lens[i];
      }
      fingers.push(f);
    }
    // Polegar: sai da base da palma, apontando para dentro e para frente.
    const thumb: Finger = { joints: [], curl: [0.9, 1.2], rest: [0.3, 0.2] };
    const base = new THREE.Object3D();
    base.position.set(0.03, -0.042, 0.012);
    base.rotation.set(0.55, 0, 0.45);
    wrist.add(base);
    let parent: THREE.Object3D = base;
    for (const [i, len] of [0.034, 0.028].entries()) {
      const j = new THREE.Object3D();
      j.position.y = i === 0 ? 0 : -0.034;
      const bone = new THREE.Mesh(new THREE.CapsuleGeometry(0.0098 - i * 0.001, len - 0.01, 3, 8), this.skin);
      bone.position.y = -len / 2;
      j.add(bone);
      parent.add(j);
      thumb.joints.push(j);
      parent = j;
    }
    fingers.push(thumb);
  }

  private buildAccessories() {
    const colar = new THREE.Group();
    const cord = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.0025, 6, 32), new THREE.MeshStandardMaterial({ color: 0x3b2a1a, roughness: 0.8 }));
    cord.rotation.x = Math.PI / 2 - 0.35;
    colar.add(cord);
    const shellMat = new THREE.MeshPhysicalMaterial({ color: 0xf4ead8, roughness: 0.3, clearcoat: 0.6 });
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * 0.15 + (i / 8) * Math.PI * 0.7;
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), shellMat);
      s.position.set(Math.cos(a) * 0.062, -Math.sin(a) * 0.062 * Math.sin(0.35), Math.sin(a) * 0.062);
      colar.add(s);
    }
    colar.position.set(0, 0.235, 0.01);
    colar.visible = false;
    this.chest.add(colar);
    this.accessories.set('colar', colar);

    const relogio = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.031, 0.03, 20, 1, true), new THREE.MeshPhysicalMaterial({ color: 0x111418, roughness: 0.4, clearcoat: 0.8, side: THREE.DoubleSide }));
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.008, 20), new THREE.MeshPhysicalMaterial({ color: 0xf0b429, metalness: 0.6, roughness: 0.25 }));
    face.rotation.z = Math.PI / 2;
    face.position.x = -0.031;
    relogio.add(face);
    relogio.position.y = -BODY.forearm + 0.02;
    relogio.visible = false;
    this.armB.mid.add(relogio);
    this.accessories.set('relogio', relogio);

    // Tornozeleira do leash na perna de trás (esquerda, com o pé direito à frente). A corda é simulada pela cena.
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.043, 0.013, 8, 22), new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.7 }));
    strap.rotation.x = Math.PI / 2;
    strap.position.y = 0.03;
    this.legF.end.add(strap);
  }

  applyLook(l: SurferLook) {
    this.suit.color.setHex(l.suit.color ?? 0x16191d);
    this.accent.color.setHex(l.suit.accent ?? 0x2fb4d6);
    this.suitStyle = l.suit.style ?? 'longo';
    // Bermuda é tecido (sem relevo de neoprene e sem brilho de borracha).
    const fabric = this.suitStyle === 'bermuda';
    this.suit.bumpScale = fabric ? 0.15 : 0.6;
    this.suit.sheen = fabric ? 0.6 : 0.4;
    this.suit.roughness = fabric ? 0.85 : 0.62;
    const skinRoles: Record<string, Role[]> = {
      longo: [],
      curto: ['forearm', 'shin'],
      bermuda: ['abdomen', 'chest', 'upperArm', 'forearm', 'shin'],
    };
    const bare = skinRoles[this.suitStyle] ?? [];
    for (const s of this.segments) s.mesh.material = bare.includes(s.role) ? this.skin : this.suit;
    this.suitBands[0].visible = this.suitStyle !== 'bermuda';
    this.activeHair = l.hair.style ?? 'curto';
    for (const [id, g] of this.hairStyles) g.visible = id === this.activeHair;
    this.hairMat.color.setHex(l.hairColor.color ?? 0x3b2618);
    const tattoo = l.tattoo.style ?? 'nenhuma';
    for (const [id, m] of this.tattoos) {
      const covered = id === 'tribal' ? !bare.includes('forearm') : !bare.includes('shin');
      m.visible = id === tattoo && !covered;
    }
    const acc = l.accessory.style ?? 'leash';
    for (const [id, o] of this.accessories) o.visible = id === acc;
    this.setWetness(this.wetness);
  }

  /** Zera a memória do movimento secundário (nova onda ou cena de teste). */
  resetDynamics() {
    this.hasHeadPos = false;
    this.lastHeadVel.set(0, 0, 0);
    for (const list of this.hairStrands.values()) {
      for (const s of list) {
        s.angle.set(0, 0);
        s.vel.set(0, 0);
      }
    }
  }

  /** Pele e roupa ficam mais brilhantes molhadas (0 seco, 1 encharcado). */
  setWetness(w: number) {
    this.wetness = THREE.MathUtils.clamp(w, 0, 1);
    const fabric = this.suitStyle === 'bermuda';
    this.skin.clearcoat = 0.45 * this.wetness;
    this.skin.roughness = 0.55 - 0.2 * this.wetness;
    this.suit.clearcoat = (fabric ? 0.05 : 0.1) + (fabric ? 0.15 : 0.5) * this.wetness;
    this.suit.clearcoatRoughness = 0.4 - 0.25 * this.wetness;
    this.hairMat.roughness = 0.68 - 0.3 * this.wetness;
  }

  applyPose(p: WorldPose) {
    // Pelve no mundo
    this.root.position.set(0, 0, 0);
    this.root.quaternion.identity();
    this.root.updateMatrixWorld(true);
    const parent = this.root.parent;
    if (parent) {
      parent.updateWorldMatrix(true, false);
      this.pelvis.position.copy(p.pelvisPos).applyMatrix4(tmpM.copy(parent.matrixWorld).invert());
      parent.getWorldQuaternion(tmpQ2);
      this.pelvis.quaternion.copy(tmpQ2.invert().multiply(p.pelvisQuat));
    } else {
      this.pelvis.position.copy(p.pelvisPos);
      this.pelvis.quaternion.copy(p.pelvisQuat);
    }
    // Coluna: limites de flexão e torção para não dobrar além do possível.
    const bend = THREE.MathUtils.clamp(p.spineBend, -0.4, 1.5);
    const twist = THREE.MathUtils.clamp(p.chestTwist, -0.9, 0.9);
    const side = THREE.MathUtils.clamp(p.spineSide, -0.45, 0.45);
    this.spine.rotation.set(bend * 0.45, twist * 0.4, side * 0.5);
    this.chest.rotation.set(bend * 0.55, twist * 0.6, side * 0.5);
    const headPitch = THREE.MathUtils.clamp(p.headPitch, -0.9, 0.9);
    const headYaw = THREE.MathUtils.clamp(p.headYaw, -1.2, 1.2);
    this.neck.rotation.set(-bend * 0.5 + headPitch * 0.5, headYaw * 0.4, 0);
    this.head.rotation.set(headPitch * 0.5, headYaw * 0.6, 0);
    this.root.updateMatrixWorld(true);

    // legF/armF são o lado esquerdo do corpo (+x do rig); legB/armB, o direito.
    this.solveLimb(this.legF, p.footLeft.pos, p.kneePole, p.footLeft.quat, BODY.ankleHeight);
    this.solveLimb(this.legB, p.footRight.pos, p.kneePole, p.footRight.quat, BODY.ankleHeight);
    this.solveLimb(this.armF, p.handLeft, p.elbowPole, null, 0);
    this.solveLimb(this.armB, p.handRight, p.elbowPole, null, 0);
    this.applyGrip(this.fingersF, p.gripLeft);
    this.applyGrip(this.fingersB, p.gripRight);
  }

  private applyGrip(fingers: Finger[], grip: number) {
    const g = THREE.MathUtils.clamp(grip, 0, 1);
    for (const f of fingers) {
      for (let i = 0; i < f.joints.length; i++) {
        // Flexão positiva em x fecha o dedo em direção à palma (+z).
        f.joints[i].rotation.x = f.rest[i] + (f.curl[i] - f.rest[i]) * g;
      }
    }
  }

  private solveLimb(limb: Limb, target: THREE.Vector3, pole: THREE.Vector3, endQuat: THREE.Quaternion | null, lift: number) {
    const a = limb.root.getWorldPosition(tA);
    // Para os pés, o alvo é o tornozelo, um pouco acima da sola.
    const t = tT.copy(target);
    if (endQuat && lift) t.add(tmpV.set(0, lift, -0.01).applyQuaternion(endQuat));
    const knee = solveTwoBone(a, t, limb.l1, limb.l2, pole, limb.minReach, tKnee);
    aim(limb.root, a, knee, pole);
    const kneeWorld = limb.mid.getWorldPosition(tMid);
    const poleLower = endQuat ? pole : tPole.copy(pole).negate();
    aim(limb.mid, kneeWorld, t, poleLower);
    if (endQuat) setWorldQuaternion(limb.end, endQuat);
  }

  /**
   * Movimento secundário do cabelo: cada mecha é uma mola angular que reage à
   * aceleração da cabeça (no referencial dela) e ao vento.
   */
  update(dt: number, wind: THREE.Vector3) {
    if (dt <= 0) return;
    const headPos = this.head.getWorldPosition(tmpV3);
    if (!this.hasHeadPos) {
      this.lastHeadPos.copy(headPos);
      this.hasHeadPos = true;
    }
    const vel = tmpV2.subVectors(headPos, this.lastHeadPos).divideScalar(dt);
    const acc = tmpV.subVectors(vel, this.lastHeadVel).divideScalar(dt).clampLength(0, 60);
    this.lastHeadVel.copy(vel);
    this.lastHeadPos.copy(headPos);
    // Força no referencial da cabeça: inércia (contrária à aceleração), gravidade e vento.
    this.head.getWorldQuaternion(tmpQ).invert();
    const force = acc.multiplyScalar(-0.012).add(tD.set(0, -0.08, 0)).addScaledVector(wind, 0.02).applyQuaternion(tmpQ);
    const strands = this.hairStrands.get(this.activeHair) ?? [];
    for (const s of strands) {
      const k = s.stiffness;
      const damping = 2 * Math.sqrt(k) * 0.55;
      // A mecha gira em x (para frente/trás) e em z (para os lados).
      const ax = k * (-s.angle.x) - damping * s.vel.x + force.z * 40;
      const az = k * (-s.angle.y) - damping * s.vel.y - force.x * 40;
      s.vel.x += ax * dt;
      s.vel.y += az * dt;
      s.angle.x = THREE.MathUtils.clamp(s.angle.x + s.vel.x * dt, -0.7, 0.7);
      s.angle.y = THREE.MathUtils.clamp(s.angle.y + s.vel.y * dt, -0.6, 0.6);
      s.pivot.rotation.set(s.base.x + s.angle.x, s.base.y, s.base.z + s.angle.y);
    }
    // Os dedos dos pés acompanham o apoio: levemente estendidos no deck.
    for (const t of this.toes) t.rotation.x = -0.08;
  }

  /** Tornozelo do pé de trás, onde fica o leash (esquerdo: pé direito à frente). */
  ankleBack(): THREE.Vector3 {
    return this.legF.end.getWorldPosition(new THREE.Vector3());
  }

  hipWorld(side: 'left' | 'right'): THREE.Vector3 {
    return (side === 'left' ? this.legF : this.legB).root.getWorldPosition(new THREE.Vector3());
  }

  /** Posição do pulso no mundo, para testes e cenas de validação. */
  wristWorld(side: 'left' | 'right'): THREE.Vector3 {
    return (side === 'left' ? this.armF : this.armB).end.getWorldPosition(new THREE.Vector3());
  }

  ankleWorld(side: 'left' | 'right'): THREE.Vector3 {
    return (side === 'left' ? this.legF : this.legB).end.getWorldPosition(new THREE.Vector3());
  }
}
