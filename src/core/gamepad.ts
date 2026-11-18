// Controle (gamepad, layout "standard" do navegador) traduzido para as mesmas
// teclas do teclado. Assim o jogo inteiro (onda, menus, pausa, treino) funciona
// com o controle sem caminho próprio. O analógico esquerdo, além de virar setas,
// dá a direção contínua na face (curvas graduais que as setas não fazem).
//
//   Analógico esq. / D-pad  setas (linha na face, giro e flip no ar)
//   A                       Espaço (compressão, confirmar) e D (drop)
//   X                       W (bombear)
//   B Indy (Z) · Y Grab (X) · LB Method (C) · RB Stalefish (V) · LT Tail (A)
//   RT                      S (extensão e varial)
//   Start                   Esc (pausa)

export interface PadState {
  buttons: boolean[];
  axes: number[];
}

/** Botões do layout standard → códigos de tecla. */
export const PAD_BUTTONS: Record<number, string[]> = {
  0: ['Space', 'KeyD'],
  1: ['KeyZ'],
  2: ['KeyW'],
  3: ['KeyX'],
  4: ['KeyC'],
  5: ['KeyV'],
  6: ['KeyA'],
  7: ['KeyS'],
  9: ['Escape'],
  12: ['ArrowUp'],
  13: ['ArrowDown'],
  14: ['ArrowLeft'],
  15: ['ArrowRight'],
};

/** Rótulos dos botões para a ajuda e o HUD. */
export const PAD_LABELS: Record<string, string> = {
  Space: 'A', KeyD: 'A', KeyW: 'X', KeyZ: 'B', KeyX: 'Y', KeyC: 'LB', KeyV: 'RB', KeyA: 'LT', KeyS: 'RT', Escape: 'Start',
};

/** Zona morta do analógico. */
export const DEADZONE = 0.22;
/** O analógico vira seta acima deste valor e solta abaixo do segundo (histerese). */
const ON = 0.55;
const OFF = 0.35;

export interface PadFrame {
  press: string[];
  release: string[];
  /** Direção contínua do analógico (y + para cima), ou null dentro da zona morta. */
  aim: { x: number; y: number } | null;
}

export class GamepadBridge {
  private held = new Set<string>();
  private stick = { left: false, right: false, up: false, down: false };

  /** Traduz o estado atual do controle em teclas apertadas e soltas desde o último quadro. */
  update(pad: PadState | null): PadFrame {
    const want = new Set<string>();
    let aim: PadFrame['aim'] = null;
    if (pad) {
      for (const [i, codes] of Object.entries(PAD_BUTTONS)) if (pad.buttons[Number(i)]) for (const c of codes) want.add(c);
      const ax = pad.axes[0] ?? 0;
      const ay = -(pad.axes[1] ?? 0);
      const st = this.stick;
      st.right = ax > (st.right ? OFF : ON);
      st.left = ax < -(st.left ? OFF : ON);
      st.up = ay > (st.up ? OFF : ON);
      st.down = ay < -(st.down ? OFF : ON);
      if (st.right) want.add('ArrowRight');
      if (st.left) want.add('ArrowLeft');
      if (st.up) want.add('ArrowUp');
      if (st.down) want.add('ArrowDown');
      const m = Math.hypot(ax, ay);
      if (m > DEADZONE) {
        // Reescala para a borda da zona morta valer 0 e o máximo valer 1.
        const k = Math.min(1, (m - DEADZONE) / (1 - DEADZONE)) / m;
        aim = { x: ax * k, y: ay * k };
      }
    } else {
      this.stick = { left: false, right: false, up: false, down: false };
    }
    const press = [...want].filter((c) => !this.held.has(c));
    const release = [...this.held].filter((c) => !want.has(c));
    this.held = want;
    return { press, release, aim };
  }
}

/** Lê o primeiro controle conectado (ou null). */
export function readPad(): { state: PadState; pad: Gamepad } | null {
  const list = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of list) {
    if (p && p.connected) return { pad: p, state: { buttons: p.buttons.map((b) => b.pressed || b.value > 0.5), axes: [...p.axes] } };
  }
  return null;
}

/** Vibração curta (pouso, queda), quando o controle e o navegador permitem. */
export function rumble(pad: Gamepad | null, strength: number, ms = 160) {
  const act = (pad as (Gamepad & { vibrationActuator?: { playEffect?: (t: string, p: object) => Promise<unknown> } }) | null)?.vibrationActuator;
  if (!act?.playEffect) return;
  const s = Math.min(1, Math.max(0, strength));
  void act.playEffect('dual-rumble', { duration: ms, strongMagnitude: s, weakMagnitude: s * 0.6 }).catch(() => {});
}
