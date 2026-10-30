import { ATTRIBUTE_LABELS } from '../data/attributes';
import { findBoard, findFin } from '../data/equipment';
import { WIND_LABELS, findLocation } from '../data/locations';
import { sectionLabel } from '../core/conditions';
import { WAVES_PER_HEAT, type HeatSession, type HeatSummary, type WaveResult } from '../core/heat';
import { FAMILY_LABELS, GRAB_LABELS, KEY_SYMBOLS, directionLabel, findManeuver } from '../core/maneuvers';
import type { ChanceBreakdown } from '../core/performance';
import { xpToNext } from '../core/progression';
import type { HeatRewards } from '../core/rewards';
import { JUDGEMENT_LABEL } from '../core/timing';
import type { AttributeKey, Conditions, Maneuver, Outcome, Phase } from '../core/types';
import { state } from '../game/state';
import { el, esc, pct, signed } from './dom';

export const PHASE_LABELS: Record<Phase, string> = { impulsao: 'Decolagem', rotacao: 'Rotação', grab: 'Grab', aterrissagem: 'Pouso' };

export const OUTCOME_TEXT: Record<Outcome, [string, string]> = {
  limpa: ['POUSO LIMPO!', 'good'],
  concluida: ['MANOBRA CONCLUÍDA', 'good'],
  instavel: ['POUSO INSTÁVEL', 'warn'],
  queda: ['QUEDA!', 'bad'],
};

export function conditionChips(c: Conditions, locationId: string): string {
  const loc = findLocation(locationId);
  return [
    `Onda ${c.height.toFixed(2).replace('.', ',')} m`,
    `Potência ${c.power}`,
    loc.windAffects ? `Vento ${WIND_LABELS[c.windType]} ${c.windSpeed} km/h` : 'Sem vento',
    `Seção ${c.sectionQuality} · ${sectionLabel(c.sectionQuality)}`,
  ].map((t) => `<span class="chip">${esc(t)}</span>`).join('');
}

export function hud(heat: HeatSession, shown?: { wave: number; conditions: Conditions }): HTMLElement {
  const wave = shown?.wave ?? Math.min(heat.waveIndex + 1, WAVES_PER_HEAT);
  const cond = shown?.conditions ?? heat.currentConditions;
  return el(`
    <div class="hud-top">
      <div class="panel score-box">
        <div><div class="label">Onda</div><div class="big">${wave}/${WAVES_PER_HEAT}</div></div>
        <div><div class="label">Total</div><div class="big" data-hud="total">${heat.total}</div></div>
        <div><div class="label">Combo</div><div class="big ${heat.combo ? 'warn' : ''}" data-hud="combo">x${heat.combo}</div></div>
      </div>
      <div class="panel cond-box">
        <span class="chip">${esc(findLocation(heat.setup.locationId).name)}</span>
        <span class="chip">${esc(findBoard(heat.setup.boardId).name)} + ${esc(findFin(heat.setup.finId).name)}</span>
        ${conditionChips(cond, heat.setup.locationId)}
      </div>
    </div>`);
}

export function introCard(heat: HeatSession): HTMLElement {
  return el(`
    <div class="panel top-card">
      <div class="tag">Bateria · ${esc(findLocation(heat.setup.locationId).name)}</div>
      <h1>Onda ${heat.waveIndex + 1} de ${WAVES_PER_HEAT}</h1>
      <div class="options">${conditionChips(heat.currentConditions, heat.setup.locationId)}</div>
      <div class="actions"><button class="btn" data-action="spin">Girar roleta <span class="kbd">Espaço</span></button></div>
    </div>`);
}

const WHEEL_COLORS = ['#ffb23f', '#3fd0e6', '#ff7ac1', '#4ee58f', '#ff8a3d', '#8f7bff', '#f2e35b', '#5ba8ff'];

