import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import type { LocationVisual } from '../core/types';
import type { Stage } from './Stage';

// Céu físico (espalhamento atmosférico), sol direcional com sombras, luz
// ambiente e neblina. O céu também vira o mapa de ambiente (PMREM), que dá os
// reflexos da água e o brilho da prancha.

export class Environment {
  readonly sky = new Sky();
  readonly sun = new THREE.DirectionalLight(0xffffff, 3);
  readonly hemi = new THREE.HemisphereLight(0xbfe3ff, 0x0b3a52, 0.6);
  readonly sunDir = new THREE.Vector3();
  private pmrem: THREE.PMREMGenerator;
  private envRT: THREE.WebGLRenderTarget | null = null;
  private skyScene = new THREE.Scene();

  constructor(private stage: Stage) {
    this.sky.scale.setScalar(3000);
    stage.scene.add(this.sky);
    stage.scene.add(this.hemi);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    const cam = this.sun.shadow.camera;
    cam.left = -6;
    cam.right = 6;
    cam.top = 6;
    cam.bottom = -6;
    cam.near = 1;
    cam.far = 80;
    stage.scene.add(this.sun, this.sun.target);
    this.pmrem = new THREE.PMREMGenerator(stage.renderer);
  }

  apply(v: LocationVisual, windSpeed: number) {
    const u = this.sky.material.uniforms;
    // Vento forte deixa o ar mais carregado de maresia.
    u.turbidity.value = v.turbidity + windSpeed / 12;
    u.rayleigh.value = v.rayleigh;
    u.mieCoefficient.value = 0.004 + windSpeed / 6000;
    u.mieDirectionalG.value = 0.85;
    const phi = THREE.MathUtils.degToRad(90 - v.sunElevation);
    const theta = THREE.MathUtils.degToRad(v.sunAzimuth);
    this.sunDir.setFromSphericalCoords(1, phi, theta);
    u.sunPosition.value.copy(this.sunDir);

    const warm = THREE.MathUtils.clamp(1 - v.sunElevation / 40, 0, 1);
    this.sun.color.setRGB(1, 0.93 - 0.25 * warm, 0.85 - 0.45 * warm);
    this.sun.intensity = 2.2 + 1.6 * (1 - warm);
    this.hemi.intensity = 0.45 + 0.3 * (1 - warm);
    this.stage.renderer.toneMappingExposure = v.exposure;
    const far = this.stage.profile.renderDistance;
    this.stage.scene.fog = new THREE.Fog(v.fogColor, Math.min(250, far * 0.25), far * 0.9);

    // Mapa de ambiente a partir do céu.
    this.skyScene.clear();
    const skyCopy = new Sky();
    skyCopy.scale.setScalar(1000);
    const cu = skyCopy.material.uniforms;
    for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG'] as const) cu[k].value = u[k].value;
    cu.sunPosition.value.copy(this.sunDir);
    this.skyScene.add(skyCopy);
    this.envRT?.dispose();
    this.envRT = this.pmrem.fromScene(this.skyScene as unknown as THREE.Scene, 0.02);
    this.stage.scene.environment = this.envRT.texture;
    skyCopy.material.dispose();
    skyCopy.geometry.dispose();
  }

  applyShadows(size: number) {
    this.sun.shadow.mapSize.set(size, size);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
  }

  /** O sol e a área de sombra acompanham o surfista. */
  follow(target: THREE.Vector3) {
    this.sun.target.position.copy(target);
    this.sun.position.copy(target).addScaledVector(this.sunDir, 40);
  }
}
