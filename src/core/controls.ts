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
//     ↑ ↓       continuam ajustando o ângulo de ataque
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

/** Códigos de tecla usados durante a onda. */
export const RIDE_CODES = [
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'KeyD',
  'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyA', 'KeyS',
] as const;

const GRAB_CODES: Record<GrabKey, string> = { indy: 'KeyZ', mute: 'KeyX', method: 'KeyC', stalefish: 'KeyV', tail: 'KeyA' };

/** Legenda das teclas, mostrada no HUD e na ajuda. */
export const CONTROL_LEGEND = {
  agua: [
    ['↑ ↓ ← →', 'Direção na face (subir, descer, seguir, voltar)'],
    ['W', 'Bombear e ganhar velocidade'],
    ['Espaço', 'Segure para comprimir, solte no lip para decolar'],
    ['← → (comprimindo)', 'Carregar a rotação'],
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

/** Estado do teclado durante a onda. */
export class KeyboardControls {
  private down = new Set<string>();
  /** Teclas apertadas depois da última decolagem (o ↑ do flip precisa ser um toque novo). */
  private fresh = new Set<string>();

  press(code: string) {
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
      inp.spin = x;
      inp.aimY = y;
      inp.aimX = y !== 0 ? 1 : 0;
    } else {
      inp.aimX = x;
      inp.aimY = y;
    }
    for (const k of Object.keys(GRAB_CODES) as GrabKey[]) inp.grabs[k] = d(GRAB_CODES[k]);
    inp.extend = d('KeyS');
    return inp;
  }
}
