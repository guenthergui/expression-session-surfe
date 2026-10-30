import type { GrabId } from '../core/types';
import type { PoseName } from './poses';

// Dados de biomecânica de cada parte dos aéreos: onde a mão segura cada grab,
// qual pose o corpo assume e como os ombros preparam o giro. A pose em cada
// instante sai do estado físico do voo (anim/airPose.ts), não de uma
// animação pronta; estes dados dão a identidade de cada movimento.
//
// Sentido do giro na base do jogo (de frente para a onda, pé direito à frente):
//   - frontside: o peito lidera, abrindo para o bico (para a direita na tela);
//   - backside: as costas lideram, o surfista gira "cego" olhando por cima do
//     ombro de trás (para a esquerda na tela).

/** Onde a mão segura cada grab, no referencial de base da prancha. */
export interface GrabContact {
  hand: 'frente' | 'tras';
  /** x relativo ao ponto médio entre os pés (m). */
  dx: number;
  /** Borda: +1 dedos, −1 calcanhares, 0 na ponta (rabeta). */
  rail: 1 | -1 | 0;
}

export const GRAB_CONTACT: Record<GrabId, GrabContact> = {
  // Entre os pés, mais perto do pé de trás.
  indy: { hand: 'tras', dx: -0.06, rail: 1 },
  // Entre os pés, mais perto do pé da frente (a mão da frente cruza o corpo).
  mute: { hand: 'frente', dx: 0.07, rail: 1 },
  // Mute puxado: a mão vai um pouco mais para o bico.
  japan: { hand: 'frente', dx: 0.12, rail: 1 },
  // Por trás da perna da frente, na borda dos calcanhares.
  method: { hand: 'frente', dx: 0.06, rail: -1 },
  // Por trás da perna de trás, perto da rabeta.
  stalefish: { hand: 'tras', dx: -0.22, rail: -1 },
  // Na ponta da rabeta.
  tail: { hand: 'tras', dx: -0.55, rail: 0 },
};

/** Superman: as duas mãos nas bordas, perto do bico. */
export const SUPERMAN_CONTACTS: GrabContact[] = [
  { hand: 'frente', dx: 0.5, rail: 1 },
  { hand: 'tras', dx: 0.5, rail: -1 },
];

export const GRAB_POSE: Record<GrabId, PoseName> = {
  indy: 'grabIndy',
  mute: 'grabMute',
  japan: 'grabJapan',
  method: 'grabMethod',
  stalefish: 'grabStalefish',
  tail: 'grabTail',
};

/** Preparação do giro na compressão: quanto os ombros enrolam ao contrário (graus) por intensidade da carga. */
export const WINDUP_DEG = 40;
/** Os ombros adiantam o quadril em tanto tempo de giro (s); o quadril adianta a prancha. */
export const SHOULDER_LEAD = 0.09;
export const HIP_LEAD = 0.04;
