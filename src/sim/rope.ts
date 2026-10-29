// Corda do leash: integração de Verlet com restrições de distância.
// As pontas ficam presas no tornozelo e no plug da prancha; os pontos do meio
// sofrem gravidade, arrasto e flutuam sobre a água. Quando a corda estica além
// do comprimento (numa queda), devolve a correção que puxa a prancha.

export interface RopePoint {
  x: number;
  y: number;
  z: number;
}

export class Rope {
  readonly points: RopePoint[];
  private prev: RopePoint[];
  readonly segment: number;

  constructor(readonly length: number, readonly count = 14, start: RopePoint = { x: 0, y: 0, z: 0 }) {
    this.segment = length / (count - 1);
    this.points = Array.from({ length: count }, (_, i) => ({ x: start.x - i * this.segment * 0.3, y: start.y, z: start.z }));
    this.prev = this.points.map((p) => ({ ...p }));
  }

  /** Reposiciona a corda inteira em linha reta entre a e b (início de onda). */
  reset(a: RopePoint, b: RopePoint) {
    for (let i = 0; i < this.count; i++) {
      const t = i / (this.count - 1);
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
      this.points[i] = { ...p };
      this.prev[i] = { ...p };
    }
  }

  /**
   * Avança a simulação. `floor(x, z)` dá a altura da água para a corda boiar.
   * Retorna quanto a corda está esticada além do comprimento (0 se folgada).
   */
  step(dt: number, a: RopePoint, b: RopePoint, floor?: (x: number, z: number) => number, iterations = 8): number {
    if (dt <= 0) return 0;
    const n = this.count;
    const damping = Math.exp(-dt * 2.5);
    const g = -9.81 * dt * dt;
    for (let i = 1; i < n - 1; i++) {
      const p = this.points[i];
      const q = this.prev[i];
      const vx = (p.x - q.x) * damping;
      const vy = (p.y - q.y) * damping;
      const vz = (p.z - q.z) * damping;
      q.x = p.x;
      q.y = p.y;
      q.z = p.z;
      p.x += vx;
      p.y += vy + g;
      p.z += vz;
    }
    for (let it = 0; it < iterations; it++) {
      this.points[0] = { ...a };
      this.points[n - 1] = { ...b };
      for (let i = 0; i < n - 1; i++) {
        const p = this.points[i];
        const q = this.points[i + 1];
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const dz = q.z - p.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        if (d <= this.segment) continue; // corda não empurra, só puxa
        const diff = (d - this.segment) / d;
        const wp = i === 0 ? 0 : i + 1 === n - 1 ? 1 : 0.5;
        const wq = i + 1 === n - 1 ? 0 : i === 0 ? 1 : 0.5;
        p.x += dx * diff * wp;
        p.y += dy * diff * wp;
        p.z += dz * diff * wp;
        q.x -= dx * diff * wq;
        q.y -= dy * diff * wq;
        q.z -= dz * diff * wq;
      }
      if (floor) {
        for (let i = 1; i < n - 1; i++) {
          const p = this.points[i];
          const f = floor(p.x, p.z) + 0.01;
          if (p.y < f) p.y = f;
        }
      }
    }
    this.points[0] = { ...a };
    this.points[n - 1] = { ...b };
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    return Math.max(0, Math.sqrt(dx * dx + dy * dy + dz * dz) - this.length);
  }
}

/** Puxa o ponto b em direção a a até ficar no máximo `length` de distância. */
export function constrainToLength(a: RopePoint, b: RopePoint, length: number): RopePoint {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (d <= length || d === 0) return b;
  const k = length / d;
  return { x: a.x + dx * k, y: a.y + dy * k, z: a.z + dz * k };
}
