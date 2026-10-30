import * as THREE from 'three';
import { Sfx } from '../audio/Sfx';
import { Music } from '../audio/Music';
import { cloneLook, type Look } from '../data/cosmetics';
import { findBoard, findFin } from '../data/equipment';
import { findLocation } from '../data/locations';
import { clampSetup, generateWaveConditions, type HeatSetup } from '../core/conditions';
import { KeyboardControls, RIDE_CODES, emptyInput } from '../core/controls';
import { HeatSession, type WaveEnd, type WaveResult } from '../core/heat';
import type { CameraMode } from '../core/save';
import { GRAB_LABELS, MANEUVERS, findManeuver } from '../core/maneuvers';
import { applyHeatResult } from '../core/rewards';
import type { Attributes, Conditions, Maneuver } from '../core/types';
import { AutoPilot, planFor, type PilotPlan } from '../sim/autopilot';
import { V_MIN_AIR } from '../sim/takeoff';
import { DROP_TIME, WaveRun, type RunEvent, type RunParams } from '../sim/waveRun';
import { World } from '../render/World';
import { bind } from '../ui/dom';
import { OUTCOME_TEXT, challengeCard, heatResultScreen, hud, introCard, popup, rideHud, waveResultCard, wheel, wheelTarget } from '../ui/heatViews';
import { lockerScreen, type LockerFocus, type LockerView } from '../ui/locker';
import { confirmModal, helpModal, menuScreen, pauseMenu, settingsScreen, setupScreen, skillsScreen, type MenuHost } from '../ui/screens';
import { AerialAnimator } from './AerialAnimator';
import { persist, resetProgress, state } from './state';

type Mode = 'menu' | 'setup' | 'skills' | 'locker' | 'settings' | 'intro' | 'roulette' | 'challenge' | 'ride' | 'waveResult' | 'heatResult';

/** Telas de menu: a cena fica atrás da interface e é renderizada na resolução nativa. */
const MENU_MODES: Mode[] = ['menu', 'setup', 'skills', 'locker', 'settings', 'heatResult'];
/** Momentos da bateria em que Esc abre o menu de pausa. */
const HEAT_MODES: Mode[] = ['intro', 'roulette', 'challenge', 'ride', 'waveResult'];

/** Enquadramento de cada categoria do vestiário: distância, inclinação e se o surfista está no ar. */
const FOCUS: Record<LockerFocus, { dist: number; pitch: number; air: boolean; min: number; max: number }> = {
  rosto: { dist: 0.85, pitch: 0.06, air: false, min: 0.45, max: 2.2 },
  corpo: { dist: 2.7, pitch: 0.12, air: false, min: 1.2, max: 5.5 },
  prancha: { dist: 2.9, pitch: 0.55, air: true, min: 1.4, max: 6 },
  quilhas: { dist: 1.5, pitch: -0.45, air: true, min: 0.6, max: 4 },
};


const isRideCode = (code: string) => (RIDE_CODES as readonly string[]).includes(code);

const REFUSED_TEXT: Record<Extract<RunEvent, { kind: 'refused' }>['reason'], string> = {
  velocidade: 'Pouca velocidade para voar: desça a face e bombeie (W)',
  posicao: 'Solte o espaço mais perto do lip',
  descendo: 'Você estava descendo: suba a face antes de soltar',
  recuperando: 'Ainda recuperando o pouso',
  levantando: 'Espere ficar em pé',
};

const EXT_NAMES = { christ: 'Christ', superman: 'Superman', superwoman: 'Superwoman' } as const;

/** Segundos surfando depois de recuperar o pouso para confirmar a saída limpa. */
const RIDE_AWAY_TIME = 1;

/** Uma onda em andamento (jogada, de demonstração ou cena do lab). */
interface Ride {
  /** Aéreo sorteado como desafio (na demonstração, o que o piloto tenta). */
  challenge: Maneuver;
  run: WaveRun;
  animator: AerialAnimator;
  /** Piloto automático: só na demonstração, no vestiário e no lab. */
  pilot: AutoPilot | null;
  time: number;
  demo: boolean;
  result: WaveResult | null;
  endAt: number;
  /** Instante em que a saída surfando do último pouso conta o bônus. */
  rideAwayAt: number | null;
  /** Cena de validação: não reinicia sozinha. */
  lab?: boolean;
}

/** Atributos da demonstração: ninguém cai nos menus. */
function demoAttributes(a: Attributes): Attributes {
  const out = { ...a };
  for (const k of Object.keys(out) as (keyof Attributes)[]) out[k] = Math.max(out[k], 62);
  return out;
}

