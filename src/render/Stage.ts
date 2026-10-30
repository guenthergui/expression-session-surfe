import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { Quality } from '../core/save';

/** Ajustes visuais por nível de qualidade. Cada campo muda algo real na cena. */
export interface QualityProfile {
  label: string;
  /** Fração da densidade de pixels da tela usada na cena 3D (1 = nativa). */
  renderScale: number;
  /** Teto do pixel ratio, para telas muito densas não derrubarem o desempenho. */
  pixelRatio: number;
  shadows: boolean;
  shadowSize: number;
  /** Espaçamento da malha do oceano perto da onda, em metros. */
  oceanStep: number;
  /** Máximo de partículas de spray e espuma. */
  particles: number;
  /** Distância de renderização (plano distante da câmera e neblina), em metros. */
  renderDistance: number;
  /** Mapas de normais de detalhe na água (ondulações pequenas). */
  detailNormals: boolean;
  /** Rastro de espuma deixado pela prancha (pontos guardados). */
  wakePoints: number;
  /** Pós-processamento: brilho suave só nos reflexos mais intensos. */
  bloom: boolean;
  /** Pós-processamento: gradação de cor de câmera (contraste, saturação, vinheta e grão). */
  grade: boolean;
  /** Oitavas de ruído das nuvens (0 = sem nuvens). */
  cloudOctaves: number;
  /** Quantidade de detalhes do cenário (vegetação, casas, pedras), de 0 a 1. */
  sceneryDetail: number;
}

export const QUALITY: Record<Quality, QualityProfile> = {
  baixa: { label: 'Low', renderScale: 0.75, pixelRatio: 1.25, shadows: false, shadowSize: 512, oceanStep: 0.7, particles: 350, renderDistance: 900, detailNormals: false, wakePoints: 0, bloom: false, grade: false, cloudOctaves: 3, sceneryDetail: 0.35 },
  media: { label: 'Medium', renderScale: 1, pixelRatio: 1.5, shadows: true, shadowSize: 1024, oceanStep: 0.45, particles: 800, renderDistance: 2200, detailNormals: true, wakePoints: 40, bloom: false, grade: true, cloudOctaves: 4, sceneryDetail: 0.6 },
  alta: { label: 'High', renderScale: 1, pixelRatio: 2, shadows: true, shadowSize: 2048, oceanStep: 0.35, particles: 1400, renderDistance: 2500, detailNormals: true, wakePoints: 80, bloom: true, grade: true, cloudOctaves: 5, sceneryDetail: 0.85 },
  ultra: { label: 'Ultra', renderScale: 1, pixelRatio: 2.5, shadows: true, shadowSize: 4096, oceanStep: 0.27, particles: 2400, renderDistance: 4000, detailNormals: true, wakePoints: 140, bloom: true, grade: true, cloudOctaves: 6, sceneryDetail: 1 },
};

/**
 * Gradação de cor no estilo de câmera de transmissão: curva de contraste
 * suave, saturação, tons quentes nas luzes e frios nas sombras, vinheta,
 * leve aberração cromática nas bordas e grão de filme. Roda depois do tone
 * mapping, na imagem final em sRGB.
 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    time: { value: 0 },
    contrast: { value: 1.08 },
    saturation: { value: 1.12 },
    warmth: { value: 0.04 },
    vignette: { value: 0.28 },
    grain: { value: 0.025 },
    aberration: { value: 0.0016 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float time, contrast, saturation, warmth, vignette, grain, aberration;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      // Aberração cromática só perto das bordas, como numa lente real.
      vec2 off = d * aberration * r2 * 4.0;
      vec3 c = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      // Curva em S em torno do meio-tom.
      c = clamp((c - 0.5) * contrast + 0.5, 0.0, 1.0);
      c = mix(c, c * c * (3.0 - 2.0 * c), 0.25);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, saturation);
      // Luzes quentes, sombras frias.
      c += warmth * vec3(1.0, 0.45, -0.6) * smoothstep(0.45, 1.0, l);
      c += warmth * vec3(-0.5, 0.0, 0.7) * (1.0 - smoothstep(0.0, 0.35, l));
      c *= 1.0 - vignette * smoothstep(0.08, 0.55, r2 * 1.6);
      c += (hash(vUv * 1024.0 + time) - 0.5) * grain;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

export const QUALITY_ORDER: Quality[] = ['baixa', 'media', 'alta', 'ultra'];

/** Renderizador, cena e câmera, com redimensionamento, resolução e pós-processamento. */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  profile: QualityProfile;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private gradePass: ShaderPass | null = null;
  private clock = 0;
  /** Nos menus a cena fica parada atrás da interface: vale a pena renderizar na resolução nativa. */
  private sharp = false;

  constructor(container: HTMLElement, quality: Quality) {
    this.profile = QUALITY[quality];
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.42;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 4000);
    this.applyQuality(quality);
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  applyQuality(quality: Quality) {
    this.profile = QUALITY[quality];
    this.updatePixelRatio();
    this.renderer.shadowMap.enabled = this.profile.shadows;
    this.camera.far = this.profile.renderDistance;
    this.camera.updateProjectionMatrix();
    // O pipeline é refeito a cada troca de qualidade: poucos passes, montados uma vez.
    this.composer?.dispose();
    this.composer = null;
    this.bloomPass = null;
    this.gradePass = null;
    if (this.profile.bloom || this.profile.grade) {
      // Alvo com MSAA: o pós-processamento não pode perder o antisserrilhado da cena.
      const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
      this.composer = new EffectComposer(this.renderer, rt);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      if (this.profile.bloom) {
        this.bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.14, 0.25, 10);
        this.composer.addPass(this.bloomPass);
      }
      this.composer.addPass(new OutputPass());
      if (this.profile.grade) {
        this.gradePass = new ShaderPass(GradeShader);
        this.composer.addPass(this.gradePass);
      }
    }
    this.resize();
  }

  /** Resolução interna: proporcional à densidade da tela, nunca um valor fixo menor que ela nos menus. */
  pixelRatio(): number {
    const dpr = window.devicePixelRatio || 1;
    if (this.sharp) return Math.min(dpr, Math.max(2, this.profile.pixelRatio));
    return Math.min(dpr * this.profile.renderScale, this.profile.pixelRatio);
  }

  setSharp(on: boolean) {
    if (on === this.sharp) return;
    this.sharp = on;
    this.resize();
  }

  private updatePixelRatio() {
    this.renderer.setPixelRatio(this.pixelRatio());
  }

  resize() {
    // A densidade muda ao arrastar a janela para outro monitor ou ao mudar o zoom do navegador.
    this.updatePixelRatio();
    const el = this.renderer.domElement.parentElement ?? document.body;
    const w = el.clientWidth || window.innerWidth;
    const h = el.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
    }
  }

  /** Ajusta a gradação ao clima do local (pôr do sol mais quente, por exemplo). */
  setGrade(warmth: number) {
    if (this.gradePass) this.gradePass.uniforms.warmth.value = warmth;
    this.gradeWarmth = warmth;
  }
  private gradeWarmth = 0.04;

  render() {
    this.clock = (this.clock + 0.016) % 1000;
    if (this.bloomPass) {
      // A cena chega ao bloom antes do tone mapping (valores HDR crus): o limiar
      // acompanha a exposição para só o sol e os reflexos mais fortes brilharem.
      this.bloomPass.threshold = 3.6 / Math.max(0.05, this.renderer.toneMappingExposure);
    }
    if (this.gradePass) {
      this.gradePass.uniforms.time.value = this.clock;
      this.gradePass.uniforms.warmth.value = this.gradeWarmth;
    }
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
