import { planFor, type PilotPlan } from '../sim/autopilot';
import { V_MIN_AIR } from '../sim/takeoff';
import { GRAB_CODES, KEY_LABELS } from './controls';
import { FAMILY_LABELS, MANEUVERS, TIER_LABELS, type Recognized } from './maneuvers';
import { CHALLENGE_BONUS, LIMITS, LOCKED_FACTOR, RIDE_AWAY_BONUS } from './scoring';
import type { Maneuver } from './types';

// Biblioteca de aprendizagem dos aéreos.
//
// Nada aqui é escrito à mão por manobra: cada guia sai da ficha do aéreo
// (data/maneuvers.ts), das teclas do jogo (core/controls.ts) e do plano do
// piloto automático (sim/autopilot.ts), o mesmo plano que faz a demonstração
// da tela de treino e que os testes usam para provar que o aéreo sai. Assim o
// tutorial não diverge dos comandos reais: se uma tecla mudar no jogo, muda
// aqui também.

export type GuidePhase = 'aproximacao' | 'posicao' | 'compressao' | 'pop' | 'ar' | 'pouso' | 'recuperacao';

export const PHASE_TITLES: Record<GuidePhase, string> = {
  aproximacao: 'Aproximação',
  posicao: 'Posição na onda',
  compressao: 'Compressão',
  pop: 'Pop no lip',
  ar: 'Manobra no ar',
  pouso: 'Pouso',
  recuperacao: 'Recuperação',
};

export interface GuideStep {
  phase: GuidePhase;
  /** Códigos de tecla (KeyboardEvent.code). */
  keys: string[];
  /** Ação das teclas: apertar, segurar, soltar ou tocar. */
  action: 'segure' | 'solte' | 'toque' | 'aponte';
  /** Explicação completa (iniciante). */
  text: string;
  /** Explicação curta (intermediário). */
  short: string;
}

export interface ManeuverGuide {
  id: string;
  name: string;
  category: string;
  tier: string;
  difficulty: number;
  difficultyLabel: string;
  /** 1 a 5. */
  stars: number;
  description: string;
  board: string;
  landing: string;
  /** Teclas usadas no ar (além de D, setas, W e Espaço, comuns a todos). */
  airKeys: string[];
  /** Condições de execução. */
  minSpeedKmh: number;
  approach: [number, number];
  approachLabel: string;
  idealMoment: string;
  steps: GuideStep[];
  errors: string[];
  /** Pontuação base e multiplicadores que valem para este aéreo. */
  baseScore: number;
  scoring: string[];
  /** Cena do lab que mostra a pose deste aéreo (npm run dev, ?lab). */
  labScene: string;
  /** Sons ligados ao aéreo (sintetizados em audio/Sfx.ts). */
  sounds: string[];
  tips: string[];
  unlockLevel: number;
  experimental: boolean;
  /** Ficha oficial em uma linha (a mesma da tela do desafio). */
  howTo: string;
}

export const key = (code: string): string => KEY_LABELS[code] ?? code;
const keys = (codes: string[]): string => codes.map(key).join(' + ');

export function difficultyLabel(d: number): string {
  return d < 25 ? 'Fácil' : d < 45 ? 'Médio' : d < 65 ? 'Difícil' : 'Muito difícil';
}

function approachLabel(a: [number, number]): string {
  if (a[0] >= 55) return 'quase vertical';
  if (a[1] <= 45) return 'diagonal aberta';
  if (a[1] <= 65) return 'diagonal';
  return 'diagonal ou vertical';
}

const LAB_SCENE: Record<string, string> = {
  'straight-air': 'straight', 'fs-air': 'fsair', 'bs-air': 'bsair', 'grab-air': 'grabair', 'indy-air': 'indy',
  'method-air': 'method', 'stalefish-air': 'stalefish', 'tail-grab': 'tail', 'japan-air': 'japan', '180-air': 'r180',
  'air-reverse': 'reverse', '360-air': 'r360', 'fs-360': 'fs360', 'bs-360': 'bs360', 'alley-oop': 'alley',
  'full-rotation': 'full', backflip: 'backflip', 'rodeo-flip': 'rodeo', 'christ-air': 'christ', superman: 'superman',
  superwoman: 'superwoman', 'varial-air': 'varial',
};

