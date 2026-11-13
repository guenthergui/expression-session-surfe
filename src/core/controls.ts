// Controle do surfista: transforma o estado do teclado em intenções.
// Não conhece o DOM nem a física; o App informa as teclas e a simulação lê a
// intenção a cada passo. As mesmas teclas mudam de sentido conforme o momento:
//
//   Na água (em pé)
//     ↑ ↓ ← →   apontam para onde ir na face: ↑ sobe para o lip, ↓ desce para a
//               base, → segue a onda, ← volta para a espuma (diagonais combinam)
//     W         bombear (transferência de peso que ganha velocidade)
//     Espaço    segurar comprime; soltar no lip faz o pop
//   Comprimindo (Espaço segurado)
//     ← →       carregam a rotação (backside / frontside)
//     ↑ ↓       ↑ deixa a subida mais vertical, ↓ abre a diagonal; sem
//               nenhum dos dois a linha fica travada onde estava
//   No ar
//     ← →       giro backside / frontside; a tecla oposta freia
//     ↑         joga o corpo para trás (flip); vale só se apertado depois do pop
//     ↓         prepara o pouso (estende as pernas, nivela e realinha)
//     Z X C V A grabs: Indy, Grab Air (segurado vira Japan), Method, Stalefish, Tail
//     S         extensão: sozinho Varial, com Z Christ, com X Superwoman, com Z+X Superman

export type GrabKey = 'indy' | 'mute' | 'method' | 'stalefish' | 'tail';

export interface SurferInput {
  /** Direção desejada na face: x ao longo da onda (+ segue), y na face (+ sobe para o lip). */
  aimX: number;
  aimY: number;
  pump: boolean;
  compress: boolean;
  /** −1 backside (←), +1 frontside (→). */
  spin: number;
  /** ↑ apertado depois da decolagem. */
  flip: boolean;
  /** ↓ no ar. */
  prep: boolean;
  grabs: Record<GrabKey, boolean>;
  /** S: extensão do corpo. */
  extend: boolean;
}

export function emptyInput(): SurferInput {
  return {
    aimX: 0,
    aimY: 0,
    pump: false,
    compress: false,
    spin: 0,
    flip: false,
    prep: false,
    grabs: { indy: false, mute: false, method: false, stalefish: false, tail: false },
    extend: false,
  };
}

/** Direção de subida com ↑ e com ↓ durante a compressão (rad). */
export const COMPRESS_STEEP = (80 * Math.PI) / 180;
export const COMPRESS_OPEN = (20 * Math.PI) / 180;

/** Códigos de tecla usados durante a onda. */
export const RIDE_CODES = [
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'KeyD',
  'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyA', 'KeyS',
] as const;

export const GRAB_CODES: Record<GrabKey, string> = { indy: 'KeyZ', mute: 'KeyX', method: 'KeyC', stalefish: 'KeyV', tail: 'KeyA' };

/** Rótulo de cada tecla, igual ao que aparece no HUD, na ajuda e no treino. */
export const KEY_LABELS: Record<string, string> = {
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: 'Espaço',
  KeyW: 'W', KeyD: 'D', KeyZ: 'Z', KeyX: 'X', KeyC: 'C', KeyV: 'V', KeyA: 'A', KeyS: 'S',
};

/**
 * Caminho inverso de KeyboardControls.read: a partir da intenção, as teclas que
 * produzem essa intenção. O treino usa isto para mostrar, no instante exato, o
 * que o piloto automático está apertando na demonstração.
 */
export function inputToKeys(inp: SurferInput, airborne: boolean): string[] {
  const keys: string[] = [];
  const dead = 0.3;
  if (inp.compress) keys.push('Space');
  if (inp.pump) keys.push('KeyW');
  if (airborne) {
    if (inp.spin > 0) keys.push('ArrowRight');
    if (inp.spin < 0) keys.push('ArrowLeft');
    if (inp.flip) keys.push('ArrowUp');
    if (inp.prep) keys.push('ArrowDown');
  } else if (inp.compress) {
    if (inp.spin > 0) keys.push('ArrowRight');
    if (inp.spin < 0) keys.push('ArrowLeft');
    // Na compressão: ↑ mais vertical, ↓ diagonal aberta, nada trava a linha.
    if (Math.hypot(inp.aimX, inp.aimY) > dead) {
      const deg = (Math.atan2(inp.aimY, inp.aimX) * 180) / Math.PI;
      if (deg > 62) keys.push('ArrowUp');
      else if (deg < 38) keys.push('ArrowDown');
    }
  } else if (Math.hypot(inp.aimX, inp.aimY) > dead) {
    // Em pé: a direção mais próxima entre as oito que as setas fazem.
    const oct = Math.round(Math.atan2(inp.aimY, inp.aimX) / (Math.PI / 4));
    const ax = Math.round(Math.cos((oct * Math.PI) / 4));
    const ay = Math.round(Math.sin((oct * Math.PI) / 4));
    if (ax > 0) keys.push('ArrowRight');
    if (ax < 0) keys.push('ArrowLeft');
    if (ay > 0) keys.push('ArrowUp');
    if (ay < 0) keys.push('ArrowDown');
  }
  for (const k of Object.keys(GRAB_CODES) as GrabKey[]) if (inp.grabs[k]) keys.push(GRAB_CODES[k]);
  if (inp.extend) keys.push('KeyS');
  return keys;
}

