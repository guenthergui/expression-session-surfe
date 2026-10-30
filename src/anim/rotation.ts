// Dinâmica do giro no ar.
//
// O impulso de cada meia volta vem do quadril e dos ombros num intervalo curto
// em volta do comando. Depois disso o momento angular L do corpo fica quase
// constante, e a velocidade angular é ω = L / I: com braços abertos e pernas
// esticadas o momento de inércia I cresce e o giro desacelera; encolhido, ele
// acelera. O total de cada meia volta continua sendo o que o comando decidiu
// (180°, 150° com Late, 0 com Miss), mas o perfil no tempo segue essa física.

/** Momento de inércia relativo em torno do eixo vertical: braços abertos pesam mais que pernas encolhidas. */
export function spinInertia(spread: number, tuck: number): number {
  return 1 + 0.85 * Math.max(0, spread) - 0.3 * Math.max(0, tuck);
}

/** Janela do impulso de uma meia volta, relativa ao instante do comando (s). */
export const DRIVE_BEFORE = 0.22;
export const DRIVE_AFTER = 0.3;

const STEP = 1 / 240;

/**
 * Curva acumulada (0 a 1) de uma meia volta: integra ω = L·impulso(t) / I(t).
 * O impulso tem forma de sino (o quadril começa, os ombros completam).
 */
export class SpinCurve {
  private readonly cdf: Float64Array;
  private readonly t0: number;

  constructor(readonly time: number, inertiaAt: (t: number) => number) {
    this.t0 = time - DRIVE_BEFORE;
    const n = Math.ceil((DRIVE_BEFORE + DRIVE_AFTER) / STEP) + 1;
    this.cdf = new Float64Array(n);
    let acc = 0;
    for (let i = 1; i < n; i++) {
      const u = (i - 0.5) / (n - 1);
      const drive = Math.sin(Math.PI * u) ** 2;
      acc += (drive / inertiaAt(this.t0 + (i - 0.5) * STEP)) * STEP;
      this.cdf[i] = acc;
    }
    for (let i = 1; i < n; i++) this.cdf[i] /= acc;
  }

  /** Fração da meia volta completada no tempo de voo t. */
  at(t: number): number {
    const x = (t - this.t0) / STEP;
    if (x <= 0) return 0;
    const n = this.cdf.length - 1;
    if (x >= n) return 1;
    const i = Math.floor(x);
    return this.cdf[i] + (this.cdf[i + 1] - this.cdf[i]) * (x - i);
  }
}

/**
 * Mola criticamente amortecida com subpassos fixos de 1/240 s: o resultado não
 * depende da taxa de quadros. Usada para o quadril seguir os ombros e a
 * prancha seguir o quadril.
 */
export class Follower {
  value = 0;
  vel = 0;
  private acc = 0;

  constructor(readonly stiffness: number) {}

  reset(v: number) {
    this.value = v;
    this.vel = 0;
    this.acc = 0;
  }

  update(target: number, dt: number) {
    if (dt <= 0) return this.value;
    const k = this.stiffness;
    const c = 2 * Math.sqrt(k);
    this.acc += dt;
    while (this.acc >= STEP) {
      this.acc -= STEP;
      const a = k * (target - this.value) - c * this.vel;
      this.vel += a * STEP;
      this.value += this.vel * STEP;
    }
    return this.value;
  }
}
