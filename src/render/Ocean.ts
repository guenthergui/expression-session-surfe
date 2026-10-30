import * as THREE from 'three';
import type { LocationVisual } from '../core/types';
import {
  FieldSampler,
  breakX,
  crestHeight,
  crestOffset,
  faceWidth,
  mainProfile,
  streakFrom,
  swellAmplitudes,
  swellColumn,
  swellFrom,
  swellRow,
  type WaveState,
} from '../sim/waveField';
import { waterNormalTexture } from './textures';

export interface WakePoint {
  x: number;
  z: number;
  /** Idade em segundos. */
  age: number;
  strength: number;
}

export const WAKE_LIFE = 2.8;

// Oceano: uma malha deslocada na CPU a cada quadro pelo mesmo campo de altura
// usado na física, mais densa perto da onda. Cor por profundidade e espessura
// (a crista fica translúcida e turquesa), espuma como atributo que deixa a água
// branca e áspera no shader, e um plano distante até o horizonte.

function axis(min: number, max: number, denseMin: number, denseMax: number, fine: number, coarse: number): number[] {
  const out: number[] = [];
  let v = min;
  while (v < max) {
    out.push(v);
    const inDense = v >= denseMin && v < denseMax;
    v += inDense ? fine : coarse;
  }
  out.push(max);
  return out;
}