/** Legenda das teclas, mostrada no HUD e na ajuda. */
export const CONTROL_LEGEND = {
  agua: [
    ['↑ ↓ ← →', 'Direção na face (subir, descer, seguir, voltar)'],
    ['W', 'Bombear e ganhar velocidade'],
    ['Espaço', 'Segure para comprimir, solte no lip para decolar'],
    ['← → (comprimindo)', 'Carregar a rotação'],
    ['↑ ↓ (comprimindo)', 'Subida mais vertical / mais aberta'],
  ],
  ar: [
    ['← →', 'Girar backside / frontside'],
    ['↑', 'Flip para trás (com ← vira rodeo)'],
    ['↓', 'Preparar o pouso e realinhar'],
    ['Z', 'Indy'],
    ['X', 'Grab Air (segure para Japan)'],
    ['C', 'Method'],
    ['V', 'Stalefish'],
    ['A', 'Tail Grab'],
    ['S', 'Varial · com Z Christ · com X Superwoman · com Z+X Superman'],
  ],
} as const;

/**
 * Passa a intenção do piloto automático pelo mesmo caminho do teclado: vira
 * teclas (inputToKeys), as teclas são apertadas e soltas num KeyboardControls
 * e a física recebe a leitura dele. Assim a demonstração do treino só faz o
 * que o jogador consegue fazer com as setas, e as teclas na tela são
 * exatamente as que produziram o movimento.
 */
export class KeyReplay {
  private readonly k = new KeyboardControls();
  /** Teclas seguradas neste quadro. */
  keys: string[] = [];

  feed(inp: SurferInput, airborne: boolean): SurferInput {
    const next = inputToKeys(inp, airborne);
    for (const c of this.keys) if (!next.includes(c)) this.k.release(c);
    for (const c of next) this.k.press(c);
    this.keys = next;
    return this.k.read(airborne);
  }

  /** Na decolagem o ↑ é solto: o flip só vale com um toque novo depois do pop. */
  takeoff() {
    if (this.keys.includes('ArrowUp')) {
      this.k.release('ArrowUp');
      this.keys = this.keys.filter((c) => c !== 'ArrowUp');
    }
    this.k.markTakeoff();
  }
}

/** Estado do teclado durante a onda. */
export class KeyboardControls {
  private down = new Set<string>();
  /** Teclas apertadas depois da última decolagem (o ↑ do flip precisa ser um toque novo). */
  private fresh = new Set<string>();

  /**
   * Tecla apertada. A repetição automática do teclado (repeat) só vale para
   * uma tecla que já está registrada: uma tecla segurada desde antes da onda
   * (por exemplo o Espaço que confirmou a tela anterior) não entra sozinha.
   */
  press(code: string, repeat = false) {
    if (repeat && !this.down.has(code)) return;
    if (!this.down.has(code)) this.fresh.add(code);
    this.down.add(code);
  }

  release(code: string) {
    this.down.delete(code);
    this.fresh.delete(code);
  }

  clear() {
    this.down.clear();
    this.fresh.clear();
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  /** Chamado na decolagem: o que já estava segurado não conta como toque novo. */
  markTakeoff() {
    this.fresh.clear();
  }

  read(airborne: boolean): SurferInput {
    const d = (c: string) => this.down.has(c);
    const inp = emptyInput();
    const x = (d('ArrowRight') ? 1 : 0) - (d('ArrowLeft') ? 1 : 0);
    const y = (d('ArrowUp') ? 1 : 0) - (d('ArrowDown') ? 1 : 0);
    inp.compress = d('Space');
    inp.pump = d('KeyW');
    if (airborne) {
      inp.spin = x;
      inp.flip = d('ArrowUp') && this.fresh.has('ArrowUp');
      inp.prep = d('ArrowDown');
    } else if (inp.compress) {
      // ← → carregam o giro; ↑ deixa a subida mais vertical, ↓ abre a
      // diagonal; sem ↑ nem ↓ a linha fica travada (sim/waveRun.ts).
      inp.spin = x;
      if (y !== 0) {
        const a = y > 0 ? COMPRESS_STEEP : COMPRESS_OPEN;
        inp.aimX = Math.cos(a);
        inp.aimY = Math.sin(a);
      }
    } else {
      inp.aimX = x;
      inp.aimY = y;
    }
    for (const k of Object.keys(GRAB_CODES) as GrabKey[]) inp.grabs[k] = d(GRAB_CODES[k]);
    inp.extend = d('KeyS');
    return inp;
  }
}
