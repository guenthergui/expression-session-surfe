import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
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
}

export const QUALITY: Record<Quality, QualityProfile> = {
  baixa: { label: 'Low', renderScale: 0.75, pixelRatio: 1.25, shadows: false, shadowSize: 512, oceanStep: 0.7, particles: 350, renderDistance: 900, detailNormals: false, wakePoints: 0, bloom: false },
  media: { label: 'Medium', renderScale: 1, pixelRatio: 1.5, shadows: true, shadowSize: 1024, oceanStep: 0.45, particles: 800, renderDistance: 1600, detailNormals: true, wakePoints: 40, bloom: false },
  alta: { label: 'High', renderScale: 1, pixelRatio: 2, shadows: true, shadowSize: 2048, oceanStep: 0.35, particles: 1400, renderDistance: 2500, detailNormals: true, wakePoints: 80, bloom: false },
  ultra: { label: 'Ultra', renderScale: 1, pixelRatio: 2.5, shadows: true, shadowSize: 4096, oceanStep: 0.27, particles: 2400, renderDistance: 4000, detailNormals: true, wakePoints: 140, bloom: true },
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
    if (this.profile.bloom && !this.composer) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.22, 0.35, 0.92);
      this.composer.addPass(this.bloomPass);
      this.composer.addPass(new OutputPass());
    } else if (!this.profile.bloom && this.composer) {
      this.composer.dispose();
      this.composer = null;
      this.bloomPass = null;
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

  render() {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
