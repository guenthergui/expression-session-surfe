// Efeitos sonoros sintetizados com Web Audio: sem arquivos externos.
// O áudio só começa depois do primeiro clique ou tecla (regra dos navegadores).

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private surf: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
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

  private startSurf() {
    if (!this.ctx || !this.noise || !this.master) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.25;
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    this.surf = { src, gain, filter };
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
  }

  splash() {
    this.burst(1.2, 400, 0.4, 0.9, 120);
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
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.25, 0.14, 'triangle'), i * 110));
  }
}