export function wheel(pool: Maneuver[]): { root: HTMLElement; svg: SVGSVGElement } {
  const n = pool.length;
  const R = 200;
  const seg = (Math.PI * 2) / n;
  const paths = pool.map((m, i) => {
    const a0 = i * seg - Math.PI / 2;
    const a1 = a0 + seg;
    const x0 = R + R * Math.cos(a0);
    const y0 = R + R * Math.sin(a0);
    const x1 = R + R * Math.cos(a1);
    const y1 = R + R * Math.sin(a1);
    const mid = a0 + seg / 2;
    const tx = R + (R - 16) * Math.cos(mid);
    const ty = R + (R - 16) * Math.sin(mid);
    const deg = (mid * 180) / Math.PI;
    const fill = m.experimental ? '#7a2cff' : WHEEL_COLORS[i % WHEEL_COLORS.length];
    return `<path d="M${R},${R} L${x0},${y0} A${R},${R} 0 0 1 ${x1},${y1} Z" fill="${fill}" stroke="#0b1f2d" stroke-width="2"/>
      <text x="${tx}" y="${ty}" transform="rotate(${deg} ${tx} ${ty})" text-anchor="end" dominant-baseline="middle"
        font-family="Bahnschrift, Segoe UI, sans-serif" font-weight="700" font-size="${n > 11 ? 12 : 14}" fill="${m.experimental ? '#fff' : '#0b1f2d'}">${esc(m.name)}</text>`;
  }).join('');
  const root = el(`
    <div class="wheel-wrap">
      <div class="wheel-pointer"></div>
      <svg class="wheel" viewBox="0 0 ${R * 2} ${R * 2}">
        <g data-rot>${paths}<circle cx="${R}" cy="${R}" r="26" fill="#0b1f2d" stroke="#fff" stroke-width="3"/></g>
      </svg>
      <div class="panel" style="padding:8px 16px"><b>Sorteando o desafio...</b> <span class="muted">a roleta considera seu nível, atributos e domínio</span></div>
    </div>`);
  return { root, svg: root.querySelector('svg')! };
}

/** Ângulo final para a fatia escolhida parar sob o ponteiro (topo). */
export function wheelTarget(index: number, count: number, turns = 5): number {
  const seg = 360 / count;
  return -(index * seg + seg / 2) - 360 * turns;
}

function relevant(m: Maneuver): [AttributeKey, number][] {
  return (Object.entries(m.weights) as [AttributeKey, number][]).sort((a, b) => b[1] - a[1]).slice(0, 4);
}

export function sequenceHtml(m: Maneuver): string {
  return `<div class="seq">${m.sequence.map((s) => `<div class="key k-${s.phase} ${s.essential ? 'essential' : ''}">${KEY_SYMBOLS[s.key]}<small>${PHASE_LABELS[s.phase]}</small></div>`).join('')}</div>`;
}

export function challengeCard(heat: HeatSession, m: Maneuver, est: ChanceBreakdown): HTMLElement {
  const a = heat.attributes;
  const rec = Object.entries(m.recommended) as [AttributeKey, number][];
  const vars = m.variations.map((id) => findManeuver(id)?.name).filter(Boolean).join(', ');
  return el(`
    <div class="panel center-card">
      <div class="tag ${m.experimental ? 'warn' : ''}">${m.experimental ? `Desafio experimental · inspirado no ${esc(m.origin ?? '')}` : 'Desafio da onda'}</div>
      <div class="maneuver-name">${esc(m.name)}</div>
      <div class="grid2">
        <span class="muted">Família</span><span>${FAMILY_LABELS[m.family]}</span>
        <span class="muted">Direção · rotação</span><span>${directionLabel(m)} · ${m.rotation ? `${m.rotation}°${m.axis === 'flip' ? ' (flip)' : ''}` : 'sem giro'}</span>
        <span class="muted">Grab</span><span>${m.grab ? GRAB_LABELS[m.grab] : 'nenhum'}</span>
        <span class="muted">Dificuldade · pontuação-base</span><span>${m.difficulty}/100 · ${m.baseScore}</span>
        <span class="muted">Skills relevantes</span><span>${relevant(m).map(([k]) => `${ATTRIBUTE_LABELS[k]} ${a[k]}`).join(' · ')}</span>
        <span class="muted">Recomendado</span><span>${rec.length ? rec.map(([k, v]) => `<span class="${a[k] >= v ? 'good' : 'bad'}">${ATTRIBUTE_LABELS[k]} ${v}</span>`).join(' · ') : '—'}</span>
        ${vars ? `<span class="muted">Variações</span><span>${esc(vars)}</span>` : ''}
        ${m.restrictions.length ? `<span class="muted">Restrições</span><span>${esc(m.restrictions.join(' · '))}</span>` : ''}
      </div>
      <div style="padding-bottom:16px">${sequenceHtml(m)}</div>
      <div class="muted" style="font-size:14px">Na onda: <span class="kbd">D</span> para o drop, segure <span class="kbd">W</span> para ganhar velocidade e <span class="kbd">Espaço</span> perto do lip para decolar. Chance antes da execução: <b class="warn">${est.P}%</b>; seus comandos ainda somam de −25 a +35 pontos e a velocidade, até +5. Borda branca = comando essencial.</div>
      <div class="actions">
        <button class="btn secondary" data-action="respin" ${heat.respinAvailable ? '' : 'disabled'}>${heat.respinAvailable ? 'Girar de novo (1 por bateria)' : 'Giro extra usado'}</button>
        <button class="btn" data-action="go">Remar! <span class="kbd">Espaço</span></button>
      </div>
    </div>`);
}

