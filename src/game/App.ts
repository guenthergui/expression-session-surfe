import * as THREE from 'three';
import { Sfx } from '../audio/Sfx';
import { findBoard, findFin } from '../data/equipment';
import { findLocation } from '../data/locations';
import { clampSetup, generateWaveConditions, type HeatSetup } from '../core/conditions';
import { HeatSession, type WaveResult } from '../core/heat';
import type { CameraMode } from '../core/save';
import { KEY_SYMBOLS, MANEUVERS } from '../core/maneuvers';
import { applyHeatResult } from '../core/rewards';
import { CommandTrack, JUDGEMENT_LABEL, JUDGEMENT_VALUE, LATE_WINDOW_MS, perfectWindow } from '../core/timing';
import type { AirPhase, CommandKey, Conditions, Judgement, Maneuver, Outcome } from '../core/types';
import { planAerial } from '../sim/aerial';
import { DROP_TIME, WaveRun, type TakeoffAttempt } from '../sim/waveRun';
import { World } from '../render/World';
import { bind } from '../ui/dom';
import {
  OUTCOME_TEXT,
  PHASE_LABELS,
  challengeCard,
  heatResultScreen,
  hud,
  introCard,
  lane,
  nextPrompt,
  popup,
  waveResultCard,
  wheel,
  wheelTarget,
} from '../ui/heatViews';
import { helpModal, lockerScreen, menuScreen, settingsScreen, setupScreen, skillsScreen, type MenuHost } from '../ui/screens';
import { AerialAnimator } from './AerialAnimator';
import { persist, resetProgress, state } from './state';

type Mode = 'menu' | 'setup' | 'skills' | 'locker' | 'settings' | 'intro' | 'roulette' | 'challenge' | 'ride' | 'waveResult' | 'heatResult';

const KEY_CODES: Record<string, CommandKey> = {
  Space: 'SPACE',
  ArrowUp: 'UP',
  ArrowDown: 'DOWN',
  ArrowLeft: 'LEFT',
  ArrowRight: 'RIGHT',
  KeyZ: 'Z',
  KeyX: 'X',
};

const AIR_PHASE_LABEL: Record<AirPhase, string> = {
  remada: 'Remada',
  drop: 'Drop',
  surf: 'Surf',
  aceleracao: 'Acelerando',
  decolagem: 'Decolagem',
  subida: 'Subida',
  manobra: 'Rotação e grab',
  descida: 'Descida',
  aterrissagem: 'Aterrissagem',
  saida: 'Saída',
};

/** Segundos entre o drop (D) e o começo da barra de comandos. */
export const LANE_DELAY = 3;

const JUDGE_CLASS: Record<Judgement, string> = { perfect: 'good', good: 'good', late: 'warn', miss: 'bad' };

/** Uma onda em andamento (jogada ou de demonstração). */
interface Ride {
  maneuver: Maneuver;
  /** Máquina de estados da aproximação (remada, drop, surf, aceleração). */
  run: WaveRun;
  /** Trilha de comandos: só existe depois da decolagem. */
  track: CommandTrack | null;
  animator: AerialAnimator;
  time: number;
  outcome: Outcome | null;
  result: WaveResult | null;
  demo: boolean;
  endAt: number;
  /** Resultados forçados para demonstração e cenas de validação. */
  forced?: (i: number, phase: string) => Judgement;
  /** Velocidade de aproximação (0 a 1) no instante da decolagem. */
  approach: number;
  /** Instante em que a onda fechou sobre o surfista, se fechou. */
  closedAt?: number;
  /** Cena de validação: não reinicia sozinha. */
  lab?: boolean;
}

export class App implements MenuHost {
  readonly world: World;
  readonly sfx = new Sfx();
  private ui: HTMLElement;
  private mode: Mode = 'menu';
  private heat: HeatSession | null = null;
  private ride: Ride | null = null;
  private setup: HeatSetup;
  private screenEl: HTMLElement | null = null;
  private laneEl: HTMLElement | null = null;
  private promptEl: HTMLElement | null = null;
  private hudEl: HTMLElement | null = null;
  private wheelState: { g: SVGGElement; from: number; to: number; t: number; dur: number; maneuver: Maneuver } | null = null;
  private lastReal = performance.now();
  private primary: (() => void) | null = null;
  private lastPhase: AirPhase | null = null;
  /** Condições mostradas na demonstração de fundo (as da onda atual, durante a bateria). */
  private demoConditions: Conditions | null = null;
  fps = 0;
  /** Nas cenas de validação, o tempo da onda congela neste instante. */
  labFreeze: number | null = null;
  /** Nas cenas de validação, quando o piloto automático aperta D. */
  labDropAt = 0.8;

