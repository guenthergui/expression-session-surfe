import { findLocation } from '../data/locations';
import { WAVES_PER_HEAT } from '../core/heat';
import { GUIDES, LOCKED_NOTE, PHASE_TITLES, bonusLines, key, type GuidePhase, type GuideStep, type ManeuverGuide } from '../core/maneuverGuide';
import { TIER_LABELS } from '../core/maneuvers';
import { TUTORIAL_LEVELS, type TutorialLevel } from '../core/save';
import type { Maneuver } from '../core/types';
import { el, esc } from './dom';

// Tela de treino antes da onda e tela de escolha do modo de treino.
//
// A demonstração 3D atrás desta tela é uma onda de verdade surfada pelo piloto
// automático (sim/autopilot.ts) com as mesmas teclas do jogador. As teclas
// que aparecem no canto saem da intenção que o piloto manda para a física
// (core/controls.ts, inputToKeys), então mostram o instante exato de cada
// comando. Os textos vêm de core/maneuverGuide.ts.

export const LEVEL_LABELS: Record<TutorialLevel, string> = {
  iniciante: 'Iniciante',
  intermediario: 'Intermediário',
  experiente: 'Experiente',
};

const LEVEL_HINTS: Record<TutorialLevel, string> = {
  iniciante: 'demonstração com todos os passos, erros comuns e dicas',
  intermediario: 'demonstração com passos curtos',
  experiente: 'pula o treino e mostra só a ficha do desafio',
};

const kbd = (code: string) => `<span class="kbd">${esc(key(code))}</span>`;

/** Dificuldade em 5 marcas (CSS, sem emoji). */
const stars = (n: number) => `<span class="stars" aria-label="dificuldade ${n} de 5">${Array.from({ length: 5 }, (_, i) => `<i class="pip ${i < n ? 'on' : ''}"></i>`).join('')}</span>`;

/** Desenho simples do aéreo: o arco do giro ou do flip, com o grab marcado. */
export function maneuverGlyph(m: Maneuver): string {
  const deg = m.id === 'fs-air' || m.id === 'bs-air' ? 90 : m.rotation;
  const flip = m.axis === 'flip' || m.axis === 'rodeo';
  const sweep = Math.min(359, deg);
  const r = 26;
  const cx = 34;
  const cy = 34;
  const ccw = m.direction === 'backside';
  const a0 = -Math.PI / 2;
  const a1 = a0 + ((ccw ? -1 : 1) * sweep * Math.PI) / 180;
  const x0 = cx + r * Math.cos(a0);
  const y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  const arc = sweep > 0
    ? `<path d="M${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 ${sweep > 180 ? 1 : 0} ${ccw ? 0 : 1} ${x1.toFixed(1)},${y1.toFixed(1)}" fill="none" stroke="${flip ? 'var(--pink)' : 'var(--aqua)'}" stroke-width="5" stroke-linecap="round"/>
       <circle cx="${x1.toFixed(1)}" cy="${y1.toFixed(1)}" r="5" fill="${flip ? 'var(--pink)' : 'var(--aqua)'}"/>`
    : `<path d="M10,46 Q34,6 58,46" fill="none" stroke="var(--accent)" stroke-width="5" stroke-linecap="round"/>`;
  const label = flip ? (m.axis === 'rodeo' ? 'rodeo' : 'flip') : sweep ? `${deg}°` : 'reto';
  const grab = m.grab || m.extension ? `<rect x="22" y="56" width="24" height="7" rx="3.5" fill="var(--pink)"/>` : '';
  return `<svg class="glyph" viewBox="0 0 68 68" aria-hidden="true">${arc}${grab}<text x="34" y="39" text-anchor="middle" font-size="13" font-weight="800" fill="var(--ink)">${label}</text></svg>`;
}

function stepRow(s: GuideStep, i: number, level: TutorialLevel): string {
  const keys = s.keys.length ? s.keys.map(kbd).join(' ') : '<span class="dim">—</span>';
  const verb = s.action === 'segure' ? 'segure' : s.action === 'solte' ? 'solte' : s.action === 'toque' ? 'toque' : 'aponte';
  return `<li class="step" data-step="${s.phase}">
      <span class="step-n">${i + 1}</span>
      <div><div class="step-title">${PHASE_TITLES[s.phase]} <span class="step-keys"><span class="dim">${verb}</span> ${keys}</span></div>
      <div class="step-text">${esc(level === 'iniciante' ? s.text : s.short)}</div></div>
    </li>`;
}