/** Teclas do ar na ordem em que entram, a partir do plano do piloto. */
function airParts(m: Maneuver, p: PilotPlan): { keys: string[]; action: GuideStep['action']; text: string; short: string }[] {
  const out: { keys: string[]; action: GuideStep['action']; text: string; short: string }[] = [];
  const spinKey = p.yaw > 0 ? 'ArrowRight' : 'ArrowLeft';
  const side = p.yaw > 0 ? 'frontside' : 'backside';
  if (p.flip) {
    out.push({
      keys: p.yaw ? ['ArrowUp', spinKey] : ['ArrowUp'],
      action: 'segure',
      text: p.yaw
        ? `Logo depois do pop, aperte ${key('ArrowUp')} e ${key(spinKey)} juntos: o corpo vai para trás e gira de lado (rodeo). Segure até a volta fechar.`
        : `Logo depois do pop, aperte ${key('ArrowUp')} para jogar cabeça e ombros para trás. Segure até a volta fechar.`,
      short: p.yaw ? `${key('ArrowUp')} + ${key(spinKey)} logo após o pop` : `${key('ArrowUp')} logo após o pop`,
    });
  } else if (p.peakOnly) {
    out.push({
      keys: [spinKey],
      action: 'toque',
      text: `Um toque curto em ${key(spinKey)}: a prancha abre uns 90° para o lado ${side} e volta. Não segure, senão vira meia volta.`,
      short: `toque curto em ${key(spinKey)}`,
    });
  } else if (p.yaw) {
    const deg = Math.abs(p.yaw);
    out.push({
      keys: [spinKey],
      action: 'segure',
      text: `O giro carregado na compressão continua no ar. Se estiver curto, segure ${key(spinKey)} até completar ${deg}° ${side}; a seta oposta freia se passar do ponto.`,
      short: `${key(spinKey)} até ${deg}° (oposta freia)`,
    });
  }
  const grabCode = p.grab ? GRAB_CODES[p.grab] : null;
  if (p.extension === 'varial') {
    out.push({ keys: ['KeyS'], action: 'toque', text: `Toque ${key('KeyS')} sem grab: os pés soltam e a prancha dá uma volta sozinha sob o corpo.`, short: `toque ${key('KeyS')}` });
  } else if (p.extension) {
    const hold = p.extension === 'superman' ? ['KeyZ', 'KeyX'] : grabCode ? [grabCode] : [];
    out.push({
      keys: [...hold, 'KeyS'],
      action: 'segure',
      text: `Segure ${keys(hold)} para pegar a prancha e depois ${key('KeyS')} para estender o corpo (${m.name}). Solte o ${key('KeyS')} cedo para os pés voltarem.`,
      short: `${keys(hold)}, depois ${key('KeyS')}`,
    });
  } else if (grabCode) {
    out.push({
      keys: [grabCode],
      action: 'segure',
      text: p.japan
        ? `Segure ${key(grabCode)} por mais de meio segundo: o Grab vira Japan (tweak para trás).`
        : p.grab === 'mute'
          ? `Aperte ${key(grabCode)} e solte em menos de meio segundo; segurado demais vira Japan.`
          : `Segure ${key(grabCode)} para o ${m.grab === 'tail' ? 'Tail Grab' : m.name.replace(' Air', '')}.`,
      short: p.japan ? `segure ${key(grabCode)} mais de 0,5 s` : `segure ${key(grabCode)}`,
    });
  }
  if (!out.length) out.push({ keys: [], action: 'aponte', text: 'Sem giro nem grab: deixe a prancha subir nivelada sob os pés e olhe para o ponto de pouso.', short: 'nada: prancha nivelada' });
  return out;
}