  constructor(view: HTMLElement, ui: HTMLElement) {
    this.ui = ui;
    const save = state.save;
    this.world = new World(view, save.prefs.quality, save.prefs.camera);
    this.sfx.enabled = save.prefs.sound;
    this.setup = clampSetup(save.lastSetup);
    this.preview(this.setup);
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));
    // Se a janela perde o foco com W apertado, a aceleração para.
    window.addEventListener('blur', () => this.ride?.run.setAccelerate(false));
    window.addEventListener('pointerdown', () => this.sfx.unlock(), { once: false });
    this.go('menu');
  }

  // ---------- Telas de menu ----------

  go(screen: 'menu' | 'setup' | 'skills' | 'locker' | 'settings') {
    this.mode = screen;
    this.heat = null;
    this.demoConditions = null;
    this.labFreeze = null;
    this.world.camRig.override = null;
    this.clearUi();
    const builders = { menu: menuScreen, setup: setupScreen, skills: skillsScreen, locker: lockerScreen, settings: settingsScreen };
    this.screenEl = builders[screen](this);
    this.ui.appendChild(this.screenEl);
    this.primary = screen === 'menu' ? () => this.go('setup') : screen === 'setup' ? () => (this.screenEl as HTMLElement & { submit?: () => void }).submit?.() : null;
    if (!this.ride || !this.ride.demo) this.startDemo();
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
    this.world.setEquipment(setup.boardId, setup.finId, state.save.loadout);
    const c = generateWaveConditions(setup, () => 0.5);
    this.world.setLocation(setup.locationId, c);
    this.sfx.setSurf(c.power, c.windSpeed);
    if (this.ride?.demo) this.startDemo();
  }

  refreshLook() {
    this.world.setEquipment(this.setup.boardId, this.setup.finId, state.save.loadout);
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

  resetProgress() {
    resetProgress();
    this.setup = clampSetup(state.save.lastSetup);
    this.preview(this.setup);
  }

  private clearUi() {
    this.ui.innerHTML = '';
    this.screenEl = null;
    this.laneEl = null;
    this.promptEl = null;
    this.hudEl = null;
    this.wheelState = null;
    this.primary = null;
  }

  // ---------- Bateria ----------

  startHeat(setup: HeatSetup) {
    const save = state.save;
    this.setup = clampSetup(setup);
    save.lastSetup = { ...this.setup };
    persist();
    this.world.setEquipment(this.setup.boardId, this.setup.finId, save.loadout);
    this.heat = new HeatSession(this.setup, { ...save.attributes }, save.unlockedManeuvers, save.discoveries, Math.random, { ...save.mastery });
    this.showIntro();
  }

  private mountHud() {
    if (!this.heat) return;
    this.hudEl?.remove();
    // Depois do pouso, o HUD continua mostrando a onda que acabou de ser surfada.
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
    const card = challengeCard(heat, m, heat.estimate());
    this.ui.appendChild(card);
    bind(card, { go: () => this.startRide(), respin: () => this.spin(true) }, () => this.click());
    this.primary = () => this.startRide();
  }

  /**
   * Prepara a onda: o surfista começa deitado remando. A trilha de comandos e o
   * plano de voo só são criados na decolagem (espaço), porque o instante e a
   * velocidade dependem do jogador.
   */
  private makeRide(m: Maneuver, demo: boolean, setup: HeatSetup, attrs: typeof state.save.attributes): Ride {
    const board = findBoard(setup.boardId);
    const fin = findFin(setup.finId);
    const run = new WaveRun(this.world.wave, {
      forca: attrs.forca,
      controleAereo: attrs.controleAereo,
      equipImpulse: board.mods.impulsao + fin.mods.impulsao,
      takeoffDelay: LANE_DELAY,
    });
    const animator = new AerialAnimator(m, this.world.wave, this.world.board, run);
    this.rideAttrs = attrs;
    return { maneuver: m, run, track: null, animator, time: 0, outcome: demo ? 'limpa' : null, result: null, demo, endAt: Infinity, approach: 0 };
  }

  private rideAttrs: typeof state.save.attributes = state.save.attributes;
  private tmpTarget = new THREE.Vector3();
  private lastHint = '';

  private startRide() {
    const heat = this.heat!;
    const m = heat.currentManeuver!;
    this.mode = 'ride';
    this.clearUi();
    this.mountHud();
    const c = heat.currentConditions;
    this.world.setLocation(heat.setup.locationId, c);
    this.ride = this.makeRide(m, false, heat.setup, heat.attributes);
    this.laneEl = lane(m);
    this.promptEl = nextPrompt();
    this.ui.append(this.laneEl, this.promptEl);
    this.lastPhase = null;
    this.lastHint = '';
    const p = this.ride.run.position();
    this.world.camRig.snap(this.tmpTarget.set(p.x, p.y, p.z), c.height);
  }

  /** Demonstração em loop nos menus: remada, drop, aceleração e aéreo com execução perfeita. */
  private startDemo(calm = false) {
    const save = state.save;
    const pool = MANEUVERS.filter((m) => save.unlockedManeuvers.includes(m.id) && !m.experimental);
    const m = calm ? MANEUVERS[0] : pool[Math.floor(Math.random() * pool.length)];
    const c = this.demoConditions ?? generateWaveConditions(this.setup, () => 0.5);
    this.world.setLocation(this.setup.locationId, c);
    const ride = this.makeRide(m, true, this.setup, { ...save.attributes, amplitude: 60, forca: 50 });
    ride.forced = () => 'perfect';
    this.ride = ride;
    const p = ride.run.position();
    this.world.camRig.snap(this.tmpTarget.set(p.x, p.y, p.z), c.height);
  }

  /**
   * Piloto automático da demonstração e das cenas de validação: rema um pouco,
   * aperta D, segura W e decola no pico da subida, com os comandos forçados.
   */
  private autopilot(r: Ride, dropAt = 0.8) {
    const run = r.run;
    if (run.state === 'paddling' && r.time > dropAt) run.pressDrop();
    if (run.state === 'riding') {
      run.setAccelerate(run.standing >= 1);
      if (run.takeoffReady && Math.abs(run.timeToPeak()) < 0.03) this.takeoff(r);
    }
  }

  private onKey(e: KeyboardEvent) {
    this.sfx.unlock();
    if (document.querySelector('.modal-bg')) {
      if (e.code === 'Escape') document.querySelector('.modal-bg')?.remove();
      return;
    }
    const key = KEY_CODES[e.code];
    const rideKey = key || e.code === 'KeyD' || e.code === 'KeyW';
    if (rideKey && (this.mode === 'ride' || this.mode === 'intro' || this.mode === 'challenge' || this.mode === 'waveResult')) e.preventDefault();
    if (this.mode === 'ride' && this.ride && !this.ride.demo) {
      this.rideKey(e.code, key, e.repeat);
      return;
    }
    if ((e.code === 'Space' || e.code === 'Enter') && this.primary && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLSelectElement)) {
      if (e.code === 'Space' && this.mode !== 'intro' && this.mode !== 'challenge' && this.mode !== 'waveResult') return;
      e.preventDefault();
      this.primary();
    }
    if (e.code === 'Escape' && (this.mode === 'setup' || this.mode === 'skills' || this.mode === 'locker' || this.mode === 'settings')) this.go('menu');
  }

  /** Tempo atual da onda em ms, com a fração desde o último quadro para medir o toque com precisão. */
  private rideNowMs(): number {
    const extra = Math.min(50, performance.now() - this.lastReal);
    return (this.ride?.time ?? 0) * 1000 + extra;
  }

  /**
   * Teclas durante a onda, conforme o estado:
   *   D: drop (só remando); W: acelerar (segurar); espaço: decolar (só quando pronto);
   *   setas, Z e X: comandos da manobra, que só valem no ar.
   */
  private rideKey(code: string, key: CommandKey | undefined, repeat: boolean) {
    const r = this.ride!;
    if (r.result) return;
    const run = r.run;
    if (code === 'KeyD') {
      if (!repeat && run.pressDrop()) {
        this.sfx.click();
        popup(this.ui, 'DROP!', 'good', '50%', 'calc(100% - 210px)');
      }
      return;
    }
    if (code === 'KeyW') {
      run.setAccelerate(true);
      return;
    }
    if (!key) return;
    if (!r.track) {
      if (key === 'SPACE' && !repeat) this.takeoff(r);
      return; // setas, Z e X ficam bloqueadas até a decolagem
    }
    if (key === 'SPACE') return; // a decolagem já foi feita
    const res = r.track.press(key, this.rideNowMs());
    if (!res) return;
    this.onJudgement(res.index, res.judgement, res.offsetMs);
  }

  private onKeyUp(e: KeyboardEvent) {
    if (e.code === 'KeyW' && this.ride && !this.ride.demo) this.ride.run.setAccelerate(false);
  }

  /** Espaço: tenta decolar. Se ainda não dá, explica o motivo sem gastar a tentativa. */
  takeoff(r: Ride): boolean {
    const attempt: TakeoffAttempt = r.run.tryTakeoff();
    if (!attempt.ok) {
      if (!r.demo) {
        const msg = {
          deitado: 'Prepare o drop: aperte D',
          levantando: 'Espere ficar em pé',
          aguarde: 'Espere a barra de comandos começar',
          velocidade: 'Ganhe velocidade para realizar o aéreo (segure W)',
          posicao: 'Espere chegar perto do lip',
          jaDecolou: '',
        }[attempt.reason!];
        if (msg) popup(this.ui, msg, 'warn', '50%', '40%');
      }
      return false;
    }
    const m = r.maneuver;
    const steps = m.sequence;
    const airTime = steps[steps.length - 1].time;
    const track = new CommandTrack(steps, r.time * 1000, perfectWindow(this.rideAttrs.controleAereo));
    track.presetFirst(attempt.judgement!, attempt.offset! * 1000);
    if (r.forced) steps.forEach((s, i) => (track.results[i] = r.forced!(i, s.phase)));
    r.track = track;
    r.approach = r.run.speedFactor;
    const plan = planAerial({
      wave: this.world.wave,
      launch: r.run.position(),
      launchTime: r.time,
      speed: r.run.speed,
      airTime,
      takeoff: JUDGEMENT_VALUE[track.results[0] ?? attempt.judgement!],
      amplitude: this.rideAttrs.amplitude,
      topSpeed: r.run.vMax,
    });
    r.animator.beginAir(plan, track);
    if (!r.demo) this.onJudgement(0, attempt.judgement!, attempt.offset! * 1000);
    return true;
  }

  private onJudgement(index: number, j: Judgement, offsetMs: number) {
    const r = this.ride!;
    const step = r.track!.steps[index];
    const label = j === 'late' && offsetMs < 0 ? 'Late (cedo)' : JUDGEMENT_LABEL[j];
    popup(this.ui, label.toUpperCase(), JUDGE_CLASS[j], '50%', 'calc(100% - 210px)');
    this.sfx.judgement(j);
    if (j === 'miss' && step.essential) popup(this.ui, `${PHASE_LABELS[step.phase]} perdida!`, 'bad', '50%', '38%');
  }

  private resolveRide() {
    const r = this.ride!;
    let steps;
    if (r.track) {
      r.track.finish();
      steps = r.track.stepResults();
    } else {
      // A onda fechou antes da decolagem: nenhum comando foi feito.
      steps = r.maneuver.sequence.map((step) => ({ step, judgement: 'miss' as Judgement }));
      popup(this.ui, 'A onda fechou!', 'bad', '50%', '38%');
    }
    const result = this.heat!.resolve(steps, r.track ? r.approach : undefined);
    r.result = result;
    r.outcome = result.outcome;
    r.endAt = !r.track ? r.time + 1.9 : result.outcome === 'queda' ? Math.max(r.time, r.animator.airEnd) + 1.9 : r.animator.totalTime + 0.2;
    const [txt, cls] = OUTCOME_TEXT[result.outcome];
    popup(this.ui, txt, cls, '50%', '24%', true);
    if (result.score.total > 0) setTimeout(() => popup(this.ui, `+${result.score.total}`, 'warn', '50%', '32%', true), 250);
    if (result.outcome === 'queda') this.sfx.splash();
    else this.sfx.land(result.outcome === 'limpa' ? 1.2 : 0.8);
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
    this.demoConditions = null;
    this.startDemo();
  }

  // ---------- Quadro ----------

  frame(dt: number) {
    this.lastReal = performance.now();
    this.fps = this.fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
    if (this.wheelState) this.updateWheel(dt);
    const r = this.ride;
    if (r) {
      // Nas cenas de validação o tempo da onda pode ficar congelado num instante.
      const rideDt = this.labFreeze !== null && r.time >= this.labFreeze ? 0 : dt;
      r.time += rideDt;
      if (r.demo && r.track === null && rideDt > 0) this.autopilot(r, r.lab ? this.labDropAt : 0.8);
      r.run.update(rideDt);
      if (!r.demo) this.updateRideLogic(r);
      const f = r.animator.update(r.time, rideDt, r.outcome);
      this.world.applyFrame(f, rideDt);
      for (const e of f.events) if (e.kind === 'launch') this.sfx.launch();
      if (!r.demo) {
        this.updateLane(r, f.phase);
        if (r.run.state === 'riding') this.sfx.setSurf(this.world.wave.power + r.run.speedFactor * 45, this.world.wave.windSpeed);
      }
      this.world.update(rideDt, r.time, f.boardPos.x);
      const demoOver = r.run.state === 'fallen' ? r.time - this.fellAt(r) > 2 : r.time > r.animator.totalTime + 0.4;
      if (r.demo && !r.lab && demoOver) this.startDemo(!!this.heat);
      if (!r.demo && r.result && r.time > r.endAt && this.mode === 'ride') this.showWaveResult();
    } else {
      this.world.update(dt, 0, 0);
    }
  }

  /** Momento em que a onda fechou sobre o surfista (para encerrar a demonstração). */
  private fellAt(r: Ride): number {
    if (r.closedAt === undefined) r.closedAt = r.time;
    return r.closedAt;
  }

  private updateRideLogic(r: Ride) {
    if (r.result) return;
    // A quebra alcançou o surfista antes da decolagem.
    if (!r.track && r.run.state === 'fallen') {
      this.resolveRide();
      return;
    }
    if (!r.track) return;
    const now = r.time * 1000;
    for (const i of r.track.update(now)) this.onJudgement(i, 'miss', 0);
    const landMs = r.track.targetMs(r.track.steps.length - 1);
    if ((r.track.done && now >= r.animator.airEnd * 1000) || now > landMs + LATE_WINDOW_MS + 10) this.resolveRide();
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

  private updateLane(r: Ride, phase: AirPhase) {
    if (!this.laneEl || !this.promptEl) return;
    const trackEl = this.laneEl.querySelector<HTMLElement>('.lane-track')!;
    const width = trackEl.clientWidth || 800;
    const hitX = width * 0.2;
    const speed = width / 2.6; // px por segundo
    const now = r.time * 1000;
    (this.laneEl.querySelector('[data-lane=hit]') as HTMLElement).style.left = `${hitX - 2}px`;
    const perfect = this.laneEl.querySelector<HTMLElement>('[data-lane=perfect]')!;
    const track = r.track;
    const pw = ((track?.perfectMs ?? 80) / 1000) * speed;
    perfect.style.left = `${hitX - pw}px`;
    perfect.style.width = `${pw * 2}px`;
    const lipTarget = this.laneStarted(r) ? now + r.run.nextPeakIn() * 1000 : null;
    r.maneuver.sequence.forEach((_, i) => {
      const note = this.laneEl!.querySelector<HTMLElement>(`[data-note="${i}"]`)!;
      if (!track) {
        if (lipTarget !== null) {
          // 3 s depois do drop a barra anda: a nota do espaço chega à linha no próximo pico do lip.
          note.classList.remove('preview');
          const x = hitX + ((lipTarget + r.maneuver.sequence[i].time * 1000 - now) / 1000) * speed;
          note.style.left = `${x}px`;
          note.style.display = x < -60 || x > width + 60 ? 'none' : 'grid';
          return;
        }
        // Até lá as notas ficam paradas à direita, como prévia da sequência.
        note.style.left = `${width - 60 - (r.maneuver.sequence.length - 1 - i) * 62}px`;
        note.style.display = 'grid';
        note.classList.add('preview');
        return;
      }
      note.classList.remove('preview');
      const x = hitX + ((track.targetMs(i) - now) / 1000) * speed;
      note.style.left = `${x}px`;
      note.style.display = x < -60 || x > width + 60 ? 'none' : 'grid';
      const res = track.results[i];
      note.classList.toggle('done', !!res && res !== 'miss');
      note.classList.toggle('missed', res === 'miss');
    });
    if (phase !== this.lastPhase) {
      this.lastPhase = phase;
      this.laneEl.querySelector<HTMLElement>('[data-lane=phase]')!.textContent = `Fase: ${AIR_PHASE_LABEL[phase]}`;
    }
    const hint = this.laneEl.querySelector<HTMLElement>('[data-lane=hint]')!;
    const q = (track?.results ?? []).filter((x) => x).map((x) => JUDGEMENT_VALUE[x!]);
    hint.textContent = q.length
      ? `Execução ${Math.round((q.reduce((a, b) => a + b, 0) / q.length) * 100)}%`
      : track || lipTarget !== null
        ? 'Aperte quando a tecla cruzar a linha'
        : r.run.dropAt !== null
          ? `A barra começa em ${Math.max(0, LANE_DELAY - (r.time - r.run.dropAt)).toFixed(1).replace('.', ',')} s`
          : 'Sequência do aéreo (a barra começa 3 s depois do drop)';
    const key = this.promptEl.querySelector<HTMLElement>('[data-np=key]')!;
    const bar = this.promptEl.querySelector<HTMLElement>('[data-np=bar]')!;
    const time = this.promptEl.querySelector<HTMLElement>('[data-np=time]')!;
    const ph = this.promptEl.querySelector<HTMLElement>('[data-np=phase]')!;
    if (!track) {
      this.approachPrompt(r, key, ph, bar, time);
    } else if (track.nextIndex < track.steps.length && !r.result) {
      const ni = track.nextIndex;
      const st = track.steps[ni];
      const left = (track.targetMs(ni) - now) / 1000;
      key.textContent = KEY_SYMBOLS[st.key];
      key.className = `key k-${st.phase} ${st.essential ? 'essential' : ''}`;
      ph.textContent = `${PHASE_LABELS[st.phase]}${st.essential ? ' · essencial' : ''}`;
      bar.style.width = `${Math.max(0, Math.min(1, 1 - left / 1.2)) * 100}%`;
      time.textContent = left > 0 ? `${left.toFixed(2)} s` : 'agora!';
    } else {
      key.textContent = '✓';
      key.className = 'key k-aterrissagem';
      ph.textContent = r.result ? OUTCOME_TEXT[r.result.outcome][0] : 'Aguardando o pouso';
      bar.style.width = '100%';
      time.textContent = '';
    }
    if (this.hudEl && this.heat) {
      this.hudEl.querySelector<HTMLElement>('[data-hud=total]')!.textContent = String(this.heat.total);
      this.hudEl.querySelector<HTMLElement>('[data-hud=combo]')!.textContent = `x${this.heat.combo}`;
    }
  }

  /** A barra de comandos começa a andar 3 s depois do drop, com o surfista surfando. */
  private laneStarted(r: Ride): boolean {
    return r.run.state === 'riding' && r.run.dropAt !== null && r.time - r.run.dropAt >= LANE_DELAY;
  }

  /** Instrução da aproximação, sempre conforme o estado real da onda. */
  private approachPrompt(r: Ride, key: HTMLElement, ph: HTMLElement, bar: HTMLElement, time: HTMLElement) {
    const run = r.run;
    const kmh = Math.round(run.speed * 3.6);
    let k = '';
    let text = '';
    let cls = 'k-impulsao';
    let fill = run.speedFactor;
    if (run.state === 'paddling') {
      k = 'D';
      text = 'Pressione D para entrar na onda';
      fill = 0;
    } else if (run.state === 'dropping' || run.standing < 1) {
      k = '…';
      text = 'Entre na onda...';
      fill = run.standing;
    } else if (run.state === 'fallen') {
      k = '✕';
      text = 'A onda fechou';
      cls = 'k-aterrissagem';
    } else if (run.takeoffReady) {
      k = 'Espaço';
      text = 'Pressione ESPAÇO para decolar';
      cls = 'k-aterrissagem';
    } else if (run.breakGap < 4) {
      k = 'W';
      text = 'A onda está fechando! Segure W';
      cls = 'k-grab';
    } else if (run.speed < run.vMinTakeoff) {
      k = 'W';
      text = run.lipCloseness() > 0.7 ? 'Ganhe velocidade para realizar o aéreo' : 'Segure W para ganhar velocidade';
    } else {
      k = 'Espaço';
      text = 'Velocidade boa: espere chegar perto do lip';
      cls = 'k-rotacao';
    }
    key.textContent = k;
    key.className = `key ${cls}`;
    if (text !== this.lastHint) {
      this.lastHint = text;
      ph.textContent = text;
    }
    bar.style.width = `${Math.round(fill * 100)}%`;
    time.textContent = run.state === 'paddling' || run.state === 'dropping' ? '' : `${kmh} km/h${run.accelerating ? ' ▲' : ''}`;
  }

  /**
   * Cena de validação (só no modo de desenvolvimento, ver src/dev/Lab.ts):
   * monta uma onda com resultados forçados, deixa o piloto automático remar,
   * fazer o drop e decolar, e avança rápido até o instante pedido.
   */
  labScene(cfg: {
    maneuver: string;
    results?: (i: number, phase: string) => Judgement;
    outcome: Outcome;
    /** Evento de referência e segundos depois dele. */
    at: { event: 'inicio' | 'drop' | 'emPe' | 'decolagem' | 'pouso'; plus: number };
    location?: string;
  }) {
    const m = MANEUVERS.find((x) => x.id === cfg.maneuver) ?? MANEUVERS[0];
    this.mode = 'menu';
    this.heat = null;
    this.clearUi();
    const setup = { ...this.setup, locationId: cfg.location ?? this.setup.locationId };
    this.world.setEquipment(setup.boardId, setup.finId, state.save.loadout);
    const c = generateWaveConditions(setup, () => 0.5);
    this.world.setLocation(setup.locationId, c);
    const ride = this.makeRide(m, true, setup, { ...state.save.attributes, amplitude: 60, forca: 50 });
    ride.forced = cfg.results ?? (() => 'perfect');
    ride.outcome = cfg.outcome;
    ride.lab = true;
    this.ride = ride;
    // Na cena "remando" o piloto automático não aperta D.
    this.labDropAt = cfg.at.event === 'inicio' ? Infinity : 0.6;
    const p = ride.run.position();
    this.world.camRig.snap(this.tmpTarget.set(p.x, p.y, p.z), c.height);
    this.labFreeze = null;
    const eventTime = (): number | null => {
      const run = ride.run;
      switch (cfg.at.event) {
        case 'inicio': return 0;
        case 'drop': return run.dropAt;
        case 'emPe': return run.dropAt === null ? null : run.dropAt + DROP_TIME;
        case 'decolagem': return run.takeoffAt;
        case 'pouso': return Number.isFinite(ride.animator.airEnd) ? ride.animator.airEnd : null;
      }
    };
    let guard = 0;
    while (eventTime() === null && guard++ < 1200) this.frame(1 / 60);
    const target = (eventTime() ?? ride.time) + cfg.at.plus;
    while (ride.time < target - 1e-6 && guard++ < 2400) this.frame(Math.min(1 / 60, target - ride.time));
    this.labFreeze = target;
    this.frame(0);
  }

  /** Só para testes e depuração: estado resumido do jogo. */
  debugState() {
    const r = this.ride;
    return {
      mode: this.mode,
      maneuver: r?.maneuver.id,
      rideTime: r?.time,
      results: r?.track?.results ?? null,
      run: r ? { state: r.run.state, speed: Math.round(r.run.speed * 100) / 100, standing: r.run.standing, ready: r.run.takeoffReady, accelerating: r.run.accelerating } : null,
      outcome: r?.outcome,
      wave: this.heat?.waveIndex,
      total: this.heat?.total,
      combo: this.heat?.combo,
      board: { pos: this.world.board.group.position.toArray(), id: findBoard(this.setup.boardId).id, fin: findFin(this.setup.finId).id },
      location: findLocation(this.setup.locationId).id,
      fps: Math.round(this.fps),
    };
  }
}
