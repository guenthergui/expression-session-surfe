import { clamp } from '../core/rng';
import type { Outcome } from '../core/types';
import { FAKIE_MIN, type AirRecord } from './airPhysics';

// Aterrissagem: no toque, compara o que o corpo fez com o que a água aceita.
//   - alinhamento: a prancha precisa chegar na direção do movimento (ou de
//     costas, depois de um giro de pelo menos 140°, completando o giro na água);
//   - flip: precisa ter fechado a volta;
//   - mãos e pés: grab solto e pés de volta na prancha;
//   - pernas: preparar o pouso (↓) deixa os joelhos prontos para absorver;
//   - local: na face é o ideal; atrás do lip é queda; na base o impacto é maior;
//   - impacto: velocidade vertical alta exige mais das pernas.
// A tolerância cresce com o equilíbrio e com a fase de pouso do equipamento.
// O resultado define a velocidade que sobra e o tempo de recuperação.

export interface LandingParams {
  equilibrio: number;
  equipLanding: number;
}

export interface LandingResult {
  outcome: Outcome;
  /** Qualidade de 0 a 1. */
  quality: number;
  /** Erro de giro até a orientação de pouso (graus). */
  yawError: number;
  flipError: number;
  /** Pousou de costas e completa o giro na água. */
  fakie: boolean;
  /** Fração da velocidade que sobra. */
  speedKeep: number;
  /** Tempo até poder comprimir de novo (s). */
  recovery: number;
  /** Força do impacto, de 0 a 1 (para a absorção dos joelhos). */
  impact: number;
  /** Motivo principal, para mostrar ao jogador. */
  note: string;
}

function part(err: number, tol: number): number {
  if (err <= tol * 0.45) return 1;
  if (err <= tol) return 1 - 0.18 * ((err - tol * 0.45) / (tol * 0.55));
  if (err <= tol * 2.2) return 0.82 - 0.55 * ((err - tol) / (tol * 1.2));
  return 0;
}

export function evaluateLanding(r: AirRecord, p: LandingParams, noise = 0): LandingResult {
  const tol = clamp(0.82 + p.equilibrio / 260 + p.equipLanding * 0.025, 0.65, 1.35);
  const rotated = Math.abs(r.yaw) >= FAKIE_MIN || r.maxYaw >= FAKIE_MIN;
  const step = rotated ? 180 : 360;
  const nearest = Math.round(r.yaw / step) * step;
  const yawError = Math.abs(r.yaw - nearest);
  const fakie = Math.abs(((nearest % 360) + 360) % 360 - 180) < 1;
  const flipNearest = Math.round(r.flip / 360) * 360;
  const flipError = Math.abs(r.flip - flipNearest);
  const impact = clamp((-r.vyTouch - 3) / 5, 0, 1);

  let q = Math.min(part(yawError, 34 * tol), part(flipError, 30 * tol));
  let note = q >= 0.82 ? 'Prancha alinhada' : yawError > flipError ? 'Giro desalinhado' : 'Flip incompleto';
  const notes: [number, string][] = [];
  if (r.grabAtTouch > 0.3) notes.push([0.32 * r.grabAtTouch, 'Grab segurado no toque']);
  if (r.prepAtTouch < 0.25) notes.push([0.1 + 0.06 * impact, 'Pernas duras no pouso']);
  const sRatio = r.sTouch / r.faceWidth;
  if (sRatio > 0.85) notes.push([0.12 + 0.1 * impact, 'Pouso na base, impacto forte']);
  if (impact > 0.6) notes.push([(impact - 0.6) * 0.3 * (1 - r.prepAtTouch * 0.6), 'Impacto alto']);
  if (fakie) notes.push([0.04, '']);
  // Pouco controle no ar (giro indo e voltando) também tira do pouso.
  if (r.reversals > 1) notes.push([0.04 * Math.min(4, r.reversals - 1), 'Corpo sem controle no ar']);
  for (const [loss, why] of notes) {
    q -= loss;
    if (why && loss >= 0.08 && q < 0.82) note = why;
  }
  if (q > 0) q = clamp(q + noise, 0, 1);

  let outcome: Outcome;
  if (r.landedBehind) {
    outcome = 'queda';
    note = 'Pousou atrás do lip';
    q = 0;
  } else if (r.feetOffAtTouch > 0.25) {
    outcome = 'queda';
    note = 'Pés fora da prancha no toque';
    q = 0;
  } else if (q <= 0) {
    outcome = 'queda';
    q = 0;
  } else {
    outcome = q >= 0.84 ? 'limpa' : q >= 0.6 ? 'concluida' : q >= 0.32 ? 'instavel' : 'queda';
  }
  const keep = outcome === 'limpa' ? 0.93 : outcome === 'concluida' ? 0.84 : outcome === 'instavel' ? 0.68 : 0;
  const recovery = outcome === 'limpa' ? 0.45 : outcome === 'concluida' ? 0.7 : 1.15;
  return {
    outcome,
    quality: q,
    yawError,
    flipError,
    fakie,
    speedKeep: keep * (fakie ? 0.9 : 1),
    recovery,
    impact,
    note: outcome === 'limpa' ? 'Pouso limpo' : note,
  };
}