/** Guia de aprendizagem do aéreo, derivado da ficha, dos controles e do piloto. */
export function guideFor(m: Maneuver): ManeuverGuide {
  const p = planFor(m);
  const minKmh = Math.round(m.minSpeed * 3.6);
  const loadSpin = Math.abs(p.yaw) >= 140 && !p.peakOnly;
  const spinKey = p.yaw > 0 ? 'ArrowRight' : 'ArrowLeft';
  const vertical = m.approach[0] >= 55;
  const open = m.approach[1] <= 45;
  const air = airParts(m, p);
  const grabbing = !!p.grab || (!!p.extension && p.extension !== 'varial');

  const steps: GuideStep[] = [
    {
      phase: 'aproximacao',
      keys: ['KeyW', 'ArrowRight'],
      action: 'segure',
      text: `Depois do drop (${key('KeyD')}), siga a onda (${key('ArrowRight')}) bombeando (${key('KeyW')}) no meio da face até passar de ${minKmh} km/h.`,
      short: `${key('KeyW')} até ${minKmh} km/h`,
    },
    {
      phase: 'posicao',
      keys: open ? ['ArrowRight', 'ArrowUp'] : ['ArrowDown', 'ArrowUp'],
      action: 'aponte',
      text: open
        ? `Faça a cavada perto da base e suba em diagonal aberta (${key('ArrowRight')} + ${key('ArrowUp')}), com a linha ainda seguindo a onda.`
        : vertical
          ? `Desça até a base (${key('ArrowDown')}) e faça a cavada; suba a face quase na vertical (${key('ArrowUp')}).`
          : `Desça um pouco (${key('ArrowDown')}) e suba a face em diagonal (${key('ArrowUp')} + ${key('ArrowRight')}).`,
      short: `cavada e subida ${approachLabel(m.approach)}`,
    },
    {
      phase: 'compressao',
      keys: loadSpin ? ['Space', spinKey] : ['Space'],
      action: 'segure',
      text: loadSpin
        ? `Subindo, segure ${key('Space')} para comprimir e já segure ${key(spinKey)} para carregar o giro.`
        : `Subindo, segure ${key('Space')} para comprimir as pernas. O HUD mostra PRONTO quando dá para voar.`,
      short: loadSpin ? `segure ${key('Space')} + ${key(spinKey)}` : `segure ${key('Space')}`,
    },
    {
      phase: 'pop',
      keys: ['Space'],
      action: 'solte',
      text: `Solte ${key('Space')} logo abaixo do lip, ainda subindo. Cedo demais o pop sai fraco; longe do lip ou descendo, não decola.`,
      short: `solte ${key('Space')} no lip`,
    },
    ...air.map((a) => ({ phase: 'ar' as const, ...a })),
    {
      phase: 'pouso',
      keys: ['ArrowDown'],
      action: 'segure',
      text: `${grabbing ? 'Solte o grab e ' : ''}${p.flip ? 'abra o corpo: ' : ''}segure ${key('ArrowDown')} antes de tocar a água para estender as pernas e realinhar a prancha.`,
      short: `${grabbing ? 'solte o grab, ' : ''}${key('ArrowDown')} antes do toque`,
    },
    {
      phase: 'recuperacao',
      keys: ['ArrowRight'],
      action: 'aponte',
      text: `Siga surfando (${key('ArrowRight')}) por 1 segundo depois do pouso: vale +${Math.round(RIDE_AWAY_BONUS * 100)}% e já dá para emendar outro aéreo.`,
      short: `siga surfando 1 s (+${Math.round(RIDE_AWAY_BONUS * 100)}%)`,
    },
  ];

  const errors = [
    `Decolar abaixo de ${minKmh} km/h: o aéreo sai, mas a execução perde nota (mínimo para voar: ${Math.round(V_MIN_AIR * 3.6)} km/h).`,
    `Soltar ${key('Space')} longe do lip ou já descendo: o pop é recusado.`,
  ];
  if (p.yaw && !p.peakOnly) errors.push(`Soltar ${key(spinKey)} cedo: o giro não fecha e a prancha chega atravessada (queda).`);
  if (p.peakOnly) errors.push(`Segurar ${key(spinKey)}: o giro passa de 140° e vira outro aéreo.`);
  if (p.flip) errors.push('Flip incompleto: sem altura, a volta não fecha antes da água.');
  if (grabbing) errors.push('Segurar o grab no toque: o pouso fica instável.');
  if (p.grab === 'mute' && !p.japan && !p.extension) errors.push(`Segurar ${key('KeyX')} mais de meio segundo: vira Japan Air.`);
  if (p.extension && p.extension !== 'varial') errors.push(`Pés fora da prancha no toque (${key('KeyS')} segurado demais): queda.`);
  errors.push(`Esquecer o ${key('ArrowDown')}: pernas duras e impacto forte no pouso.`);

  const tips: string[] = [];
  if (vertical) tips.push('Quanto mais vertical a subida, mais alto o voo: desça bem antes da cavada.');
  if (open) tips.push('Saia baixo e longo pelo lip; o pouso é longo, na face.');
  if (loadSpin) tips.push('O giro começa na compressão: carregar a seta antes do pop deixa a rotação mais rápida.');
  if (Math.abs(p.yaw) >= 300) tips.push('Use a zona crítica (perto da quebra) para ganhar altura.');
  if (m.experimental) tips.push('Aéreo experimental: a primeira vez que pousar vale descoberta (×1,5).');
  if (m.control >= 0.7) tips.push('Pede muito controle: suba Controle aéreo e Equilíbrio na Evolução do surfista.');
  tips.push('Depois do pouso, emende outro aéreo: cada aéreo a mais na mesma onda soma no multiplicador de sequência.');

  const scoring = [
    `Base ${m.baseScore} pontos × dificuldade ×${(1 + m.difficulty / 100).toFixed(2).replace('.', ',')}`,
    `Desafio da onda: ×${String(CHALLENGE_BONUS).replace('.', ',')}`,
    `Saiu surfando: +${Math.round(RIDE_AWAY_BONUS * 100)}%`,
  ];
  if (m.experimental) scoring.push(`Primeira vez (descoberta): ×${String(LIMITS.novelty[1]).replace('.', ',')}`);

  return {
    id: m.id,
    name: m.name,
    category: FAMILY_LABELS[m.family],
    tier: TIER_LABELS[m.tier],
    difficulty: m.difficulty,
    difficultyLabel: difficultyLabel(m.difficulty),
    stars: Math.max(1, Math.min(5, Math.ceil(m.difficulty / 20))),
    description: m.body,
    board: m.board,
    landing: m.landing,
    airKeys: [...new Set(air.flatMap((a) => a.keys))],
    minSpeedKmh: minKmh,
    approach: m.approach,
    approachLabel: approachLabel(m.approach),
    idealMoment: open
      ? 'Na diagonal aberta pelo lip, perto da quebra, soltando o Espaço logo abaixo da crista.'
      : vertical
        ? 'Subindo quase na vertical, de preferência na zona crítica, soltando o Espaço logo abaixo do lip.'
        : 'Na subida em diagonal, com o HUD em PRONTO, soltando o Espaço logo abaixo do lip.',
    steps,
    errors,
    baseScore: m.baseScore,
    scoring,
    labScene: LAB_SCENE[m.id] ?? '',
    sounds: ['decolagem (pop)', 'pouso', 'spray da cavada'],
    tips,
    unlockLevel: m.unlockLevel,
    experimental: m.experimental,
    howTo: m.howTo,
  };
}