export class App implements MenuHost {
  readonly world: World;
  readonly sfx = new Sfx();
  readonly music = new Music(state.save.prefs.music);
  private ui: HTMLElement;
  private mode: Mode = 'menu';
  private heat: HeatSession | null = null;
  private ride: Ride | null = null;
  private setup: HeatSetup;
  private screenEl: HTMLElement | null = null;
  private rideHudEl: HTMLElement | null = null;
  /** Teclas seguradas durante a onda. */
  private readonly keys = new KeyboardControls();
  private hudEl: HTMLElement | null = null;
  private wheelState: { g: SVGGElement; from: number; to: number; t: number; dur: number; maneuver: Maneuver } | null = null;
  private primary: (() => void) | null = null;
  /** Condições mostradas na demonstração de fundo (as da onda atual, durante a bateria). */
  private demoConditions: Conditions | null = null;
  fps = 0;
  /** Nas cenas de validação, o tempo da onda congela neste instante. */
  labFreeze: number | null = null;
  /** Bateria pausada (Esc): o tempo da onda para e os comandos ficam bloqueados. */
  private paused = false;
  private pauseEl: HTMLElement | null = null;
  /** Câmera orbital do vestiário. */
  private showcase: { focus: LockerFocus; air: boolean; yaw: number; pitch: number; dist: number; base: number; target: THREE.Vector3 } | null = null;

