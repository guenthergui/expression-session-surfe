// Música tema: um arquivo em loop, separado dos efeitos sintetizados.
// Só começa depois do primeiro clique ou tecla (regra dos navegadores).

const SRC = './music/tema.mp3';
/** Durante a bateria a música fica mais baixa para os efeitos e o timing aparecerem. */
const DUCK = 0.4;

export class Music {
  private audio: HTMLAudioElement | null = null;
  private volume: number;
  private ducked = false;
  private fade = 0;

  constructor(volume: number) {
    this.volume = volume;
  }

  unlock() {
    if (this.volume <= 0) return;
    if (!this.audio) {
      this.audio = new Audio(SRC);
      this.audio.loop = true;
      this.audio.volume = 0;
    }
    if (this.audio.paused) {
      this.audio.play().then(() => this.apply(), () => {});
    }
  }

  /** Volume de 0 a 100; 0 desliga a música. */
  setVolume(v: number) {
    this.volume = v;
    if (v > 0) this.unlock();
    this.apply();
  }

  setDucked(on: boolean) {
    if (this.ducked === on) return;
    this.ducked = on;
    this.apply();
  }

  private apply() {
    const a = this.audio;
    if (!a) return;
    const target = (this.volume / 100) * (this.ducked ? DUCK : 1);
    cancelAnimationFrame(this.fade);
    const from = a.volume;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / 600));
      a.volume = from + (target - from) * t;
      if (t < 1) this.fade = requestAnimationFrame(step);
      else if (target === 0) a.pause();
    };
    this.fade = requestAnimationFrame(step);
  }
}
