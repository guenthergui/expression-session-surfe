// Campo de altura do mar, em metros, sem depender do Three.js.
// A mesma função alimenta a malha do oceano e a trajetória do surfista, então
// o que o jogador vê é exatamente a superfície usada para os pousos.
//
// Eixos: x corre ao longo da crista (o surfista avança em +x), y é para cima e
// z aponta para a praia. A crista principal fica em z = 0 e a face da onda fica
// voltada para +z. A onda quebra em sequência: tudo com x < breakX já quebrou.

export interface WaveState {
  /** Altura da onda principal em metros. */
  height: number;
  /** Potência de 0 a 100: deixa a face mais íngreme e a quebra mais rápida. */
  power: number;
  /** Vento em km/h e direção: terral sopra para -z, maral para +z, lateral para +x. */
  windSpeed: number;
  windDir: { x: number; z: number };
  /** Piscinas de onda não têm ondulação de fundo. */
  pool: boolean;
  /** Tempo em segundos e posição da quebra. */
  time: number;
  breakX0: number;
  peelSpeed: number;
}

export function createWave(p: Partial<WaveState> = {}): WaveState {
  return {
    height: 1.5,
    power: 60,
    windSpeed: 10,
    windDir: { x: 0, z: 1 },
    pool: false,
    time: 0,
    breakX0: -20,
    peelSpeed: 6,
    ...p,
  };
}

export function breakX(w: WaveState): number {
  return w.breakX0 + w.peelSpeed * w.time;
}

/** Larguras da face (frente) e das costas da onda. */
export function faceWidth(w: WaveState): number {
  return (1.3 - w.power / 400) * w.height + 1.3;
}

export function backWidth(w: WaveState): number {
  return 4 * w.height + 5;
}

