// Efeitos sonoros sintetizados com Web Audio: sem arquivos externos.
// O áudio só começa depois do primeiro clique ou tecla (regra dos navegadores).
//
// Camadas contínuas durante a onda (todas do mesmo ruído, com filtros diferentes):
//   mar    — arrebentação ao fundo, pela força da onda e o vento;
//   quilha — o chiado da prancha cortando a água, pela velocidade e pela curva;
//   vento  — sobe no ar, mais alto quanto maior o aéreo.
// Eventos: pop, pouso (com um baque grave pelo impacto), queda, torcida da praia e buzina.

type Loop = { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private surf: Loop | null = null;
  private rail: Loop | null = null;
  private wind: Loop | null = null;
  private noise: AudioBuffer | null = null;
  enabled = true;

  unlock() {
    if (this.ctx || !this.enabled) {
      void this.ctx?.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        // Ruído rosado simples: soa mais como água que o ruído branco.
        last = 0.97 * last + 0.03 * (Math.random() * 2 - 1);
        d[i] = last * 6;
      }
      this.startSurf();
    } catch {
      this.ctx = null;
    }
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.5 : 0;
    if (on) this.unlock();
  }

  private loop(type: BiquadFilterType, freq: number, q: number, volume: number): Loop | null {
    if (!this.ctx || !this.noise || !this.master) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    src.connect(filter).connect(gain).connect(this.master);
    // Cada camada começa num ponto diferente do ruído, para não soarem iguais.
    src.start(0, Math.random() * 1.9);
    return { src, gain, filter };
  }

  private startSurf() {
    this.surf = this.loop('lowpass', 600, 1, 0.25);
    this.rail = this.loop('bandpass', 2200, 0.9, 0);
    this.wind = this.loop('bandpass', 700, 0.6, 0);
  }

  /**
   * Som da prancha a cada quadro da onda: `speed` em m/s, `carve` de 0 a 1
   * (força da curva), `height` em metros acima da água quando no ar.
   */
  setRide(speed: number, carve: number, airborne: boolean, height: number) {
    if (!this.ctx || !this.rail || !this.wind) return;
    const t = this.ctx.currentTime;
    const v = clamp01((speed - 1.5) / 10);
    const railGain = airborne ? 0 : v * 0.16 + clamp01(carve) * 0.24;
    this.rail.gain.gain.setTargetAtTime(railGain, t, airborne ? 0.04 : 0.08);
    this.rail.filter.frequency.setTargetAtTime(1500 + v * 1800 + carve * 900, t, 0.1);
    const windGain = airborne ? 0.06 + clamp01(height / 4) * 0.2 : v * 0.035;
    this.wind.gain.gain.setTargetAtTime(windGain, t, 0.15);
    this.wind.filter.frequency.setTargetAtTime(500 + v * 500 + (airborne ? 300 : 0), t, 0.2);
  }

  /** Silencia a quilha e o vento (fim da onda, menus). */
  stopRide() {
    if (!this.ctx || !this.rail || !this.wind) return;
    const t = this.ctx.currentTime;
    this.rail.gain.gain.setTargetAtTime(0, t, 0.2);
    this.wind.gain.gain.setTargetAtTime(0, t, 0.3);
  }

  /** Som ambiente do mar: mais forte com ondas potentes e vento. */
  setSurf(power: number, wind: number) {
    if (!this.surf || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.surf.gain.gain.setTargetAtTime(0.12 + power / 400, t, 0.5);
    this.surf.filter.frequency.setTargetAtTime(450 + power * 6 + wind * 15, t, 0.5);
  }

  private burst(duration: number, freq: number, q: number, volume: number, sweepTo?: number) {
    if (!this.ctx || !this.noise || !this.master || !this.enabled) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + duration);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(volume, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + duration + 0.05);
  }

  private tone(freq: number, duration: number, volume: number, type: OscillatorType = 'sine') {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + duration + 0.02);
  }

  launch() {
    this.burst(0.6, 900, 0.8, 0.5, 2500);
  }

  land(strength = 1) {
    this.burst(0.5 + strength * 0.2, 500, 0.6, 0.6 * strength, 200);
    this.thump(0.45 * strength);
  }

  splash() {
    this.burst(1.2, 400, 0.4, 0.9, 120);
    this.thump(0.5);
  }

  /** Baque grave do impacto na água (sente-se mais do que se ouve). */
  private thump(volume: number) {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.3);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(volume, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.42);
  }

  /**
   * Torcida da praia depois de um aéreo: `amount` de 0 a 1 (pouso e nota).
   * Ruído com tremor rápido (vozes) e, nos grandes, assobios.
   */
  cheer(amount: number) {
    if (!this.ctx || !this.noise || !this.master || !this.enabled || amount <= 0) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dur = 1.4 + amount * 1.6;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1100 + amount * 500;
    f.Q.value = 0.7;
    const g = ctx.createGain();
    const peak = 0.05 + amount * 0.16;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.35);
    g.gain.setTargetAtTime(peak * 0.6, t + 0.6, 0.4);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    // Tremor das vozes.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 6 + Math.random() * 3;
    const depth = ctx.createGain();
    depth.gain.value = peak * 0.35;
    lfo.connect(depth).connect(g.gain);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    lfo.start(t);
    src.stop(t + dur + 0.05);
    lfo.stop(t + dur + 0.05);
    const whistles = amount > 0.75 ? 2 : amount > 0.5 ? 1 : 0;
    for (let i = 0; i < whistles; i++) this.whistle(t + 0.25 + i * 0.45 + Math.random() * 0.15);
  }

  private whistle(at: number) {
    if (!this.ctx || !this.master) return;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    const f0 = 1900 + Math.random() * 500;
    o.frequency.setValueAtTime(f0, at);
    o.frequency.linearRampToValueAtTime(f0 * 1.35, at + 0.18);
    o.frequency.linearRampToValueAtTime(f0 * 1.1, at + 0.42);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.045, at + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.45);
    o.connect(g).connect(this.master);
    o.start(at);
    o.stop(at + 0.5);
  }

  /** Buzina do campeonato (fim da bateria). */
  horn() {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t = this.ctx.currentTime;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1300;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.12, t + 0.05);
    g.gain.setValueAtTime(0.12, t + 0.95);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.25);
    lp.connect(g).connect(this.master);
    for (const f of [233, 294]) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(lp);
      o.start(t);
      o.stop(t + 1.3);
    }
  }

  judgement(kind: 'perfect' | 'good' | 'late' | 'miss') {
    const f = { perfect: 1046, good: 784, late: 523, miss: 196 }[kind];
    this.tone(f, kind === 'miss' ? 0.25 : 0.12, 0.18, kind === 'miss' ? 'sawtooth' : 'triangle');
  }

  click() {
    this.tone(660, 0.06, 0.08, 'triangle');
  }

  tick() {
    this.tone(1200, 0.03, 0.05, 'square');
  }

  fanfare() {
    this.horn();
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.25, 0.14, 'triangle'), i * 110));
  }
}
