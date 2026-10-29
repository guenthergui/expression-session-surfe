import type { CommandKey, CommandStep, Judgement, StepResult } from './types';

// Avaliação dos comandos por tempo e sequência, em milissegundos e sem
// depender da renderização, para poder ser testada.
//
//   Perfect: dentro da janela perfeita (55 ms a 100 ms, cresce com o controle aéreo)
//   Good:    até 130 ms do tempo ideal
//   Late:    tecla certa até 260 ms fora do tempo (cedo ou tarde)
//   Miss:    tecla errada, ou nenhuma tecla até a janela fechar

export const GOOD_WINDOW_MS = 130;
export const LATE_WINDOW_MS = 260;

export function perfectWindow(controleAereo: number): number {
  return 55 + controleAereo * 0.45;
}

export const JUDGEMENT_VALUE: Record<Judgement, number> = {
  perfect: 1,
  good: 0.75,
  late: 0.4,
  miss: 0,
};

export const JUDGEMENT_LABEL: Record<Judgement, string> = {
  perfect: 'Perfect',
  good: 'Good',
  late: 'Late',
  miss: 'Miss',
};

export interface PressResult {
  index: number;
  judgement: Judgement;
  /** Diferença em ms entre o toque e o tempo ideal (negativo = cedo). */
  offsetMs: number;
}

export class CommandTrack {
  readonly results: (Judgement | null)[];
  readonly offsets: (number | null)[];
  private cursor = 0;

  constructor(
    readonly steps: CommandStep[],
    /** Momento (ms) em que acontece a decolagem. */
    readonly startMs: number,
    readonly perfectMs: number,
  ) {
    this.results = steps.map(() => null);
    this.offsets = steps.map(() => null);
  }

  targetMs(i: number): number {
    return this.startMs + this.steps[i].time * 1000;
  }

  get done(): boolean {
    return this.cursor >= this.steps.length;
  }

  get nextIndex(): number {
    return this.cursor;
  }

  /** Avalia um toque. Retorna null quando o toque é cedo demais e é ignorado. */
  press(key: CommandKey, nowMs: number): PressResult | null {
    if (this.done) return null;
    const i = this.cursor;
    const dt = nowMs - this.targetMs(i);
    if (dt < -LATE_WINDOW_MS) return null;
    const abs = Math.abs(dt);
    let judgement: Judgement;
    if (key !== this.steps[i].key) judgement = 'miss';
    else if (abs <= this.perfectMs) judgement = 'perfect';
    else if (abs <= GOOD_WINDOW_MS) judgement = 'good';
    else judgement = 'late';
    this.results[i] = judgement;
    this.offsets[i] = dt;
    this.cursor++;
    return { index: i, judgement, offsetMs: dt };
  }

  /**
   * Registra o primeiro comando (a decolagem) já avaliado por fora: ela é medida
   * pela posição no lip, não por um tempo fixo, e a trilha começa nesse instante.
   */
  presetFirst(judgement: Judgement, offsetMs: number): void {
    if (this.cursor !== 0) return;
    this.results[0] = judgement;
    this.offsets[0] = offsetMs;
    this.cursor = 1;
  }

  /** Marca como Miss os comandos cuja janela já fechou. */
  update(nowMs: number): number[] {
    const missed: number[] = [];
    while (!this.done && nowMs - this.targetMs(this.cursor) > LATE_WINDOW_MS) {
      this.results[this.cursor] = 'miss';
      missed.push(this.cursor);
      this.cursor++;
    }
    return missed;
  }

  /** Fecha a trilha marcando como Miss tudo o que ficou sem resposta. */
  finish(): void {
    while (!this.done) {
      this.results[this.cursor] = 'miss';
      this.cursor++;
    }
  }

  stepResults(): StepResult[] {
    return this.steps.map((step, i) => ({ step, judgement: this.results[i] ?? 'miss' }));
  }
}

export interface ExecutionSummary {
  /** Média dos valores dos comandos, de 0 a 1. */
  quality: number;
  essentialFailed: boolean;
  grabMissed: boolean;
  perfects: number;
  /** Qualidade do comando de pouso, de 0 a 1. */
  landing: number;
  /** Qualidade da decolagem, de 0 a 1. */
  takeoff: number;
}

export function summarizeExecution(results: StepResult[]): ExecutionSummary {
  const quality = results.reduce((a, r) => a + JUDGEMENT_VALUE[r.judgement], 0) / Math.max(1, results.length);
  const of = (phase: string) => results.find((r) => r.step.phase === phase);
  const land = results[results.length - 1];
  return {
    quality,
    essentialFailed: results.some((r) => r.step.essential && r.judgement === 'miss'),
    grabMissed: results.some((r) => r.step.phase === 'grab' && r.judgement === 'miss'),
    perfects: results.filter((r) => r.judgement === 'perfect').length,
    landing: land ? JUDGEMENT_VALUE[land.judgement] : 0,
    takeoff: of('impulsao') ? JUDGEMENT_VALUE[of('impulsao')!.judgement] : 0,
  };
}
