import * as THREE from 'three';
import { DEFAULT_LOOK, type Look } from '../data/cosmetics';
import { findBoard, findFin } from '../data/equipment';
import { findLocation } from '../data/locations';
import type { CameraMode, Quality } from '../core/save';
import type { Conditions, LocationVisual, WindType } from '../core/types';
import type { AnimFrame, SprayEvent } from '../game/AerialAnimator';
import { breakX, createWave, crestHeight, crestOffset, mainProfile, surfaceHeight, type WaveState } from '../sim/waveField';
import { BoardModel } from './BoardModel';
import { CameraRig } from './CameraRig';
import { Environment } from './Environment';
import { Leash } from './Leash';
import { Ocean, WAKE_LIFE, type WakePoint } from './Ocean';
import { Scenery } from './Scenery';
import { Spray } from './Spray';
import { Stage } from './Stage';
import { SurferRig } from './SurferRig';

export const WIND_DIR: Record<WindType, { x: number; z: number }> = {
  terral: { x: 0, z: -1 },
  maral: { x: 0, z: 1 },
  lateral: { x: 1, z: 0 },
};

const UP = new THREE.Vector3(0, 1, 0);

/** Junta todos os elementos visuais e aplica a cada quadro o que o jogo calculou. */
export class World {
  readonly stage: Stage;
  readonly env: Environment;
  readonly camRig: CameraRig;
  ocean: Ocean;
  readonly scenery: Scenery;
  spray: Spray;
  readonly rig = new SurferRig();
  board: BoardModel;
  wave: WaveState = createWave();
  readonly leash: Leash;
  private locationId = '';
  private boardKey = '';
  private crestTimer = 0;
  private quality: Quality;
  private wake: WakePoint[] = [];
  private wakeTimer = 0;
  private wetness = 0;
  private windVec = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private lastTime = 0;
  private skyClock = 0;
  /** Piso do vestiário: um disco de luz suave sob o surfista, no lugar do mar. */
  private showroomFloor: THREE.Mesh | null = null;

  constructor(container: HTMLElement, quality: Quality, cameraMode: CameraMode = 'lateral') {
    this.quality = quality;
    this.stage = new Stage(container, quality);
    this.env = new Environment(this.stage);
    this.env.applyShadows(this.stage.profile.shadowSize);
    this.camRig = new CameraRig(this.stage.camera);
    this.camRig.mode = cameraMode;
    this.ocean = new Ocean(this.stage.scene, this.stage.profile.oceanStep, this.stage.profile.detailNormals);
    this.scenery = new Scenery(this.stage.scene);
    this.spray = new Spray(this.stage.scene, this.stage.profile.particles);
    this.board = new BoardModel(findBoard('standard'), 'thruster', DEFAULT_LOOK.board, DEFAULT_LOOK.fins);
    this.stage.scene.add(this.board.group, this.rig.root);
    this.leash = new Leash(this.stage.scene);
  }