export function lane(m: Maneuver): HTMLElement {
  const root = el(`
    <div class="lane">
      <div class="lane-info"><span data-lane="phase">Preparação</span><span data-lane="hint"></span></div>
      <div class="lane-track panel">
        <div class="lane-perfect" data-lane="perfect"></div>
        <div class="lane-hit" data-lane="hit"></div>
        ${m.sequence.map((s, i) => `<div class="lane-note k-${s.phase} ${s.key === 'SPACE' ? 'wide' : ''} ${s.essential ? 'essential' : ''}" data-note="${i}">${KEY_SYMBOLS[s.key]}</div>`).join('')}
      </div>
    </div>`);
  return root;
}

export function nextPrompt(): HTMLElement {
  return el(`
    <div class="panel next-prompt">
      <span class="muted">Próximo</span>
      <div class="key" data-np="key">—</div>
      <span data-np="phase"></span>
      <div class="bar countdown"><span data-np="bar" style="width:0%"></span></div>
      <span class="muted" data-np="time"></span>
    </div>`);
}

export function waveResultCard(r: WaveResult, last: boolean): HTMLElement {
  const [txt, cls] = OUTCOME_TEXT[r.outcome];
  const c = r.chance;
  const s = r.score;
  const steps = r.steps.map((x) => `<span class="chip">${KEY_SYMBOLS[x.step.key]} <b class="${x.judgement === 'perfect' ? 'good' : x.judgement === 'miss' ? 'bad' : 'warn'}">${JUDGEMENT_LABEL[x.judgement]}</b></span>`).join('');
  return el(`
    <div class="panel center-card">
      <div class="tag">Onda ${r.waveIndex + 1} · ${esc(r.maneuver.name)}</div>
      <h1 class="${cls}" style="font-size:38px">${txt}</h1>
      <div class="options">${steps}</div>
      <div class="grid2">
        <span class="muted">Execução</span><span>${pct(r.execution.quality)}${r.execution.essentialFailed ? ' · <span class="bad">comando essencial perdido</span>' : ''}${r.execution.grabMissed ? ' · <span class="warn">grab não feito</span>' : ''}</span>
        <span class="muted">Chance de pouso</span><span><b>${c.P}%</b> · rolagem ${r.roll.toFixed(1)}</span>
        <span class="muted">Composição</span><span>S ${c.S.toFixed(1)} · D ${c.D} · E ${signed(c.E, 1)} · C ${signed(c.C, 1)} · L ${signed(c.L, 1)}</span>
        <span class="muted">Pontos</span><span>${r.outcome === 'queda' ? '0 · combo zerado' : `<b class="warn" style="font-size:20px">${s.total}</b>`}</span>
        ${r.outcome === 'queda' ? '' : `<span class="muted">Multiplicadores</span><span>${s.base} × exec ${s.execution.toFixed(2)} × pouso ${s.landing.toFixed(2)} × dif ${s.difficulty.toFixed(2)} × novidade ${s.novelty.toFixed(2)} × combo ${s.combo.toFixed(2)}</span>`}
        <span class="muted">Combo · XP</span><span>x${r.comboAfter} · +${r.xp} XP${r.newDiscovery ? ' · <span class="warn">DESCOBERTA NOVA ×1,5</span>' : ''}</span>
      </div>
      <div class="actions"><button class="btn" data-action="next">${last ? 'Resultado da bateria' : 'Próxima onda'} <span class="kbd">Espaço</span></button></div>
    </div>`);
}