/** Catálogo completo, na ordem da ficha. */
export const GUIDES: ManeuverGuide[] = MANEUVERS.map(guideFor);

export function findGuide(id: string): ManeuverGuide | undefined {
  return GUIDES.find((g) => g.id === id);
}

/** Bônus que existem de verdade nas regras, para a tela de treino. */
export function bonusLines(m: Maneuver): string[] {
  const lines = [
    `Pousar o ${m.name} nesta onda: ×${String(CHALLENGE_BONUS).replace('.', ',')} (vale uma vez por onda)`,
    `Sair surfando depois do pouso: +${Math.round(RIDE_AWAY_BONUS * 100)}%`,
    `Mais aéreos na mesma onda: +15% cada, até ×${String(LIMITS.sequence[1]).replace('.', ',')}`,
    `Combo entre ondas sem cair: até ×${String(LIMITS.combo[1]).replace('.', ',')}`,
  ];
  if (m.experimental) lines.splice(1, 0, `Primeira vez que pousar (descoberta): ×${String(LIMITS.novelty[1]).replace('.', ',')}`);
  return lines;
}

/** Explica a regra de aéreos ainda bloqueados (para o modo de treino). */
export const LOCKED_NOTE = `Aéreos ainda não liberados pelo nível valem ×${String(LOCKED_FACTOR).replace('.', ',')} na bateria.`;