export interface TrainingContext {
  maneuver: Maneuver;
  guide: ManeuverGuide;
  level: TutorialLevel;
  /** Modo de treino (fora da bateria). */
  practice: boolean;
  locationId: string;
  /** Número da onda na bateria (1 a 5); null no modo de treino. */
  wave: number | null;
  respinAvailable: boolean;
  slow: boolean;
  skipTrained: boolean;
  locked: boolean;
}

export function trainingScreen(c: TrainingContext): HTMLElement {
  const g = c.guide;
  const m = c.maneuver;
  const full = c.level === 'iniciante';
  const where = c.practice
    ? `Modo treino · ${esc(findLocation(c.locationId).name)}`
    : `${esc(findLocation(c.locationId).name)} · Onda ${c.wave} de ${WAVES_PER_HEAT}`;
  return el(`
    <div class="training">
      <div class="panel training-panel">
        <div class="tag">${where}</div>
        <div class="training-head">
          ${maneuverGlyph(m)}
          <div>
            <div class="eyebrow">${c.practice ? 'Aéreo para treinar' : 'Desafio da onda'}</div>
            <div class="maneuver-name">${esc(g.name)}</div>
            <div class="training-meta">${esc([...new Set([TIER_LABELS[m.tier], g.category])].join(' · '))} · ${stars(g.stars)} ${esc(g.difficultyLabel)} · base ${g.baseScore}</div>
          </div>
        </div>
        ${c.practice
          ? `<div class="training-rule">Treino livre: nada conta para a bateria, o nível ou os recordes.${c.locked ? ` <span class="warn">${esc(LOCKED_NOTE)}</span>` : ''}</div>`
          : `<div class="training-rule"><b>1 aéreo exigido nesta onda.</b> Pouse o ${esc(g.name)} em qualquer momento da onda para cumprir o desafio. Outros aéreos também pontuam.</div>`}
        ${full ? `<div class="training-desc">${esc(g.description)} ${esc(g.board)}</div>` : ''}
        <div class="training-when">
          <span class="chip">≥ ${g.minSpeedKmh} km/h</span>
          <span class="chip">subida ${esc(g.approachLabel)} (${g.approach[0]}°–${g.approach[1]}°)</span>
          <span class="chip">no ar: ${g.airKeys.length ? g.airKeys.map((k) => esc(key(k))).join(' ') : 'nada'} · ↓ pouso</span>
        </div>
        <div class="eyebrow">Passo a passo · siga a demonstração</div>
        <ol class="steps">${g.steps.map((s, i) => stepRow(s, i, c.level)).join('')}</ol>
        ${full ? `<div class="training-when-text"><b>Quando:</b> ${esc(g.idealMoment)}</div>` : ''}
        <details ${full ? 'open' : ''}>
          <summary class="eyebrow">Bônus disponíveis</summary>
          <ul class="training-list">${bonusLines(m).map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
        </details>
        ${full ? `<details>
          <summary class="eyebrow">Erros comuns</summary>
          <ul class="training-list">${g.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>
        </details>
        <details>
          <summary class="eyebrow">Dicas</summary>
          <ul class="training-list">${g.tips.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>
        </details>` : ''}
        <div class="training-levels">
          <span class="muted">Treino:</span>
          ${TUTORIAL_LEVELS.map((l) => `<button class="btn small secondary ${l === c.level ? 'selected' : ''}" aria-pressed="${l === c.level}" data-action="level" data-level="${l}" title="${esc(LEVEL_HINTS[l])}">${LEVEL_LABELS[l]}</button>`).join('')}
        </div>
        <label class="check"><input type="checkbox" data-input="skip" ${c.skipTrained ? 'checked' : ''}/> Pular o treino de aéreos que eu já treinei</label>
        <div class="actions training-actions">
          <div class="training-small">
            ${c.practice ? '<button class="btn small secondary" data-action="back">Outro aéreo</button>' : `<button class="btn small secondary" data-action="respin" ${c.respinAvailable ? '' : 'disabled'} title="Um giro extra por bateria">${c.respinAvailable ? 'Girar de novo' : 'Giro extra usado'}</button>`}
            <button class="btn small secondary" data-action="replay">Rever <span class="kbd">R</span></button>
            <button class="btn small secondary ${c.slow ? 'selected' : ''}" data-action="slow" aria-pressed="${c.slow}">Câmera lenta <span class="kbd">L</span></button>
          </div>
          <button class="btn training-go" data-action="go">Estou pronto — Surfar <span class="kbd">Enter</span></button>
        </div>
      </div>
      <div class="training-badge"><b>DEMONSTRAÇÃO</b> · a sua onda ainda não começou · nada aqui conta pontos</div>
      <div class="panel key-overlay" aria-live="polite">
        <div class="key-phase" data-tr="phase">Remando</div>
        <div class="key-row" data-tr="keys"></div>
        <div class="key-note muted" data-tr="note"></div>
      </div>
    </div>`);
}

export interface TrainingFrame {
  phase: GuidePhase | null;
  caption: string;
  keys: string[];
  /** Teclas que acabaram de ser soltas (o pop). */
  released: string[];
  note: string;
}

/** Atualiza a tela de treino a cada quadro da demonstração. */
export function updateTraining(root: HTMLElement, f: TrainingFrame, cache: { sig?: string; phase?: GuidePhase | null }) {
  const sig = `${f.phase}|${f.caption}|${f.keys.join(',')}|${f.released.join(',')}|${f.note}`;
  if (cache.sig === sig) return;
  cache.sig = sig;
  let first: HTMLElement | null = null;
  root.querySelectorAll<HTMLElement>('[data-step]').forEach((n) => {
    const on = n.dataset.step === f.phase;
    n.classList.toggle('active', on);
    if (on && !first) first = n;
  });
  // Quando o passo muda, ele vem para a vista no painel (sem brigar com a rolagem do jogador entre um passo e outro).
  if (cache.phase !== f.phase) (first as HTMLElement | null)?.scrollIntoView({ block: 'nearest' });
  cache.phase = f.phase;
  root.querySelector<HTMLElement>('[data-tr=phase]')!.textContent = f.caption;
  const keys = f.keys.map((k) => `<span class="key big-key">${esc(key(k))}</span>`);
  const rel = f.released.map((k) => `<span class="key big-key released">${esc(key(k))}<small>solte</small></span>`);
  root.querySelector<HTMLElement>('[data-tr=keys]')!.innerHTML = [...keys, ...rel].join('') || '<span class="dim">sem teclas</span>';
  root.querySelector<HTMLElement>('[data-tr=note]')!.textContent = f.note;
}

/** Escolha do aéreo no modo de treino. */
export function practiceScreen(unlocked: string[], trained: string[], level: number): HTMLElement {
  const groups = (['basico', 'rotacao', 'avancado'] as const).map((tier) => {
    const cards = GUIDES.filter((g) => g.tier === TIER_LABELS[tier]).map((g) => {
      const open = unlocked.includes(g.id);
      return `<div class="card practice-card ${open ? '' : 'locked'}" ${open ? `data-action="pick" data-id="${g.id}" tabindex="0" role="button"` : ''}>
          <div class="title">${esc(g.name)} ${trained.includes(g.id) ? '<span class="good" title="Já treinado">✓</span>' : ''}</div>
          <div class="sub">${stars(g.stars)} ${esc(g.difficultyLabel)} · ${esc(g.category)}</div>
          <div class="sub">${open ? `no ar: ${g.airKeys.length ? g.airKeys.map((k) => kbd(k)).join(' ') : 'sem teclas'}` : `<span class="warn">libera no nível ${g.unlockLevel}</span> (você está no ${level})`}</div>
        </div>`;
    }).join('');
    return `<div class="panel section"><h3>${TIER_LABELS[tier]}</h3><div class="practice-grid">${cards}</div></div>`;
  }).join('');
  return el(`
    <div class="screen page">
      <div class="header">
        <div><h1>Treinar aéreos</h1><div class="muted" style="margin-top:6px">Escolha um aéreo, veja a demonstração e surfe quantas ondas quiser. Nada conta para a bateria, o nível ou os recordes.</div></div>
        <div class="actions"><button class="btn secondary" data-action="back">Menu</button></div>
      </div>
      <div class="page-body practice-body">${groups}</div>
    </div>`);
}