function smoothstep(a: number, b: number, v: number): number {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Perfil da onda principal (0 a 1) em função da distância s até a crista (+ = frente). */
export function mainProfile(w: WaveState, s: number): number {
  if (s >= 0) {
    const F = faceWidth(w);
    const u = Math.min(s / F, 1);
    const steep = 1.15 + w.power / 250;
    const face = Math.pow(0.5 * (1 + Math.cos(Math.PI * u)), steep);
    const trough = -0.1 * Math.exp(-Math.pow((s - F) / (0.55 * F), 2));
    return face + trough;
  }
  const B = backWidth(w);
  const u = Math.max(s / B, -1);
  return 0.5 * (1 + Math.cos(Math.PI * u));
}

/** Quanto a onda já quebrou neste x (0 = intacta, 1 = espuma). */
export function brokenness(w: WaveState, x: number): number {
  return smoothstep(0, 9, breakX(w) - x);
}

/** Ondulações menores de fundo e de vento. */
export function swell(w: WaveState, x: number, z: number): number {
  const t = w.time;
  const k = w.pool ? 0.15 : 1;
  const chop = w.pool ? 0 : (w.windSpeed / 30) * 0.06;
  return (
    k * 0.14 * Math.sin(0.21 * z - 0.9 * t + 0.07 * x) +
    k * 0.09 * Math.sin(0.33 * x + 0.17 * z - 1.3 * t) +
    k * 0.05 * Math.sin(0.61 * x - 0.45 * z + 1.7 * t) +
    chop * Math.sin(1.9 * x + 1.3 * z - 3.1 * t) +
    chop * 0.7 * Math.sin(2.7 * x - 2.1 * z + 3.7 * t)
  );
}

/** Altura da crista ao longo de x: o ombro da onda vai diminuindo à frente. */
export function crestHeight(w: WaveState, x: number): number {
  const ahead = x - breakX(w);
  const shoulder = 1 - 0.55 * smoothstep(18, 55, ahead);
  const broken = 1 - 0.5 * brokenness(w, x);
  return w.height * shoulder * broken;
}

/** Leve curvatura da crista no plano, para a onda não parecer uma régua. */
export function crestOffset(w: WaveState, x: number): number {
  const ahead = x - breakX(w);
  return 0.9 * Math.sin(x * 0.045) - 1.2 * smoothstep(10, 50, ahead);
}

export function surfaceHeight(w: WaveState, x: number, z: number): number {
  const s = z - crestOffset(w, x);
  return crestHeight(w, x) * mainProfile(w, s) + swell(w, x, z);
}

export function surfaceNormal(w: WaveState, x: number, z: number): { x: number; y: number; z: number } {
  const e = 0.08;
  const dx = (surfaceHeight(w, x + e, z) - surfaceHeight(w, x - e, z)) / (2 * e);
  const dz = (surfaceHeight(w, x, z + e) - surfaceHeight(w, x, z - e)) / (2 * e);
  const len = Math.hypot(dx, 1, dz);
  return { x: -dx / len, y: 1 / len, z: -dz / len };
}

/**
 * Espuma de 0 a 1: na crista perto da quebra, em toda a face já quebrada e
 * espalhada pelo vento. Usada para cor e rugosidade da água.
 */
export function foamAt(w: WaveState, x: number, z: number): number {
  const s = z - crestOffset(w, x);
  const broken = brokenness(w, x);
  const nearBreak = 1 - smoothstep(0, 22, x - breakX(w));
  const crestBand = Math.exp(-Math.pow((s - 0.15) / 0.55, 2)) * (0.35 + 0.65 * nearBreak);
  const whitewater = broken * smoothstep(-1.5, 0.5, s) * (1 - smoothstep(faceWidth(w) * 0.8, faceWidth(w) * 1.5, s));
  const streaks = 0.5 + 0.5 * Math.sin(x * 1.7 + z * 0.9 + Math.sin(z * 0.6 + w.time) * 2);
  const windBlown = (w.pool ? 0 : w.windSpeed / 40) * Math.exp(-Math.pow((s - 0.8 * w.windDir.z) / 1.2, 2)) * nearBreak;
  return Math.min(1, crestBand * (0.6 + 0.4 * streaks) + whitewater * (0.65 + 0.35 * streaks) + windBlown * 0.4);
}

/**
 * Versão rápida para a malha do oceano: tudo o que só depende de x é calculado
 * uma vez por coluna, e o que só depende da distância até a crista vem de uma
 * tabela. O resultado difere da função exata em menos de 1 cm.
 */
export class FieldSampler {
  private static N = 2048;
  readonly sMin: number;
  readonly sMax: number;
  private profile = new Float32Array(FieldSampler.N);
  private band = new Float32Array(FieldSampler.N);
  private white = new Float32Array(FieldSampler.N);
  private wind = new Float32Array(FieldSampler.N);
  private inv: number;

  constructor(public w: WaveState) {
    const F = faceWidth(w);
    this.sMin = -backWidth(w) - 1;
    this.sMax = F * 3 + 2;
    const N = FieldSampler.N;
    this.inv = (N - 1) / (this.sMax - this.sMin);
    const windK = w.pool ? 0 : w.windSpeed / 40;
    for (let i = 0; i < N; i++) {
      const s = this.sMin + i / this.inv;
      this.profile[i] = mainProfile(w, s);
      this.band[i] = Math.exp(-Math.pow((s - 0.15) / 0.55, 2));
      this.white[i] = smoothstep(-1.5, 0.5, s) * (1 - smoothstep(F * 0.8, F * 1.5, s));
      this.wind[i] = windK * Math.exp(-Math.pow((s - 0.8 * w.windDir.z) / 1.2, 2));
    }
  }

  /** Índice fracionário na tabela para a distância s. */
  private at(table: Float32Array, s: number): number {
    if (s <= this.sMin) return table[0];
    if (s >= this.sMax) return table[table.length - 1];
    const f = (s - this.sMin) * this.inv;
    const i = f | 0;
    const t = f - i;
    return table[i] + (table[i + 1] - table[i]) * t;
  }

  column(x: number) {
    const w = this.w;
    const ahead = x - breakX(w);
    return {
      offset: crestOffset(w, x),
      crestH: crestHeight(w, x),
      broken: brokenness(w, x),
      nearBreak: 1 - smoothstep(0, 22, ahead),
    };
  }

  /** Altura com o swell já calculado por swellFrom(). */
  height(crestH: number, s: number, swellValue: number): number {
    return crestH * this.at(this.profile, s) + swellValue;
  }

  /** Espuma com as listras já calculadas por streakFrom(). */
  foam(col: { broken: number; nearBreak: number }, s: number, streaks: number): number {
    const crestBand = this.at(this.band, s) * (0.35 + 0.65 * col.nearBreak);
    const whitewater = col.broken * this.at(this.white, s);
    const windBlown = this.at(this.wind, s) * col.nearBreak;
    return Math.min(1, crestBand * (0.6 + 0.4 * streaks) + whitewater * (0.65 + 0.35 * streaks) + windBlown * 0.4);
  }
}

// Termos das ondulações de swell() separados em parte de x e parte de z, para
// a malha usar sin(a + b) = sin a·cos b + cos a·sin b sem trigonometria por vértice.
const SWELL_TERMS: [number, number, number][] = [
  // [coef. de x, coef. de z, coef. de t]
  [0.07, 0.21, -0.9],
  [0.33, 0.17, -1.3],
  [0.61, -0.45, 1.7],
  [1.9, 1.3, -3.1],
  [2.7, -2.1, 3.7],
];

export function swellAmplitudes(w: WaveState): number[] {
  const k = w.pool ? 0.15 : 1;
  const chop = w.pool ? 0 : (w.windSpeed / 30) * 0.06;
  return [k * 0.14, k * 0.09, k * 0.05, chop, chop * 0.7];
}

/** sin e cos da parte em x (com o tempo) de cada termo, mais o das listras de espuma. */
export function swellColumn(w: WaveState, x: number, out: Float64Array) {
  for (let i = 0; i < 5; i++) {
    const a = SWELL_TERMS[i][0] * x + SWELL_TERMS[i][2] * w.time;
    out[i] = Math.sin(a);
    out[i + 6] = Math.cos(a);
  }
  out[5] = Math.sin(x * 1.7);
  out[11] = Math.cos(x * 1.7);
}

export function swellRow(w: WaveState, z: number, out: Float64Array) {
  for (let i = 0; i < 5; i++) {
    const b = SWELL_TERMS[i][1] * z;
    out[i] = Math.sin(b);
    out[i + 6] = Math.cos(b);
  }
  const b = z * 0.9 + Math.sin(z * 0.6 + w.time) * 2;
  out[5] = Math.sin(b);
  out[11] = Math.cos(b);
}

/** Soma das ondulações a partir das partes pré-calculadas. */
export function swellFrom(amp: number[], c: Float64Array, r: Float64Array): number {
  let s = 0;
  for (let i = 0; i < 5; i++) s += amp[i] * (c[i] * r[i + 6] + c[i + 6] * r[i]);
  return s;
}

/** Listras da espuma (mesmo valor de foamAt), a partir das partes pré-calculadas. */
export function streakFrom(c: Float64Array, r: Float64Array): number {
  return 0.5 + 0.5 * (c[5] * r[11] + c[11] * r[5]);
}