export function heatResultScreen(sum: HeatSummary, rewards: HeatRewards): HTMLElement {
  const s = state.save;
  const rows = sum.waveScores.map((w, i) => {
    const [txt, cls] = OUTCOME_TEXT[w.outcome];
    return `<tr><td>${i + 1}</td><td>${esc(w.name)}</td><td class="${cls}">${txt}</td><td><b>${w.points}</b></td></tr>`;
  }).join('');
  const mastery = Object.entries(rewards.masteryGains).map(([f, g]) => `${FAMILY_LABELS[f as keyof typeof FAMILY_LABELS]} +${(g as number).toFixed(1)}`).join(' · ');
  return el(`
    <div class="screen page">
      <div class="header">
        <div><h1>Fim da bateria</h1>${rewards.newRecord ? '<div class="warn" style="margin-top:6px"><b>NOVO RECORDE PESSOAL!</b></div>' : ''}</div>
        <div class="actions">
          <button class="btn secondary" data-action="menu">Menu</button>
          <button class="btn cyan" data-action="skills">Evoluir atributos</button>
          <button class="btn" data-action="again">Nova bateria <span class="kbd">Enter</span></button>
        </div>
      </div>
      <div class="page-body">
        <div class="panel section">
          <h3>Pontuação</h3>
          <div style="font-size:46px;font-weight:800" class="warn">${sum.total}</div>
          <table class="summary"><tr><th>#</th><th>Manobra</th><th>Resultado</th><th>Pontos</th></tr>${rows}</table>
        </div>
        <div class="panel section">
          <h3>Desempenho</h3>
          <div class="profile-row"><span class="muted">Taxa de sucesso</span><b>${pct(sum.successRate)} (${sum.landed}/5)</b></div>
          <div class="profile-row"><span class="muted">Quedas</span><b>${sum.falls}</b></div>
          <div class="profile-row"><span class="muted">Melhor execução</span><b>${sum.bestExecution ? `${esc(sum.bestExecution.name)} · ${sum.bestExecution.quality}%` : '—'}</b></div>
          <div class="profile-row"><span class="muted">Maior combo</span><b>x${sum.bestCombo}</b></div>
          <div class="profile-row"><span class="muted">Maior onda</span><b>${sum.bestWave}</b></div>
          <div class="profile-row"><span class="muted">Comandos Perfect</span><b>${sum.perfects}</b></div>
        </div>
        <div class="panel section">
          <h3>Progresso</h3>
          <div class="profile-row"><span class="muted">Experiência</span><b>+${sum.xp} XP</b></div>
          <div class="profile-row"><span class="muted">Nível</span><b>${s.level}${rewards.xp.levelsGained ? ` <span class="good">(subiu ${rewards.xp.levelsGained})</span>` : ''}</b></div>
          <div class="bar"><span style="width:${(s.xp / xpToNext(s.level)) * 100}%"></span></div>
          <div class="profile-row"><span class="muted">Pontos de habilidade</span><b>+${rewards.pointsGained} (disponíveis: ${s.skillPoints})</b></div>
          <div class="profile-row"><span class="muted">Domínio técnico</span><b style="text-align:right">${esc(mastery || '—')}</b></div>
          <h3 style="margin-top:6px">Desbloqueios</h3>
          <div class="sub">${rewards.unlocks.length ? rewards.unlocks.map((u) => `• ${esc(u)}`).join('<br/>') : '<span class="muted">Nenhum desta vez.</span>'}</div>
        </div>
      </div>
    </div>`);
}

export function popup(parent: HTMLElement, text: string, cls: string, x: string, y: string, big = false) {
  const p = el(`<div class="popup ${cls} ${big ? 'big' : ''}" style="left:${x};top:${y}">${esc(text)}</div>`);
  parent.appendChild(p);
  setTimeout(() => p.remove(), 950);
}