function smooth(a: number, b: number, v: number) {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export class Ocean {
  readonly mesh: THREE.Mesh;
  readonly far: THREE.Mesh;
  readonly lip: THREE.Mesh;
  private geo: THREE.BufferGeometry;
  private xs: number[];
  private zs: number[];
  private baseX = 0;
  private deep = new THREE.Color();
  private shallow = new THREE.Color();
  private foamTint = new THREE.Color();
  readonly material: THREE.MeshPhysicalMaterial;
  private lipGeo: THREE.BufferGeometry;
  private heights: Float32Array;
  private sampler: FieldSampler | null = null;
  private samplerKey = '';
  private rowTrig = new Float64Array(12);
  private detailA: THREE.Texture | null = null;
  private detailB: THREE.Texture | null = null;
  private farNormal: THREE.Texture | null = null;
  /** Luz do sol e cores para a espuma e a translucidez da crista (compartilhados com o shader). */
  private uniforms = {
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color(1, 1, 1) },
    uSssColor: { value: new THREE.Color(0x1fb5a8) },
    uFoamColor: { value: new THREE.Color(0.93, 0.96, 0.98) },
  };
  private cols: { x: number; trig: Float64Array; edgeX: number; offset: number; crestH: number; broken: number; nearBreak: number }[] = [];

  constructor(scene: THREE.Scene, step: number, detailNormals = true) {
    this.xs = axis(-80, 100, -18, 38, step, step * 5);
    this.zs = axis(-110, 90, -8, 14, step, 2.6);
    const nx = this.xs.length;
    const nz = this.zs.length;
    this.geo = new THREE.BufferGeometry();
    const pos = new Float32Array(nx * nz * 3);
    const col = new Float32Array(nx * nz * 3);
    const foam = new Float32Array(nx * nz);
    const thin = new Float32Array(nx * nz);
    const idx: number[] = [];
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i;
        idx.push(a, a + nx, a + 1, a + 1, a + nx, a + nx + 1);
      }
    }
    this.geo.setIndex(idx);
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.geo.setAttribute('foam', new THREE.BufferAttribute(foam, 1));
    this.geo.setAttribute('thin', new THREE.BufferAttribute(thin, 1));
    this.geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nx * nz * 3), 3));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(nx * nz * 2), 2));
    this.heights = new Float32Array(nx * nz);

    this.material = new THREE.MeshPhysicalMaterial({
      // Água tem pouca reflexão difusa: o tom vem quase todo da cor de profundidade.
      color: 0x6a6a6a,
      vertexColors: true,
      roughness: 0.17,
      metalness: 0,
      ior: 1.333,
      envMapIntensity: 0.34,
      specularIntensity: 0.55,
      side: THREE.DoubleSide,
    });
    if (detailNormals) {
      // Detalhe fino em duas escalas: normais da camada base e do verniz (clearcoat)
      // andam em direções e velocidades diferentes, quebrando a repetição.
      this.detailA = waterNormalTexture(3).clone();
      this.detailB = waterNormalTexture(11).clone();
      this.detailA.needsUpdate = this.detailB.needsUpdate = true;
      this.detailA.repeat.set(1, 1);
      this.detailB.repeat.set(2.7, 2.7);
      this.material.normalMap = this.detailA;
      this.material.normalScale.set(0.16, 0.16);
      this.material.clearcoat = 0.3;
      this.material.clearcoatRoughness = 0.1;
      this.material.clearcoatNormalMap = this.detailB;
      this.material.clearcoatNormalScale.set(0.1, 0.1);
    }
    const u = this.uniforms;
    this.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float foam;\nattribute float thin;\nvarying float vFoam;\nvarying float vThin;\nvarying vec3 vWPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFoam = foam;\nvThin = thin;\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying float vFoam;
          varying float vThin;
          varying vec3 vWPos;
          uniform float uTime;
          uniform vec3 uSunDir;
          uniform vec3 uSunColor;
          uniform vec3 uSssColor;
          uniform vec3 uFoamColor;
          float oHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
          float oNoise(vec2 p) {
            vec2 i = floor(p); vec2 f = fract(p); vec2 w = f * f * (3.0 - 2.0 * f);
            return mix(mix(oHash(i), oHash(i + vec2(1.0, 0.0)), w.x), mix(oHash(i + vec2(0.0, 1.0)), oHash(i + vec2(1.0, 1.0)), w.x), w.y);
          }
          // Padrão rendado da espuma: manchas grandes que se desfazem em bolhas.
          float foamPattern(vec2 p) {
            float a = oNoise(p * 0.7 + vec2(uTime * 0.05, uTime * 0.02));
            float b = oNoise(p * 2.3 - vec2(uTime * 0.11, -uTime * 0.04));
            float c = oNoise(p * 7.1 + vec2(uTime * 0.2, uTime * 0.13));
            return a * 0.5 + b * 0.32 + c * 0.18;
          }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          float foamP = foamPattern(vWPos.xz);
          float foamF = min(clamp((vFoam * 1.25 - (1.0 - foamP) * 1.05) * 2.4, 0.0, 1.0), vFoam * 1.5);
          diffuseColor.rgb = mix(diffuseColor.rgb, uFoamColor, foamF);`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          // Ao longe, as ondulações menores que um pixel espalham o reflexo: mais rugoso, sem cintilação.
          roughnessFactor = mix(roughnessFactor, 0.34, smoothstep(30.0, 260.0, length(vViewPosition)));
          roughnessFactor = mix(roughnessFactor, 0.85, foamF);`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          // Translucidez: a luz do sol atravessa a água fina da crista e do alto da face.
          vec3 toCam = normalize(cameraPosition - vWPos);
          float back = pow(clamp(dot(-toCam, uSunDir) * 0.5 + 0.5, 0.0, 1.0), 4.0);
          float sss = vThin * (0.18 + back * 1.1) * (1.0 - foamF);
          totalEmissiveRadiance += uSssColor * uSunColor * sss;`);
      if (detailNormals) {
        // Duas leituras do mapa em escalas e direções diferentes (some a repetição)
        // e relevo que suaviza com a distância (some o padrão de grade no horizonte).
        shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `
          vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
          vec2 uvB = mat2(0.8, -0.6, 0.6, 0.8) * vNormalMapUv * 0.37 + vec2(uTime * -0.006, uTime * 0.008);
          vec3 mapB = texture2D( normalMap, uvB ).xyz * 2.0 - 1.0;
          mapN = vec3(mapN.xy + mapB.xy * 0.7, mapN.z);
          float nFade = mix(1.0, 0.07, smoothstep(12.0, 140.0, length(vViewPosition)));
          mapN.xy *= normalScale * nFade;
          normal = normalize( tbn * mapN );`);
      }
    };

    this.mesh = new THREE.Mesh(this.geo, this.material);
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    const farMat = new THREE.MeshPhysicalMaterial({ color: 0x0a3d5c, roughness: 0.16, metalness: 0, ior: 1.333, envMapIntensity: 0.42 });
    if (detailNormals) {
      // Ondulação até o horizonte: o mesmo mapa de normais em escala bem maior.
      this.farNormal = waterNormalTexture(3).clone();
      this.farNormal.needsUpdate = true;
      this.farNormal.repeat.set(220, 220);
      farMat.normalMap = this.farNormal;
      farMat.normalScale.set(0.12, 0.12);
    }
    this.far = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2), farMat);
    // Abaixo dos cavados do swell, para o plano distante nunca aparecer através da malha.
    this.far.position.y = -0.5;
    scene.add(this.far);

    // Lip da onda: uma lâmina curva que se projeta para frente onde a onda quebra.
    this.lipGeo = new THREE.BufferGeometry();
    const lipN = 28 * 10;
    this.lipGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lipN * 3), 3));
    this.lipGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(lipN * 3), 3));
    this.lipGeo.setAttribute('foam', new THREE.BufferAttribute(new Float32Array(lipN), 1));
    // O lip é a parte mais fina da onda: translucidez máxima.
    this.lipGeo.setAttribute('thin', new THREE.BufferAttribute(new Float32Array(lipN).fill(1), 1));
    this.lipGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(lipN * 2), 2));
    const lipIdx: number[] = [];
    for (let i = 0; i < 27; i++) {
      for (let k = 0; k < 9; k++) {
        const a = i * 10 + k;
        lipIdx.push(a, a + 1, a + 10, a + 1, a + 11, a + 10);
      }
    }
    this.lipGeo.setIndex(lipIdx);
    this.lip = new THREE.Mesh(this.lipGeo, this.material);
    this.lip.frustumCulled = false;
    this.lip.castShadow = false;
    scene.add(this.lip);
  }

  /** Direção e cor do sol, para a translucidez da crista. */
  setLight(sunDir: THREE.Vector3, sunColor: THREE.Color) {
    this.uniforms.uSunDir.value.copy(sunDir);
    this.uniforms.uSunColor.value.copy(sunColor);
  }

  setColors(v: LocationVisual) {
    this.deep.setHex(v.deepColor);
    this.shallow.setHex(v.shallowColor);
    this.foamTint.setHex(v.foamTint);
    this.uniforms.uFoamColor.value.setHex(v.foamTint).multiplyScalar(0.95);
    // A luz que atravessa a água sai mais verde-azulada que a própria cor rasa.
    this.uniforms.uSssColor.value.setHex(v.shallowColor).lerp(new THREE.Color(0x1fd0a0), 0.35).multiplyScalar(0.55);
    (this.far.material as THREE.MeshPhysicalMaterial).color.setHex(v.deepColor);
  }

  /** Atualiza a malha centrada em x, usando o estado atual da onda. */
  update(w: WaveState, centerX: number, wake: readonly WakePoint[] = []) {
    // A malha anda em passos inteiros para a amostragem não "tremer".
    this.baseX = Math.round(centerX / 4) * 4;
    const pos = this.geo.attributes.position.array as Float32Array;
    const col = this.geo.attributes.color.array as Float32Array;
    const foam = this.geo.attributes.foam.array as Float32Array;
    const thinA = this.geo.attributes.thin.array as Float32Array;
    this.uniforms.uTime.value = w.time;
    const uv = this.geo.attributes.uv.array as Float32Array;
    // As ondulações de detalhe andam com o tempo, em direções diferentes.
    if (this.detailA && this.detailB) {
      this.detailA.offset.set(w.time * 0.011, w.time * 0.017);
      this.detailB.offset.set(-w.time * 0.023, w.time * 0.009);
    }
    if (this.farNormal) this.farNormal.offset.set(w.time * 0.002, w.time * 0.003);
    const nx = this.xs.length;
    const nz = this.zs.length;
    const H = Math.max(0.3, w.height);
    const F = faceWidth(w);
    const xMin = this.xs[0];
    const xMax = this.xs[nx - 1];
    const key = `${w.height}|${w.power}|${w.windSpeed}|${w.windDir.x}|${w.windDir.z}|${w.pool}`;
    if (!this.sampler || key !== this.samplerKey) {
      this.sampler = new FieldSampler(w);
      this.samplerKey = key;
    }
    this.sampler.w = w;
    const S = this.sampler;
    // Tudo o que só depende de x é calculado uma vez por coluna (estruturas reaproveitadas).
    if (this.cols.length !== nx) {
      this.cols = this.xs.map(() => ({ x: 0, trig: new Float64Array(12), edgeX: 0, offset: 0, crestH: 0, broken: 0, nearBreak: 0 }));
    }
    const cols = this.cols;
    for (let i = 0; i < nx; i++) {
      const lx = this.xs[i];
      const cc = cols[i];
      cc.x = lx + this.baseX;
      swellColumn(w, cc.x, cc.trig);
      cc.edgeX = smooth(xMin, xMin + 30, lx) * (1 - smooth(xMax - 30, xMax, lx));
      const info = S.column(cc.x);
      cc.offset = info.offset;
      cc.crestH = info.crestH;
      cc.broken = info.broken;
      cc.nearBreak = info.nearBreak;
    }
    const amp = swellAmplitudes(w);
    const row = this.rowTrig;
    const dr = this.deep.r, dg = this.deep.g, db = this.deep.b;
    const sr = this.shallow.r - dr, sg = this.shallow.g - dg, sb = this.shallow.b - db;
    for (let j = 0; j < nz; j++) {
      const z = this.zs[j];
      // Perto das bordas a altura vai a zero para emendar no plano distante.
      const edgeZ = smooth(-110, -70, z) * (1 - smooth(55, 90, z));
      swellRow(w, z, row);
      for (let i = 0; i < nx; i++) {
        const cc = cols[i];
        const edge = edgeZ * cc.edgeX;
        const s = z - cc.offset;
        const y = S.height(cc.crestH, s, swellFrom(amp, cc.trig, row)) * edge;
        const v = j * nx + i;
        const k = v * 3;
        pos[k] = cc.x;
        pos[k + 1] = y;
        pos[k + 2] = z;
        this.heights[v] = y;
        // A água fica mais clara onde é fina (alto da face) e escura no fundo.
        const thin = s > -0.5 && s < F ? smooth(0.15, 0.95, y / H) : smooth(0.4, 1, y / H) * 0.4;
        const t = Math.min(1, thin * 0.95 + Math.max(0, y) * 0.05);
        thinA[v] = thin;
        col[k] = dr + sr * t;
        col[k + 1] = dg + sg * t;
        col[k + 2] = db + sb * t;
        foam[v] = S.foam(cc, s, streakFrom(cc.trig, row)) * edge;
        uv[v * 2] = cc.x / 5;
        uv[v * 2 + 1] = z / 5;
      }
    }
    this.applyWake(wake, foam);
    this.gridNormals();
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.foam.needsUpdate = true;
    this.geo.attributes.thin.needsUpdate = true;
    this.geo.attributes.normal.needsUpdate = true;
    this.geo.attributes.uv.needsUpdate = true;
    this.updateLip(w);
  }

  /** Índice do primeiro valor da lista ordenada que é maior ou igual a v. */
  private static lowerBound(list: number[], v: number): number {
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /**
   * Rastro da prancha: cada ponto deixa uma faixa de espuma que se alarga e
   * some com o tempo. Só os vértices próximos de cada ponto são visitados.
   */
  private applyWake(wake: readonly WakePoint[], foam: Float32Array) {
    if (!wake.length) return;
    const nx = this.xs.length;
    for (const p of wake) {
      const life = 1 - p.age / WAKE_LIFE;
      if (life <= 0) continue;
      const r = 0.35 + p.age * 0.45;
      const i0 = Ocean.lowerBound(this.xs, p.x - this.baseX - r);
      const i1 = Ocean.lowerBound(this.xs, p.x - this.baseX + r);
      const j0 = Ocean.lowerBound(this.zs, p.z - r);
      const j1 = Ocean.lowerBound(this.zs, p.z + r);
      for (let j = j0; j < Math.min(j1, this.zs.length); j++) {
        const dz = this.zs[j] - p.z;
        for (let i = i0; i < Math.min(i1, nx); i++) {
          const dx = this.xs[i] + this.baseX - p.x;
          const d2 = (dx * dx + dz * dz) / (r * r);
          if (d2 >= 1) continue;
          // Borda mais branca que o centro, como a espuma que a prancha abre.
          const ring = 0.55 + 0.45 * Math.sin(Math.sqrt(d2) * Math.PI);
          const v = j * nx + i;
          // max em vez de soma: pontos sobrepostos (prancha lenta) não saturam a espuma.
          foam[v] = Math.max(foam[v], Math.min(1, p.strength * life * life * ring * (1 - d2)));
        }
      }
    }
  }

  /** Normais por diferenças finitas na grade (bem mais rápido que recalcular por triângulo). */
  private gridNormals() {
    const nx = this.xs.length;
    const nz = this.zs.length;
    const h = this.heights;
    const n = this.geo.attributes.normal.array as Float32Array;
    for (let j = 0; j < nz; j++) {
      const j0 = Math.max(0, j - 1);
      const j1 = Math.min(nz - 1, j + 1);
      const dz = this.zs[j1] - this.zs[j0];
      for (let i = 0; i < nx; i++) {
        const i0 = Math.max(0, i - 1);
        const i1 = Math.min(nx - 1, i + 1);
        const dx = this.xs[i1] - this.xs[i0];
        const gx = (h[j * nx + i1] - h[j * nx + i0]) / dx;
        const gz = (h[j1 * nx + i] - h[j0 * nx + i]) / dz;
        const inv = 1 / Math.sqrt(gx * gx + 1 + gz * gz);
        const k = (j * nx + i) * 3;
        n[k] = -gx * inv;
        n[k + 1] = inv;
        n[k + 2] = -gz * inv;
      }
    }
  }

  private updateLip(w: WaveState) {
    const pos = this.lipGeo.attributes.position.array as Float32Array;
    const col = this.lipGeo.attributes.color.array as Float32Array;
    const foam = this.lipGeo.attributes.foam.array as Float32Array;
    const bx = breakX(w);
    for (let i = 0; i < 28; i++) {
      const x = bx - 3 + i * 0.6;
      const ahead = x - bx;
      // O lip só existe na seção que está quebrando agora.
      const amount = Math.exp(-Math.pow((ahead - 4) / 4.5, 2));
      const ch = crestHeight(w, x);
      const z0 = crestOffset(w, x) + 0.05;
      const y0 = ch * mainProfile(w, 0.05);
      const r = 0.42 * ch * amount + 0.02;
      for (let k = 0; k < 10; k++) {
        const th = (k / 9) * 1.95 * amount;
        const n = (i * 10 + k) * 3;
        pos[n] = x;
        pos[n + 1] = y0 + r * Math.sin(th) * 0.35 - r * (1 - Math.cos(th));
        pos[n + 2] = z0 + r * Math.sin(th);
        const tip = k / 9;
        c2.copy(this.shallow).lerp(this.deep, 0.2 + tip * 0.3);
        col[n] = c2.r;
        col[n + 1] = c2.g;
        col[n + 2] = c2.b;
        foam[i * 10 + k] = Math.min(1, 0.2 + tip * 0.9) * (0.4 + 0.6 * amount);
      }
    }
    this.lipGeo.attributes.position.needsUpdate = true;
    this.lipGeo.attributes.color.needsUpdate = true;
    this.lipGeo.attributes.foam.needsUpdate = true;
    this.lipGeo.computeVertexNormals();
  }

  dispose() {
    this.geo.dispose();
    this.lipGeo.dispose();
    this.material.dispose();
    this.far.geometry.dispose();
    (this.far.material as THREE.Material).dispose();
    this.detailA?.dispose();
    this.detailB?.dispose();
    this.farNormal?.dispose();
  }
}

const c2 = new THREE.Color();