  /**
   * Vestiário: esconde o mar e o cenário para a câmera girar em volta do
   * surfista sem atravessar a onda, e mostra um piso neutro em floorY.
   */
  setShowroom(on: boolean, floorY = 0) {
    for (const o of [this.ocean.mesh, this.ocean.far, this.ocean.lip, this.spray.points, this.scenery.group]) o.visible = !on;
    if (on && !this.showroomFloor) {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const g = c.getContext('2d')!;
      const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
      grad.addColorStop(0, 'rgba(234,217,182,0.95)');
      grad.addColorStop(0.55, 'rgba(200,190,170,0.55)');
      grad.addColorStop(1, 'rgba(200,190,170,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 256, 256);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      this.showroomFloor = new THREE.Mesh(new THREE.CircleGeometry(2.6, 48), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.9, depthWrite: false }));
      this.showroomFloor.rotation.x = -Math.PI / 2;
      this.showroomFloor.receiveShadow = true;
      this.stage.scene.add(this.showroomFloor);
    }
    if (this.showroomFloor) {
      this.showroomFloor.visible = on;
      this.showroomFloor.position.set(this.board.group.position.x, floorY, this.board.group.position.z);
    }
  }

  get currentQuality(): Quality {
    return this.quality;
  }

  setQuality(q: Quality) {
    if (q === this.quality) return;
    this.quality = q;
    this.stage.applyQuality(q);
    this.env.applyShadows(this.stage.profile.shadowSize);
    this.scenery.setDetail(this.stage.profile.sceneryDetail);
    // Recria a malha do oceano e as partículas com a nova densidade.
    this.stage.scene.remove(this.ocean.mesh, this.ocean.far, this.ocean.lip, this.spray.points);
    this.ocean.dispose();
    this.ocean = new Ocean(this.stage.scene, this.stage.profile.oceanStep, this.stage.profile.detailNormals);
    this.ocean.setColors(findLocation(this.locationId || 'pico-leste').visual);
    this.spray.points.geometry.dispose();
    this.spray = new Spray(this.stage.scene, this.stage.profile.particles);
    this.applyWind();
    const loc = findLocation(this.locationId || 'pico-leste');
    this.applyEnv(loc.visual, this.wave.windSpeed);
  }

  setCameraMode(mode: CameraMode) {
    this.camRig.mode = mode;
  }

  setLocation(locationId: string, c: Conditions) {
    const loc = findLocation(locationId);
    if (locationId !== this.locationId) {
      this.locationId = locationId;
      this.ocean.setColors(loc.visual);
      this.scenery.build(loc.visual, this.stage.profile.sceneryDetail);
    }
    this.applyEnv(loc.visual, loc.windAffects ? c.windSpeed : 0);
    this.wave = createWave({
      height: c.height,
      power: c.power,
      windSpeed: loc.windAffects ? c.windSpeed : 0,
      windDir: WIND_DIR[c.windType],
      pool: !loc.windAffects,
      peelSpeed: 4.6 + c.power / 25,
    });
    this.applyWind();
    // Nova onda: rastro, corda e spray recomeçam.
    this.wake.length = 0;
    this.leash.reset();
    this.spray.clear();
    this.rig.resetDynamics();
  }

  private applyEnv(v: LocationVisual, windSpeed: number) {
    this.env.apply(v, windSpeed);
    this.ocean.setLight(this.env.sunDir, this.env.sun.color);
    this.spray.setLight(this.env.sun.color, this.env.hemi.color, this.env.sun.intensity, this.stage.renderer.toneMappingExposure);
  }

  private applyWind() {
    const w = this.wave;
    const k = w.windSpeed / 3.6;
    this.windVec.set(w.windDir.x * k, 0, w.windDir.z * k);
    this.spray.wind.copy(this.windVec).multiplyScalar(0.7);
    this.env.clouds.setWind(w.windDir.x * (0.3 + w.windSpeed / 30), w.windDir.z * (0.3 + w.windSpeed / 30));
  }

  /** Troca prancha e quilhas (função) e aplica a aparência do surfista e do equipamento. */
  setEquipment(boardId: string, finId: string, look: Look) {
    const key = `${boardId}-${finId}`;
    if (key !== this.boardKey) {
      this.boardKey = key;
      this.stage.scene.remove(this.board.group);
      this.board.dispose();
      this.board = new BoardModel(findBoard(boardId), findFin(finId).id, look.board, look.fins);
      this.stage.scene.add(this.board.group);
      this.leash.reset();
    } else {
      this.board.setFinish(look.board, look.fins);
    }
    this.rig.applyLook(look);
  }

  applyFrame(f: AnimFrame, dt: number) {
    this.board.group.position.copy(f.boardPos);
    this.board.group.quaternion.copy(f.boardQuat);
    this.board.group.updateMatrixWorld(true);
    this.rig.applyPose(f.pose);
    this.rig.update(dt, this.windVec);
    // Leash: corda simulada; numa queda ele segura a prancha perto do surfista.
    const ankle = this.rig.ankleBack();
    const plug = this.board.leashPlug.getWorldPosition(this.tmp);
    const w = this.wave;
    const correction = this.leash.update(dt, ankle, plug, (x, z) => surfaceHeight(w, x, z), f.falling);
    if (correction) {
      this.board.group.position.add(correction);
      this.board.group.updateMatrixWorld(true);
    }
    // Rastro de espuma enquanto a prancha está na água.
    if (!f.airborne && f.heightAboveWater < 0.25 && this.stage.profile.wakePoints > 0) {
      this.wakeTimer += dt;
      if (this.wakeTimer > 0.035) {
        this.wakeTimer = 0;
        // Remando quase não deixa rastro; em velocidade, a prancha abre uma faixa de espuma.
        this.wake.push({ x: f.boardPos.x, z: f.boardPos.z, age: 0, strength: f.falling ? 1 : 0.1 + 0.6 * Math.min(1, Math.max(0, (f.speed - 1.5) / 7)) });
        if (this.wake.length > this.stage.profile.wakePoints) this.wake.shift();
      }
    }
    for (const e of f.events) this.emit(e);
    // Pele e roupa ficam molhadas com spray e quedas e secam devagar.
    this.wetness = Math.max(0.15, this.wetness - dt * 0.04);
    if (!f.airborne && f.heightAboveWater < 0.3) this.wetness = Math.min(1, this.wetness + dt * 0.05);
    this.rig.setWetness(this.wetness);
    const target = f.falling ? f.pose.pelvisPos : f.boardPos;
    this.camRig.update(target, f.heightAboveWater, this.wave.height, dt, f.airborne);
    this.env.follow(f.boardPos);
  }

  /** Spray específico de cada acontecimento: quantidade, direção, velocidade, tamanho e duração variam. */
  private emit(e: SprayEvent) {
    const s = this.spray;
    const scale = this.stage.profile.particles / 1400;
    const n = (count: number) => Math.max(1, Math.round(count * scale));
    switch (e.kind) {
      case 'carve': {
        // Leque saindo da borda, para trás e para cima, mais forte em curvas fechadas.
        const back = this.tmp2.copy(e.dir).multiplyScalar(-0.8).addScaledVector(UP, 0.9).normalize();
        s.emit(e.pos, back, n(4 * e.strength), 2.2 * e.strength, 1.1, 0.1, 0.6);
        break;
      }
      case 'launch':
        // Cortina de água arrancada do lip, mais alta quanto maior a impulsão.
        s.emit(e.pos, this.tmp2.set(-0.25, 1, -0.45).normalize(), n(80 * e.strength), 4.2 * e.strength, 2, 0.16, 1.1);
        s.emit(e.pos, this.tmp2.set(0.3, 0.6, 0.2).normalize(), n(30), 2, 1.2, 0.09, 0.7);
        break;
      case 'land': {
        const unstable = e.outcome === 'instavel';
        // Pouso limpo: leque baixo e longo para frente. Instável: explosão mais alta e caótica.
        s.emit(e.pos, this.tmp2.set(0.8, unstable ? 1 : 0.45, 0.4).normalize(), n(unstable ? 130 : 90), unstable ? 4 : 3.4, unstable ? 3.2 : 1.8, unstable ? 0.2 : 0.15, 1);
        this.wetness = Math.min(1, this.wetness + 0.25);
        break;
      }
      case 'fall':
        s.emit(e.pos, this.tmp2.set(0, 1, 0.2).normalize(), n(110 * Math.min(1.5, e.strength)), 4, 3, 0.2, 1.2);
        break;
      case 'bodySplash':
        // O corpo entrando na água: coluna alta e respingos largos.
        s.emit(e.pos, UP, n(160), 5, 3.4, 0.24, 1.4);
        s.emit(e.pos, this.tmp2.set(0, 0.35, 1).normalize(), n(60), 2.5, 2.5, 0.14, 0.9);
        this.wetness = 1;
        break;
      case 'boardSlap':
        s.emit(e.pos, UP, n(50), 3, 2.2, 0.15, 0.8);
        break;
      case 'paddle':
        // Respingos curtos das braçadas, dos dois lados da prancha.
        s.emit(e.pos, UP, n(3), 1.2, 1, 0.06, 0.4);
        break;
      case 'drop':
        // A prancha pega a onda: borrifo saindo do bico e das bordas.
        s.emit(e.pos, e.dir, n(45), 2.6, 1.6, 0.12, 0.8);
        break;
      default:
        break;
    }
  }

  /** Espuma que voa da crista onde a onda está quebrando, empurrada pelo vento. */
  private crestSpray(dt: number) {
    const w = this.wave;
    const scale = this.stage.profile.particles / 1400;
    this.crestTimer += dt * (6 + w.power / 10 + w.windSpeed / 4) * scale;
    while (this.crestTimer > 1) {
      this.crestTimer -= 1;
      const x = breakX(w) - 1 + Math.random() * 9;
      const z = crestOffset(w, x) + 0.1;
      const y = crestHeight(w, x) * mainProfile(w, 0.1);
      const offshore = w.windDir.z < 0 ? 1 : 0.3;
      const dir = this.tmp2.set(0.1, 1, -0.6 * offshore + 0.4 * (1 - offshore)).normalize();
      this.spray.emit(this.tmp.set(x, y, z), dir, 2, 1.5 + (w.windSpeed / 10) * offshore, 0.8, 0.2, 1.2);
    }
  }

  update(dt: number, waveTime: number, focusX: number) {
    // Se o tempo voltou (nova onda ou cena de teste), limpa o rastro antigo.
    if (waveTime < this.lastTime) this.wake.length = 0;
    this.lastTime = waveTime;
    for (const p of this.wake) p.age += dt;
    while (this.wake.length && this.wake[0].age > WAKE_LIFE) this.wake.shift();
    this.wave.time = waveTime;
    this.ocean.update(this.wave, focusX - 6, this.wake);
    this.skyClock += dt;
    this.env.update(this.skyClock, this.stage.camera);
    this.crestSpray(dt);
    this.spray.setScale(this.stage.renderer.domElement.height);
    this.spray.update(dt);
    this.stage.render();
  }
}