/**
 * Depois de um pouso que não foi o desafio: o que faltou, em uma frase, a
 * partir do que o jogo reconheceu. Retorna null quando o aéreo foi o desafio.
 */
export function challengeHint(rec: Recognized, m: Maneuver): string | null {
  if (rec.ids.includes(m.id)) return null;
  const p = planFor(m);
  const spinKey = p.yaw > 0 ? 'ArrowRight' : 'ArrowLeft';
  const recFlip = rec.primary.axis === 'flip' || rec.primary.axis === 'rodeo';
  if (p.flip && !recFlip) return `Faltou o flip: ${key('ArrowUp')} logo depois do pop${p.yaw ? ` com ${key(spinKey)}` : ''}`;
  if (!p.flip && recFlip) return `Não precisa de flip: o ${m.name} ${p.yaw ? 'é giro' : 'fica nivelado'}`;
  if (p.yaw && !p.peakOnly && !p.flip) {
    const want = Math.abs(p.yaw);
    const sideOk = rec.direction === 'nenhuma' || (rec.direction === 'frontside') === p.yaw > 0 || m.direction === 'nenhuma';
    if (!sideOk) return `Giro para o lado errado: o ${m.name} gira ${p.yaw > 0 ? 'frontside' : 'backside'} (${key(spinKey)})`;
    if (rec.rotation < want - 90) return `Faltou giro: ${rec.rotation}° de ${want}°. Segure ${key(spinKey)} desde a compressão`;
    if (rec.rotation > want + 90) return `Girou demais: ${rec.rotation}° (o desafio pede ${want}°)`;
    const [a0, a1] = m.approach;
    return `Ângulo de subida: o ${m.name} pede subida ${approachLabel(m.approach)} (${a0}° a ${a1}°)`;
  }
  if (p.peakOnly) {
    if (rec.rotation >= 140) return `Giro demais: no ${m.name} é só um toque em ${key(spinKey)}`;
    return `Faltou abrir a prancha: um toque em ${key(spinKey)} no ar`;
  }
  if (p.extension === 'varial') return `Faltou o varial: toque ${key('KeyS')} sem grab`;
  if (p.extension) return `Faltou a extensão: segure o grab e depois ${key('KeyS')}`;
  if (p.japan) return `Para o Japan, segure ${key('KeyX')} por mais de meio segundo`;
  if (p.grab) {
    const code = GRAB_CODES[p.grab];
    if (rec.primary.grab && rec.primary.grab !== m.grab) return `Grab errado: o ${m.name} usa ${key(code)}`;
    return `Faltou o grab: segure ${key(code)} no ar`;
  }
  if (rec.rotation >= 40 || rec.primary.grab) return `O ${m.name} é reto: sem giro nem grab`;
  return null;
}

/** Atalho para a interface: guia do aéreo pelo id (lança se não existir). */
export function guideById(id: string): ManeuverGuide {
  const g = findGuide(id);
  if (!g) throw new Error(`Guia do aéreo ${id} não existe`);
  return g;
}

