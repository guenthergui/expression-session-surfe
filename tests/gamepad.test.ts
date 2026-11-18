import { describe, expect, it } from 'vitest';
import { COMPRESS_OPEN, COMPRESS_STEEP, KeyboardControls } from '../src/core/controls';
import { GamepadBridge, type PadState } from '../src/core/gamepad';

// Controle: botões viram as mesmas teclas do teclado; o analógico dá a linha contínua.

const pad = (buttons: number[] = [], axes: [number, number] = [0, 0]): PadState => {
  const b: boolean[] = new Array(17).fill(false);
  for (const i of buttons) b[i] = true;
  return { buttons: b, axes: [...axes, 0, 0] };
};

describe('controle (gamepad)', () => {
  it('A aperta Espaço e D uma vez só, e solta quando o botão sobe', () => {
    const g = new GamepadBridge();
    expect(g.update(pad([0])).press.sort()).toEqual(['KeyD', 'Space']);
    expect(g.update(pad([0])).press).toEqual([]);
    expect(g.update(pad()).release.sort()).toEqual(['KeyD', 'Space']);
  });

  it('D-pad e analógico apertam a mesma seta sem soltar uma à outra', () => {
    const g = new GamepadBridge();
    expect(g.update(pad([12])).press).toEqual(['ArrowUp']);
    const f = g.update(pad([12], [0, -0.9]));
    expect(f.press).toEqual([]);
    expect(f.release).toEqual([]);
  });

  it('o analógico tem histerese: não fica ligando e desligando perto do limite', () => {
    const g = new GamepadBridge();
    expect(g.update(pad([], [0.6, 0])).press).toEqual(['ArrowRight']);
    expect(g.update(pad([], [0.45, 0])).release).toEqual([]);
    expect(g.update(pad([], [0.3, 0])).release).toEqual(['ArrowRight']);
  });

  it('zona morta: analógico parado não mexe a linha', () => {
    const g = new GamepadBridge();
    expect(g.update(pad([], [0.1, -0.1])).aim).toBeNull();
    const a = g.update(pad([], [1, 0])).aim!;
    expect(a.x).toBeCloseTo(1, 5);
  });

  it('desconectar solta tudo', () => {
    const g = new GamepadBridge();
    g.update(pad([0, 2], [0.9, 0]));
    expect(g.update(null).release.sort()).toEqual(['ArrowRight', 'KeyD', 'KeyW', 'Space']);
  });

  it('analógico dá curvas graduais e ângulo contínuo na compressão', () => {
    const k = new KeyboardControls();
    k.analog = { x: 0.7, y: 0.3 };
    const r = k.read(false);
    expect(r.aimX).toBeCloseTo(0.7, 6);
    expect(r.aimY).toBeCloseTo(0.3, 6);
    k.press('Space');
    k.analog = { x: 0, y: 1 };
    const up = k.read(false);
    expect(Math.atan2(up.aimY, up.aimX)).toBeCloseTo(COMPRESS_STEEP, 5);
    k.analog = { x: 0, y: -1 };
    const open = k.read(false);
    expect(Math.atan2(open.aimY, open.aimX)).toBeCloseTo(COMPRESS_OPEN, 5);
    k.analog = { x: 0, y: 0 };
    const mid = k.read(false);
    expect(mid.aimX).toBe(0);
    expect(mid.aimY).toBe(0);
  });
});