  constructor(view: HTMLElement, ui: HTMLElement) {
    this.ui = ui;
    const save = state.save;
    this.world = new World(view, save.prefs.quality, save.prefs.camera);
    this.sfx.enabled = save.prefs.sound;
    this.setup = clampSetup(save.lastSetup);
    this.preview(this.setup);
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));
    // Se a janela perde o foco, nenhuma tecla fica presa.
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('pointerdown', () => {
      this.sfx.unlock();
      this.music.unlock();
    });
    this.go('menu');
  }

  // ---------- Telas de menu ----------

  go(screen: 'menu' | 'setup' | 'skills' | 'locker' | 'settings') {
    // Saindo do vestiário sem salvar: volta a aparência salva.
    if (this.mode === 'locker') this.world.setEquipment(this.setup.boardId, this.setup.finId, state.save.look);
    this.setPaused(false);
    this.showcase = null;
    this.world.setShowroom(false);
    this.world.stage.camera.clearViewOffset();
    this.mode = screen;
    this.heat = null;
    this.music.setDucked(false);
    this.demoConditions = null;
    this.labFreeze = null;
    this.world.camRig.override = null;
    this.clearUi();
    const builders = { menu: menuScreen, setup: setupScreen, skills: skillsScreen, locker: lockerScreen, settings: settingsScreen };
    this.screenEl = builders[screen](this);
    this.ui.appendChild(this.screenEl);
    this.primary = screen === 'menu' ? () => this.go('setup') : screen === 'setup' ? () => (this.screenEl as HTMLElement & { submit?: () => void }).submit?.() : null;
    if (screen === 'locker') this.lockerFocus('corpo');
    else if (!this.ride || !this.ride.demo || this.ride.lab) this.startDemo();
  }

  showHelp() {
    helpModal(this.ui);
  }

  click() {
    this.sfx.unlock();
    this.sfx.click();
  }

  preview(setup: HeatSetup) {
    this.setup = setup;
    this.world.setEquipment(setup.boardId, setup.finId, state.save.look);
    const c = generateWaveConditions(setup, () => 0.5);
    this.world.setLocation(setup.locationId, c);
    this.sfx.setSurf(c.power, c.windSpeed);
    if (this.ride?.demo) this.startDemo();
  }

  refreshLook() {
    this.world.setEquipment(this.setup.boardId, this.setup.finId, state.save.look);
  }

  setQuality(q: typeof state.save.prefs.quality) {
    this.world.setQuality(q);
    this.preview(this.setup);
  }

  setCameraMode(mode: CameraMode) {
    this.world.setCameraMode(mode);
  }

  setSound(on: boolean) {
    this.sfx.setEnabled(on);
  }

  setMusic(volume: number) {
    this.music.setVolume(volume);
  }

  resetProgress() {
    resetProgress();
    this.setup = clampSetup(state.save.lastSetup);
    this.preview(this.setup);
  }

  private clearUi() {
    this.ui.innerHTML = '';
    this.screenEl = null;
    this.rideHudEl = null;
    this.hudEl = null;
    this.wheelState = null;
    this.primary = null;
  }

  // ---------- Vestiário ----------

  /** Mostra a aparência em edição sem salvar. */
  lockerPreview(look: Look) {
    this.world.setEquipment(this.setup.boardId, this.setup.finId, look);
  }

  saveLook(look: Look) {
    state.save.look = cloneLook(look);
    persist();
    this.world.setEquipment(this.setup.boardId, this.setup.finId, state.save.look);
  }

  /**
   * Enquadra uma parte do personagem. Corpo e rosto: surfista em pé na onda,
   * parado. Prancha e quilhas: congelado no ar, para ver o fundo e as quilhas.
   */
  lockerFocus(focus: LockerFocus) {
    const f = FOCUS[focus];
    const prev = this.showcase;
    if (!prev || prev.air !== f.air) {
      this.showcasePose(f.air);
      // Piso logo abaixo da prancha em pé; no ar, bem mais abaixo.
      const b = this.world.board.group.position;
      this.world.setShowroom(true, b.y - (f.air ? 1.3 : 0.12));
    }
    const rig = this.world.rig;
    const target = new THREE.Vector3();
    if (focus === 'rosto') rig.head.getWorldPosition(target).add(new THREE.Vector3(0, 0.07, 0));
    else if (focus === 'corpo') rig.chest.getWorldPosition(target).add(new THREE.Vector3(0, -0.3, 0));
    else if (focus === 'prancha') this.world.board.group.getWorldPosition(target);
    else this.world.board.group.localToWorld(target.set(-this.world.board.shape.length / 2 + 0.25, -0.05, 0));
    // Ângulo de frente do surfista (o peito aponta para +z local).
    const dir = rig.chest.getWorldDirection(new THREE.Vector3());
    const base = Math.atan2(dir.x, dir.z);
    this.showcase = { focus, air: f.air, yaw: prev?.yaw ?? 0.35, pitch: f.pitch, dist: f.dist, base, target };
    this.world.camRig.override = (cam) => this.showcaseCamera(cam);
    this.frame(0);
  }

  lockerOrbit(dYaw: number, dPitch: number, zoom: number) {
    const s = this.showcase;
    if (!s) return;
    const f = FOCUS[s.focus];
    s.yaw += dYaw;
    s.pitch = THREE.MathUtils.clamp(s.pitch + dPitch, -1.2, 1.3);
    s.dist = THREE.MathUtils.clamp(s.dist * zoom, f.min, f.max);
  }

  lockerView(view: LockerView) {
    if (!this.showcase) return;
    this.showcase.yaw = view === 'frente' ? 0 : view === 'costas' ? Math.PI : Math.PI / 2;
    this.showcase.pitch = FOCUS[this.showcase.focus].pitch;
  }

  private showcaseCamera(cam: THREE.PerspectiveCamera) {
    const s = this.showcase!;
    const yaw = s.base + s.yaw;
    const c = Math.cos(s.pitch);
    // Tela em pé (celular): o campo horizontal é estreito, então a câmera se afasta.
    const dist = s.dist * Math.max(1, 0.85 / cam.aspect);
    cam.position.set(s.target.x + Math.sin(yaw) * c * dist, s.target.y + Math.sin(s.pitch) * dist, s.target.z + Math.cos(yaw) * c * dist);
    cam.lookAt(s.target);
    // Centraliza o personagem na área livre, ao lado do painel do vestiário.
    const panel = document.querySelector('.locker-panel')?.getBoundingClientRect();
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (panel && panel.left > w * 0.4) cam.setViewOffset(w, h, (w - panel.left) / 2, 0, w, h);
    else if (panel && panel.top > h * 0.2) cam.setViewOffset(w, h, 0, (h - panel.top) / 2, w, h);
    else cam.clearViewOffset();
  }

  /** Monta a pose parada do vestiário sem simular o mar quadro a quadro (é rápido). */
  private showcasePose(air: boolean) {
    const save = state.save;
    const c = generateWaveConditions(this.setup, () => 0.5);
    this.world.setLocation(this.setup.locationId, c);
    const ride = this.makeRide(MANEUVERS[0], true, this.setup, demoAttributes(save.attributes), c);
    ride.lab = true;
    this.ride = ride;
    this.labFreeze = null;
    const run = ride.run;
    const target = () => (air ? (run.takeoffAt === null ? null : run.takeoffAt + 0.3) : run.dropAt === null ? null : run.dropAt + DROP_TIME + 0.5);
    const dt = 1 / 60;
    for (let i = 0; i < 1500; i++) {
      const t = target();
      if (t !== null && ride.time >= t) break;
      ride.time += dt;
      run.setInput(ride.pilot!.input(run));
      run.update(dt);
      run.drain();
      this.world.applyFrame(ride.animator.update(ride.time, dt), dt);
    }
    this.labFreeze = ride.time;
    const p = run.position();
    this.world.camRig.snap(this.tmpTarget.set(p.x, p.y, p.z), c.height);
    this.frame(0);
  }

  // ---------- Pausa ----------

  private setPaused(on: boolean) {
    if (on === this.paused) return;
    this.paused = on;
    this.keys.clear();
    if (!on) {
      this.pauseEl?.remove();
      this.pauseEl = null;
      return;
    }
    this.pauseEl = pauseMenu({
      resume: () => this.setPaused(false),
      help: () => helpModal(this.ui),
      camera: () => {
        state.save.prefs.camera = state.save.prefs.camera === 'lateral' ? 'proxima' : 'lateral';
        persist();
        this.world.setCameraMode(state.save.prefs.camera);
      },
      sound: () => {
        state.save.prefs.sound = !state.save.prefs.sound;
        persist();
        this.sfx.setEnabled(state.save.prefs.sound);
      },
      music: () => {
        const p = state.save.prefs;
        p.music = p.music > 0 ? 0 : 60;
        persist();
        this.music.setVolume(p.music);
      },
      quit: () => confirmModal(this.ui, 'Sair da bateria?', 'A pontuação desta bateria não será salva.', 'Sair para o menu', () => this.go('menu')),
      click: () => this.click(),
    });
    this.ui.appendChild(this.pauseEl);
  }

  // ---------- Bateria ----------

  startHeat(setup: HeatSetup) {
    const save = state.save;
    this.setup = clampSetup(setup);
    save.lastSetup = { ...this.setup };
    persist();
    this.world.setEquipment(this.setup.boardId, this.setup.finId, save.look);
    this.music.setDucked(true);
    this.heat = new HeatSession(this.setup, { ...save.attributes }, save.unlockedManeuvers, save.discoveries, Math.random, { ...save.mastery });
    this.showIntro();
  }

  private mountHud() {
    if (!this.heat) return;
    this.hudEl?.remove();
    // Depois da onda, o HUD continua mostrando a onda que acabou de ser surfada.
    const done = this.ride && !this.ride.demo ? this.ride.result : null;
    this.hudEl = hud(this.heat, done ? { wave: done.waveIndex + 1, conditions: done.conditions } : undefined);
    this.ui.appendChild(this.hudEl);
  }

  private showIntro() {
    const heat = this.heat!;
    this.mode = 'intro';
    this.clearUi();
    const c = heat.currentConditions;
    this.world.setLocation(heat.setup.locationId, c);
    this.sfx.setSurf(c.power, c.windSpeed);
    this.demoConditions = c;
    this.startDemo(true);
    this.mountHud();
    const card = introCard(heat);
    this.ui.appendChild(card);
    bind(card, { spin: () => this.spin(false) }, () => this.click());
    this.primary = () => this.spin(false);
  }

  private spin(respin: boolean) {
    const heat = this.heat!;
    const m = respin ? heat.respin() : heat.spin();
    if (!m) return;
    this.mode = 'roulette';
    this.clearUi();
    this.mountHud();
    const pool = heat.pool;
    const { root, svg } = wheel(pool);
    this.ui.appendChild(root);
    const g = svg.querySelector<SVGGElement>('[data-rot]')!;
    const idx = pool.findIndex((p) => p.id === m.id);
    this.wheelState = { g, from: 0, to: wheelTarget(idx, pool.length), t: 0, dur: 2.6, maneuver: m };
    this.primary = null;
  }

  private showChallenge(m: Maneuver) {
    const heat = this.heat!;
    this.mode = 'challenge';
    this.clearUi();
    this.mountHud();
    const card = challengeCard(heat, m);
    this.ui.appendChild(card);
    bind(card, { go: () => this.startRide(), respin: () => this.spin(true) }, () => this.click());
    this.primary = () => this.startRide();
  }

  /** Parâmetros da física da onda: atributos, equipamento, cansaço e condições. */
  private runParams(attrs: Attributes, setup: HeatSetup, c: Conditions, extra: Partial<RunParams> = {}): RunParams {
    const board = findBoard(setup.boardId);
    const fin = findFin(setup.finId);
    const equip = { impulsao: 0, rotacao: 0, grab: 0, aterrissagem: 0 };
    for (const k of Object.keys(equip) as (keyof typeof equip)[]) equip[k] = board.mods[k] + fin.mods[k];
    return {
      forca: attrs.forca,
      impulsao: attrs.impulsao,
      amplitude: attrs.amplitude,
      rotacao: attrs.rotacao,
      controleAereo: attrs.controleAereo,
      equilibrio: attrs.equilibrio,
      leituraOnda: attrs.leituraOnda,
      fatigue: 0,
      equip,
      conditions: 1,
      sectionQuality: c.sectionQuality,
      ...extra,
    };
  }

  /**
   * Prepara a onda: o surfista começa deitado remando. Na demonstração e no lab
   * um piloto automático aperta as mesmas teclas do jogador.
   */
  private makeRide(m: Maneuver, demo: boolean, setup: HeatSetup, attrs: Attributes, c: Conditions, extra: Partial<RunParams> = {}, plan?: PilotPlan): Ride {
    const run = new WaveRun(this.world.wave, this.runParams(attrs, setup, c, demo ? { rng: () => 0.5, ...extra } : extra));
    const animator = new AerialAnimator(this.world.wave, this.world.board, run);
    const pilot = demo ? new AutoPilot(plan ?? planFor(m)) : null;
    return { challenge: m, run, animator, pilot, time: 0, demo, result: null, endAt: Infinity, rideAwayAt: null };
  }

  private tmpTarget = new THREE.Vector3();
  private lastMsg = '';

  private startRide() {
    const heat = this.heat!;
    const m = heat.currentManeuver!;
    this.mode = 'ride';
    this.clearUi();
    this.mountHud();
    const c = heat.currentConditions;
    this.world.setLocation(heat.setup.locationId, c);
    const ph = heat.physics();
    this.ride = this.makeRide(m, false, heat.setup, heat.attributes, c, { fatigue: ph.fatigue, conditions: ph.conditions, equip: ph.equip });
    this.keys.clear();
    this.rideHudEl = rideHud(m);
    this.ui.append(this.rideHudEl);
    this.lastMsg = '';
    const p = this.ride.run.position();
    this.world.camRig.snap(this.tmpTarget.set(p.x, p.y, p.z), c.height);
  }

  /** Demonstração em loop nos menus: o piloto automático surfa a onda e emenda aéreos. */
  private startDemo(calm = false) {
    const save = state.save;
    const pool = MANEUVERS.filter((m) => save.unlockedManeuvers.includes(m.id) && !m.experimental);
    const m = calm ? MANEUVERS[0] : pool[Math.floor(Math.random() * pool.length)];
    const c = this.demoConditions ?? generateWaveConditions(this.setup, () => 0.5);
    this.world.setLocation(this.setup.locationId, c);
    const ride = this.makeRide(m, true, this.setup, demoAttributes(save.attributes), c);
    ride.pilot!.maxAttempts = calm ? 1 : 2;
    this.ride = ride;
    const p = ride.run.position();
    this.world.camRig.snap(this.tmpTarget.set(p.x, p.y, p.z), c.height);
  }

  private onKey(e: KeyboardEvent) {
    this.sfx.unlock();
    this.music.unlock();
    const modals = document.querySelectorAll('.modal-bg');
    if (modals.length) {
      if (e.code === 'Escape') {
        const top = modals[modals.length - 1];
        if (top === this.pauseEl) this.setPaused(false);
        else top.remove();
      }
      return;
    }
    if (e.code === 'Escape' && HEAT_MODES.includes(this.mode) && !(this.ride?.lab)) {
      e.preventDefault();
      this.setPaused(true);
      return;
    }
    if (this.mode === 'locker' && !(e.target instanceof HTMLInputElement)) {
      const orbit: Record<string, [number, number, number]> = {
        ArrowLeft: [-0.25, 0, 1], ArrowRight: [0.25, 0, 1], ArrowUp: [0, 0.12, 1], ArrowDown: [0, -0.12, 1],
        Equal: [0, 0, 0.85], NumpadAdd: [0, 0, 0.85], Minus: [0, 0, 1.18], NumpadSubtract: [0, 0, 1.18],
      };
      const o = orbit[e.code];
      if (o) {
        e.preventDefault();
        this.lockerOrbit(...o);
        return;
      }
    }
    const rideKey = isRideCode(e.code) || e.code === 'KeyD';
    if (rideKey && (this.mode === 'ride' || this.mode === 'intro' || this.mode === 'challenge' || this.mode === 'waveResult')) e.preventDefault();
    if (this.mode === 'ride' && this.ride && !this.ride.demo) {
      this.rideKey(e.code, e.repeat);
      return;
    }
    if ((e.code === 'Space' || e.code === 'Enter') && this.primary && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLSelectElement)) {
      if (e.code === 'Space' && this.mode !== 'intro' && this.mode !== 'challenge' && this.mode !== 'waveResult') return;
      e.preventDefault();
      this.primary();
    }
    if (e.code === 'Escape' && this.mode === 'locker') (this.screenEl as HTMLElement & { cancel?: () => void }).cancel?.();
    else if (e.code === 'Escape' && (this.mode === 'setup' || this.mode === 'skills' || this.mode === 'settings')) this.go('menu');
  }

  /** Teclas durante a onda: D faz o drop; o resto vira intenção do surfista (ver core/controls.ts). */
  private rideKey(code: string, repeat: boolean) {
    const r = this.ride!;
    if (code === 'KeyD') {
      if (!repeat && r.run.pressDrop()) {
        this.sfx.click();
        popup(this.ui, 'DROP!', 'good', '50%', '30%');
      }
      return;
    }
    if (isRideCode(code)) this.keys.press(code);
  }

  private onKeyUp(e: KeyboardEvent) {
    this.keys.release(e.code);
  }

  /** Eventos da simulação: decolagem, pouso, recusas, queda e fim da onda. */
  private handleEvents(r: Ride) {
    for (const e of r.run.drain()) {
      switch (e.kind) {
        case 'launch':
          this.sfx.launch();
          if (!r.demo) this.keys.markTakeoff();
          r.rideAwayAt = null;
          break;
        case 'land': {
          const ok = e.landing.outcome !== 'queda';
          if (ok) this.sfx.land(e.landing.outcome === 'limpa' ? 1.2 : 0.8);
          if (r.demo) break;
          if (r.result || !this.heat) break;
          const a = this.heat.registerAerial(e.record, e.landing);
          const [txt, cls] = OUTCOME_TEXT[e.landing.outcome];
          popup(this.ui, a.name, cls, '50%', '20%', true);
          setTimeout(() => popup(this.ui, ok ? `${txt} +${a.points}` : `${txt} ${e.landing.note}`, cls, '50%', '29%'), 220);
          if (a.challenge) setTimeout(() => popup(this.ui, 'DESAFIO CUMPRIDO ×1,5', 'warn', '50%', '36%'), 500);
          if (ok) r.rideAwayAt = r.run.t + e.landing.recovery + RIDE_AWAY_TIME;
          break;
        }
        case 'refused':
          if (!r.demo && !r.result) {
            popup(this.ui, REFUSED_TEXT[e.reason], 'warn', '50%', '40%');
            this.sfx.judgement('late');
          }
          break;
        case 'fall':
          this.sfx.splash();
          r.rideAwayAt = null;
          if (!r.demo && !r.result) {
            if (e.cause === 'fechou') popup(this.ui, 'A onda fechou!', 'bad', '50%', '38%');
            this.endWave(r, e.cause === 'fechou' ? 'fechou' : 'queda', 2.2);
          }
          break;
        case 'finished':
          if (!r.demo && !r.result) {
            this.confirmRideAway(r);
            popup(this.ui, 'FIM DA ONDA', 'good', '50%', '24%', true);
            this.endWave(r, 'fim', 1.4);
          }
          break;
        default:
          break;
      }
    }
  }

  /** Saiu surfando do pouso: soma o bônus de continuidade. */
  private confirmRideAway(r: Ride) {
    if (r.rideAwayAt === null || r.demo || !this.heat || r.result) return;
    r.rideAwayAt = null;
    if (r.run.state !== 'riding' && r.run.state !== 'finished') return;
    const bonus = this.heat.rideAway();
    if (bonus > 0) {
      popup(this.ui, `Saiu surfando +${bonus}`, 'good', '50%', '34%');
      this.sfx.judgement('good');
    }
  }

  private endWave(r: Ride, endedBy: WaveEnd, delay: number) {
    const result = this.heat!.resolveWave(endedBy);
    r.result = result;
    r.endAt = r.time + delay;
    if (result.total > 0) setTimeout(() => popup(this.ui, `Onda: ${result.total}`, 'warn', '50%', '44%', true), 350);
    this.mountHud();
  }

  private showWaveResult() {
    const r = this.ride!.result!;
    this.mode = 'waveResult';
    this.clearUi();
    this.mountHud();
    const last = this.heat!.isOver;
    const card = waveResultCard(r, last);
    this.ui.appendChild(card);
    const next = () => (last ? this.finishHeat() : this.showIntro());
    bind(card, { next }, () => this.click());
    this.primary = next;
  }

  private finishHeat() {
    const heat = this.heat!;
    const sum = heat.summary();
    const rewards = applyHeatResult(state.save, sum);
    persist();
    this.mode = 'heatResult';
    this.clearUi();
    const screen = heatResultScreen(sum, rewards);
    this.ui.appendChild(screen);
    this.sfx.fanfare();
    const again = () => this.go('setup');
    bind(screen, { menu: () => this.go('menu'), skills: () => this.go('skills'), again }, () => this.click());
    this.primary = again;
    this.heat = null;
    this.music.setDucked(false);
    this.demoConditions = null;
    this.startDemo();
  }

  // ---------- Quadro ----------

  frame(dt: number) {
    this.world.stage.setSharp(MENU_MODES.includes(this.mode));
    if (this.paused) {
      // Pausado: só redesenha a cena parada.
      this.world.update(0, this.ride?.time ?? 0, this.world.board.group.position.x);
      return;
    }
    this.fps = this.fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
    if (this.wheelState) this.updateWheel(dt);
    const r = this.ride;
    if (r) {
      // Nas cenas de validação o tempo da onda pode ficar congelado num instante.
      const rideDt = this.labFreeze !== null && r.time >= this.labFreeze ? 0 : dt;
      r.time += rideDt;
      const run = r.run;
      if (rideDt > 0) {
        if (r.pilot) run.setInput(r.pilot.input(run));
        else run.setInput(r.result ? emptyInput() : this.keys.read(run.state === 'airborne'));
      }
      run.update(rideDt);
      this.handleEvents(r);
      if (r.rideAwayAt !== null && run.t >= r.rideAwayAt) this.confirmRideAway(r);
      const f = r.animator.update(r.time, rideDt);
      this.world.applyFrame(f, rideDt);
      if (!r.demo) {
        this.updateRideHud(r, f.heightAboveWater);
        if (run.state === 'riding') this.sfx.setSurf(this.world.wave.power + run.speedFactor * 45, this.world.wave.windSpeed);
      }
      this.world.update(rideDt, r.time, f.boardPos.x);
      if (r.demo && !r.lab && this.demoOver(r)) this.startDemo(!!this.heat);
      if (!r.demo && r.result && r.time > r.endAt && this.mode === 'ride') this.showWaveResult();
    } else {
      this.world.update(dt, 0, 0);
    }
  }

  /** A demonstração recomeça depois de uma queda, do fim da onda ou dos aéreos que ela mostra. */
  private demoOver(r: Ride): boolean {
    const run = r.run;
    if (run.state === 'fallen') return run.t - (run.fallAt ?? run.t) > 2;
    if (run.state === 'finished') return true;
    const p = r.pilot!;
    return p.attempts >= p.maxAttempts && run.state === 'riding' && !!run.lastLanding && run.t - run.lastLanding.t > 2.6;
  }

  private updateWheel(dt: number) {
    const w = this.wheelState!;
    w.t += dt;
    const u = Math.min(1, w.t / w.dur);
    const ease = 1 - Math.pow(1 - u, 3);
    const ang = w.from + (w.to - w.from) * ease;
    w.g.setAttribute('transform', `rotate(${ang} 200 200)`);
    const tick = Math.floor(ang / 25);
    if ((w as { lastTick?: number }).lastTick !== tick) {
      (w as { lastTick?: number }).lastTick = tick;
      if (u < 0.97) this.sfx.tick();
    }
    if (w.t > w.dur + 0.45) {
      const m = w.maneuver;
      this.wheelState = null;
      this.showChallenge(m);
    }
  }

  /** Painel da onda: medidores, instrução conforme o estado real e leitura do voo. */
  private updateRideHud(r: Ride, height: number) {
    const el = this.rideHudEl;
    if (!el) return;
    const q = <T extends HTMLElement = HTMLElement>(k: string) => el.querySelector<T>(`[data-rh="${k}"]`)!;
    const run = r.run;
    const kmh = Math.round(run.speed * 3.6);
    q('speed').style.width = `${Math.round(Math.min(1, run.speed / Math.max(1, run.vMax)) * 100)}%`;
    q('kmh').textContent = `${kmh} km/h${run.accelerating ? ' ▲' : ''}`;
    q('crit').style.width = `${Math.round(Math.min(1, Math.max(0, run.criticality)) * 100)}%`;
    q('gap').textContent = run.dropAt === null ? '' : `quebra a ${Math.max(0, Math.round(run.breakGap))} m`;
    q('comp').style.width = `${Math.round(run.compression * 100)}%`;
    q('ready').textContent = run.takeoffReady ? 'PRONTO' : '';
    const left = run.timeLeft;
    q('time').textContent = left === null ? '—' : `${Math.ceil(left)} s`;
    q('wavepts').textContent = this.heat ? `${r.result ? r.result.total : this.heat.waveSubtotal} pts` : '';
    const airborne = run.state === 'airborne';
    q('lg-agua').hidden = airborne;
    q('lg-ar').hidden = !airborne;
    const air = q('air');
    air.hidden = !airborne;
    if (airborne && run.air) {
      const a = run.air;
      const g = a.activeGrab();
      const ext = a.activeExt();
      const parts = [`${Math.round(Math.abs(a.yaw))}°${a.yaw > 20 ? ' FS' : a.yaw < -20 ? ' BS' : ''}`, `${height.toFixed(1).replace('.', ',')} m`];
      if (Math.abs(a.flip) > 30) parts.push(`flip ${Math.round(Math.abs(a.flip))}°`);
      if (g) parts.push(GRAB_LABELS[g.id === 'mute' && a.japanTweak > 0.5 ? 'japan' : g.id]);
      if (ext) parts.push(EXT_NAMES[ext.id]);
      if (a.varialProgress !== null) parts.push('varial');
      air.textContent = parts.join(' · ');
    }
    const msg = this.rideMessage(r);
    if (msg !== this.lastMsg) {
      this.lastMsg = msg;
      q('msg').textContent = msg;
    }
    if (this.hudEl && this.heat) {
      this.hudEl.querySelector<HTMLElement>('[data-hud=total]')!.textContent = String(this.heat.total);
      this.hudEl.querySelector<HTMLElement>('[data-hud=combo]')!.textContent = `x${this.heat.combo}`;
    }
  }

  /** Instrução curta, sempre conforme o estado real da onda. */
  private rideMessage(r: Ride): string {
    const run = r.run;
    if (r.result) return r.result.endedBy === 'fim' ? 'Fim da onda' : 'Fim da onda: queda';
    switch (run.state) {
      case 'paddling': return 'Pressione D para entrar na onda';
      case 'dropping': return 'Entrando na onda...';
      case 'airborne': return 'No ar: setas giram, Z X C V A seguram a prancha, ↓ prepara o pouso';
      case 'fallen': return 'Queda!';
      case 'finished': return 'Fim da onda';
      default: break;
    }
    if (run.standing < 1) return 'Levantando...';
    if (run.recovering) return 'Recuperando o pouso: siga surfando';
    if (run.compression > 0) return run.takeoffReady ? 'Solte o espaço agora!' : 'Comprimindo: suba até o lip e solte';
    if (run.breakGap < 3) return 'A onda está fechando! Siga em frente (→) e bombeie';
    if (run.speed < V_MIN_AIR) return 'Ganhe velocidade: desça a face (↓) e bombeie (W)';
    if (run.takeoffReady) return 'No lip: segure e solte o espaço para voar';
    return 'Velocidade boa: suba a face (↑) e segure Espaço';
  }

  /**
   * Cena de validação (só no modo de desenvolvimento, ver src/dev/Lab.ts):
   * monta uma onda com o piloto automático fazendo o aéreo pedido e avança
   * rápido até o instante pedido.
   */
  labScene(cfg: {
    maneuver: string;
    /** Erro proposital do piloto (pouso instável ou queda). */
    mistake?: PilotPlan['mistake'];
    /** Evento de referência e segundos depois dele. */
    at: { event: 'inicio' | 'tempo' | 'drop' | 'emPe' | 'decolagem' | 'pouso'; plus: number };
    location?: string;
  }): void {
    const m = findManeuver(cfg.maneuver) ?? MANEUVERS[0];
    this.mode = 'menu';
    this.heat = null;
    this.clearUi();
    const setup = { ...this.setup, locationId: cfg.location ?? this.setup.locationId };
    this.world.setEquipment(setup.boardId, setup.finId, state.save.look);
    const c = generateWaveConditions(setup, () => 0.5);
    this.world.setLocation(setup.locationId, c);
    const ride = this.makeRide(m, true, setup, demoAttributes(state.save.attributes), c, {}, { ...planFor(m), mistake: cfg.mistake });
    ride.lab = true;
    ride.pilot!.maxAttempts = 1;
    // Na cena "remando" o piloto automático não aperta D.
    ride.pilot!.dropAt = cfg.at.event === 'inicio' ? Infinity : 0.6;
    this.ride = ride;
    const p = ride.run.position();
    this.world.camRig.snap(this.tmpTarget.set(p.x, p.y, p.z), c.height);
    this.labFreeze = null;
    const eventTime = (): number | null => {
      const run = ride.run;
      switch (cfg.at.event) {
        case 'inicio':
        case 'tempo': return 0;
        case 'drop': return run.dropAt;
        case 'emPe': return run.dropAt === null ? null : run.dropAt + DROP_TIME;
        case 'decolagem': return run.takeoffAt;
        case 'pouso': return run.lastLanding?.t ?? null;
      }
    };
    let guard = 0;
    while (eventTime() === null && guard++ < 2400) this.frame(1 / 60);
    const target = (eventTime() ?? ride.time) + cfg.at.plus;
    // Instante antes do evento (por exemplo, a cavada antes da decolagem):
    // a onda é determinística, então basta remontar a cena e avançar até ele.
    if (target < ride.time - 1e-6) {
      this.labScene({ ...cfg, at: { event: 'tempo', plus: target } });
      return;
    }
    while (ride.time < target - 1e-6 && guard++ < 4800) this.frame(Math.min(1 / 60, target - ride.time));
    this.labFreeze = target;
    this.frame(0);
  }

  /** Só para depuração: a onda em andamento. */
  get debugRide() {
    return this.ride;
  }

  /** Só para testes e depuração: estado resumido do jogo. */
  debugState() {
    const r = this.ride;
    const run = r?.run;
    return {
      mode: this.mode,
      maneuver: r?.challenge.id,
      rideTime: r?.time,
      run: run ? {
        state: run.state,
        speed: Math.round(run.speed * 100) / 100,
        standing: run.standing,
        ready: run.takeoffReady,
        accelerating: run.accelerating,
        s: Math.round(run.s * 100) / 100,
        dir: Math.round(run.dir * 100) / 100,
        timeLeft: run.timeLeft,
      } : null,
      lastLanding: run?.lastLanding ? { outcome: run.lastLanding.result.outcome, note: run.lastLanding.result.note } : null,
      aerials: this.heat?.wave.map((a) => ({ name: a.name, outcome: a.landing.outcome, points: a.points })) ?? null,
      wave: this.heat?.waveIndex,
      total: this.heat?.total,
      combo: this.heat?.combo,
      board: { pos: this.world.board.group.position.toArray(), id: findBoard(this.setup.boardId).id, fin: findFin(this.setup.finId).id },
      location: findLocation(this.setup.locationId).id,
      fps: Math.round(this.fps),
    };
  }
}
