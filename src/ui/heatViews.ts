import { ATTRIBUTE_LABELS } from '../data/attributes';
import { findBoard, findFin } from '../data/equipment';
import { WIND_LABELS, findLocation } from '../data/locations';
import { sectionLabel } from '../core/conditions';
import { CONTROL_LEGEND } from '../core/controls';
import { WAVES_PER_HEAT, type AerialResult, type HeatSession, type HeatSummary, type WaveResult } from '../core/heat';
import { FAMILY_LABELS, GRAB_LABELS, TIER_LABELS, directionLabel } from '../core/maneuvers';
import { xpToNext } from '../core/progression';
import type { HeatRewards } from '../core/rewards';
import type { AttributeKey, Conditions, Maneuver, Outcome } from '../core/types';
import { state } from '../game/state';
import { el, esc, pct } from './dom';
import { icon } from './icons';

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
        <div><div class="label">Combo</div><div class="big ${heat.combo ? 'accent' : ''}" data-hud="combo">x${heat.combo}</div></div>
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

// Fatias nas cores da marca, cada uma com o texto de maior contraste.
const WHEEL_COLORS: [string, string][] = [['#E30613', '#FFFFFF'], ['#0A0A0A', '#FFFFFF'], ['#FFFFFF', '#0A0A0A'], ['#242424', '#FFFFFF']];
const WHEEL_EXPERIMENTAL: [string, string] = ['#5C0007', '#FFFFFF'];

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
    const [fill, ink] = m.experimental ? WHEEL_EXPERIMENTAL : WHEEL_COLORS[i % WHEEL_COLORS.length];
    return `<path d="M${R},${R} L${x0},${y0} A${R},${R} 0 0 1 ${x1},${y1} Z" fill="${fill}" stroke="#0A0A0A" stroke-width="2"/>
      <text x="${tx}" y="${ty}" transform="rotate(${deg} ${tx} ${ty})" text-anchor="end" dominant-baseline="middle"
        font-family="'Barlow Condensed', 'Arial Narrow', sans-serif" font-weight="700" letter-spacing="0.5" font-size="${n > 11 ? 13 : 15}" fill="${ink}">${esc(m.name.toUpperCase())}</text>`;
  }).join('');
  const root = el(`
    <div class="wheel-wrap">
      <div class="wheel-pointer"></div>
      <svg class="wheel" viewBox="0 0 ${R * 2} ${R * 2}">
        <g data-rot><circle cx="${R}" cy="${R}" r="${R}" fill="#0A0A0A"/>${paths}<circle cx="${R}" cy="${R}" r="${R - 1.5}" fill="none" stroke="#FFFFFF" stroke-width="3"/><circle cx="${R}" cy="${R}" r="28" fill="#0A0A0A" stroke="#E30613" stroke-width="5"/><path d="M${R - 9},${R + 12} L${R + 3},${R - 12} L${R + 9},${R - 12} L${R - 3},${R + 12} Z" fill="#E30613"/></g>
      </svg>
      <div class="panel" style="padding:8px 16px"><b class="accent">SORTEANDO O DESAFIO...</b> <span class="muted">a roleta considera seu nível, atributos e domínio</span></div>
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

const EXT_LABELS: Record<NonNullable<Maneuver['extension']>, string> = { christ: 'Christ', superman: 'Superman', superwoman: 'Superwoman', varial: 'Varial (prancha gira)' };

const num = (v: number, d = 1) => v.toFixed(d).replace('.', ',');

function rotationText(m: Maneuver): string {
  if (!m.rotation) return 'sem giro';
  const axis = m.axis === 'flip' ? ' (flip)' : m.axis === 'rodeo' ? ' (rodeo)' : '';
  return `${m.rotation}°${axis} · ~${m.spinRate}°/s`;
}

const GRAB_KEYS: Record<NonNullable<Maneuver['grab']>, string> = { indy: 'Z', mute: 'X', japan: 'X', method: 'C', stalefish: 'V', tail: 'A' };
const EXT_KEYS: Record<NonNullable<Maneuver['extension']>, string> = { varial: 'S', christ: 'Z + S', superwoman: 'X + S', superman: 'Z + X + S' };

interface SeqStep {
  key: string;
  label: string;
  cls: string;
}

/**
 * Sequência de comandos do aéreo, tirada da legenda de controles do jogo
 * (CONTROL_LEGEND): pop no Lip, giro ou flip, grab, extensão e pouso.
 */
export function maneuverSteps(m: Maneuver): SeqStep[] {
  const steps: SeqStep[] = [{ key: 'Espaço', label: 'Segure e solte no Lip', cls: 'k-impulsao' }];
  if (m.axis === 'flip' || m.axis === 'rodeo') {
    steps.push({ key: m.axis === 'rodeo' ? '← + ↑' : '↑', label: `${m.axis === 'rodeo' ? 'Rodeo' : 'Flip'} ${m.rotation}°`, cls: 'k-rotacao' });
  } else if (m.rotation) {
    const k = m.direction === 'backside' ? '←' : m.direction === 'frontside' ? '→' : '← / →';
    steps.push({ key: k, label: `Giro ${m.rotation}°`, cls: 'k-rotacao' });
  } else if (m.direction !== 'nenhuma') {
    steps.push({ key: m.direction === 'backside' ? '←' : '→', label: directionLabel(m), cls: 'k-rotacao' });
  }
  if (m.grab) steps.push({ key: GRAB_KEYS[m.grab], label: `${GRAB_LABELS[m.grab]}${m.grab === 'japan' ? ' (segure)' : ''}`, cls: 'k-grab' });
  if (m.extension) steps.push({ key: EXT_KEYS[m.extension], label: EXT_LABELS[m.extension], cls: 'k-grab' });
  steps.push({ key: '↓', label: 'Pouso', cls: 'k-aterrissagem' });
  return steps;
}

/** Desenho da trajetória: parábola pela altura de referência e o giro no ápice. */
export function maneuverDiagram(m: Maneuver): string {
  const apex = 92 - Math.min(1, m.height / 3) * 70;
  const back = m.direction === 'backside';
  const x0 = back ? 180 : 10;
  const x1 = back ? 10 : 180;
  const turns = m.rotation / 360;
  const r = 15;
  const ax = 95;
  const ay = apex + 6;
  let ring = '';
  if (m.rotation) {
    const frac = Math.min(turns, 1);
    const a1 = -Math.PI / 2 + frac * Math.PI * 2 * (back ? -1 : 1) * 0.999;
    const ex = ax + r * Math.cos(a1);
    const ey = ay + r * Math.sin(a1);
    const large = frac > 0.5 ? 1 : 0;
    const sweep = back ? 0 : 1;
    ring = `<path d="M${ax} ${ay - r} A${r} ${r} 0 ${large} ${sweep} ${ex.toFixed(1)} ${ey.toFixed(1)}" fill="none" stroke="#E30613" stroke-width="4"/>
      <text x="${ax}" y="${ay + r + 15}" text-anchor="middle" font-family="'Barlow Condensed', sans-serif" font-weight="800" font-size="14" fill="#fff">${m.rotation}°${m.axis === 'flip' || m.axis === 'rodeo' ? ' FLIP' : ''}</text>`;
  }
  const grab = m.grab ? `<path d="M${ax - 5} ${apex - 14} l5 -6 5 6 -5 6z" fill="#fff"/>` : '';
  return `<svg class="maneuver-diagram" viewBox="0 0 190 110" aria-hidden="true">
    <path d="M0 104 L190 104" stroke="rgba(255,255,255,0.25)" stroke-width="2"/>
    <path d="M${x0} 104 Q 95 ${apex * 2 - 104} ${x1} 104" fill="none" stroke="#fff" stroke-width="2.5" stroke-dasharray="6 5"/>
    <path d="M${x0} 104 l${back ? -14 : 14} -10" stroke="#E30613" stroke-width="4"/>
    ${ring}${grab}
    <text x="${back ? 186 : 4}" y="98" text-anchor="${back ? 'end' : 'start'}" font-family="'Barlow Condensed', sans-serif" font-weight="700" font-size="11" letter-spacing="1" fill="#B3B3B3">LIP</text>
  </svg>`;
}

/** Ficha do aéreo sorteado: requisitos físicos e como fazer. */
export function challengeCard(heat: HeatSession, m: Maneuver): HTMLElement {
  const a = heat.attributes;
  const rec = Object.entries(m.recommended) as [AttributeKey, number][];
  const steps = maneuverSteps(m);
  const level = Math.max(1, Math.min(10, Math.round(m.difficulty / 10)));
  return el(`
    <div class="panel center-card">
      <div class="tag ${m.experimental ? 'warn' : ''}">Desafio da onda · ${TIER_LABELS[m.tier]}${m.experimental ? ' · descoberta' : ''} <span class="chip red">vale ×1,5</span></div>
      <div class="maneuver-head">
        <div class="maneuver-name">${esc(m.name)}</div>
        ${maneuverDiagram(m)}
      </div>
      <div class="spec-strip">
        <div><span class="label">${icon('height')} Altura</span><b>${num(m.height)} m</b></div>
        <div><span class="label">${icon('rotation')} Rotação</span><b>${m.rotation ? `${m.rotation}°` : '—'}</b></div>
        <div><span class="label">${icon('speed')} Aproximação</span><b>${Math.round(m.minSpeed * 3.6)}+ km/h</b></div>
        <div><span class="label">${icon('score')} Dificuldade</span><b>${m.difficulty}<span class="muted" style="font-size:14px">/100</span></b><div class="difficulty">${Array.from({ length: 10 }, (_, i) => `<i class="${i < level ? 'on' : ''}"></i>`).join('')}</div></div>
      </div>
      <div class="group-title">Sequência de comandos</div>
      <div class="seq">${steps.map((st, i) => `${i ? '<span class="seq-arrow">›</span>' : ''}<div class="seq-step"><span class="key ${st.cls}">${esc(st.key)}</span><small>${esc(st.label)}</small></div>`).join('')}</div>
      <div class="grid2">
        <span class="muted">Direção · rotação</span><span>${directionLabel(m)} · ${rotationText(m)}</span>
        <span class="muted">Grab · extensão</span><span>${m.grab ? GRAB_LABELS[m.grab] : 'nenhum'}${m.extension ? ` · ${EXT_LABELS[m.extension]}` : ''}</span>
        <span class="muted">Aproximação</span><span>${Math.round(m.minSpeed * 3.6)} km/h ou mais · subida de ${m.approach[0]}° a ${m.approach[1]}°</span>
        <span class="muted">Voo de referência</span><span>${num(m.height)} m acima do lip · ${num(m.airTime, 2)} s no ar</span>
        <span class="muted">Corpo · prancha</span><span>${esc(m.body)} ${esc(m.board)}</span>
        <span class="muted">Pouso</span><span>${esc(m.landing)}</span>
        <span class="muted">Dificuldade · base</span><span>${m.difficulty}/100 · ${m.baseScore} · controle ${Math.round(m.control * 100)}%</span>
        <span class="muted">Skills relevantes</span><span>${relevant(m).map(([k]) => `${ATTRIBUTE_LABELS[k]} ${a[k]}`).join(' · ')}</span>
        <span class="muted">Recomendado</span><span>${rec.length ? rec.map(([k, v]) => `<span class="${a[k] >= v ? 'good' : 'bad'}">${a[k] >= v ? '✓' : '✗'} ${ATTRIBUTE_LABELS[k]} ${v}</span>`).join(' · ') : '—'}</span>
      </div>
      <div class="howto"><b>Como fazer:</b> ${esc(m.howTo)}</div>
      <div class="muted" style="font-size:14px">Na onda: <span class="kbd">D</span> para o drop, setas para navegar e <span class="kbd">W</span> para bombear. Segure <span class="kbd">Espaço</span> subindo a face e solte perto do lip. Qualquer aéreo pontua; o desafio vale mais.</div>
      <div class="actions">
        <button class="btn secondary" data-action="respin" ${heat.respinAvailable ? '' : 'disabled'}>${icon('replay')} ${heat.respinAvailable ? 'Girar de novo (1 por bateria)' : 'Giro extra usado'}</button>
        <button class="btn" data-action="go">${icon('play')} Remar! <span class="kbd">Espaço</span></button>
      </div>
    </div>`);
}

/** Painel da onda: velocidade, zona crítica, compressão, tempo e leitura do voo. */
export function rideHud(challenge: Maneuver): HTMLElement {
  const legend = (rows: readonly (readonly [string, string])[]) => rows.map(([k, t]) => `<span class="kbd">${esc(k)}</span><span>${esc(t)}</span>`).join('');
  return el(`
    <div class="ride-hud">
      <div class="panel ride-meters">
        <div class="meter"><span class="label">Velocidade</span><div class="bar"><span data-rh="speed"></span></div><b data-rh="kmh">0 km/h</b></div>
        <div class="meter"><span class="label">Zona crítica</span><div class="bar crit"><span data-rh="crit"></span></div><b data-rh="gap"></b></div>
        <div class="meter"><span class="label">Compressão</span><div class="bar comp"><span data-rh="comp"></span></div><b data-rh="ready"></b></div>
        <div class="meter"><span class="label">Onda</span><b data-rh="time">—</b><span class="muted" data-rh="wavepts"></span></div>
      </div>
      <div class="panel ride-msg" data-rh="msg">Pressione D para entrar na onda</div>
      <div class="panel air-readout" data-rh="air" hidden></div>
      <div class="panel ride-legend" data-rh="legend">
        <div class="muted">Desafio: <b class="accent">${esc(challenge.name)}</b> · ${esc(challenge.howTo)}</div>
        <div class="help-list" data-rh="lg-agua">${legend(CONTROL_LEGEND.agua)}</div>
        <div class="help-list" data-rh="lg-ar" hidden>${legend(CONTROL_LEGEND.ar)}</div>
      </div>
    </div>`);
}

function aerialLine(a: AerialResult): string {
  const [txt, cls] = OUTCOME_TEXT[a.landing.outcome];
  const s = a.score;
  const r = a.record;
  const tags = [
    a.challenge ? '<span class="accent">DESAFIO ×1,5</span>' : '',
    a.newDiscovery ? '<span class="accent">DESCOBERTA</span>' : '',
    a.unlocked ? '' : '<span class="bad">não desbloqueado</span>',
    a.rodeAway ? '<span class="good">saiu surfando +10%</span>' : '',
  ].filter(Boolean).join(' · ');
  const mult = a.landing.outcome === 'queda'
    ? `<span class="muted">${esc(a.landing.note)}</span>`
    : `<span class="muted">${s.base} × exec ${num(s.execution, 2)} × pouso ${num(s.landing, 2)} × dif ${num(s.difficulty, 2)} × novidade ${num(s.novelty, 2)} × sequência ${num(s.sequence, 2)}${s.challenge !== 1 ? ` × desafio ${num(s.challenge, 1)}` : ''}${s.locked !== 1 ? ` × ${num(s.locked, 1)}` : ''}</span>`;
  return `
    <div class="aerial-row">
      <div><b>${esc(a.name)}</b> <span class="${cls}">${txt}</span> ${tags}</div>
      <div class="muted">${num(r.apex)} m · ${num(r.airTime, 2)} s · ${Math.round(Math.abs(r.yaw))}°${Math.abs(r.flip) > 90 ? ` · flip ${Math.round(Math.abs(r.flip))}°` : ''} · ${Math.round(r.launch.speed * 3.6)} km/h · execução ${pct(a.quality)}</div>
      <div>${mult} <b class="accent">${a.points}</b></div>
    </div>`;
}

const END_TEXT: Record<WaveResult['endedBy'], string> = {
  fim: 'Onda completa',
  queda: 'Terminou em queda',
  fechou: 'A onda fechou',
};

export function waveResultCard(r: WaveResult, last: boolean): HTMLElement {
  const [txt, cls] = r.aerials.length ? OUTCOME_TEXT[r.outcome] : ['SEM AÉREO', 'warn'];
  return el(`
    <div class="panel center-card">
      <div class="tag">Onda ${r.waveIndex + 1} · ${END_TEXT[r.endedBy]} · desafio ${esc(r.maneuver.name)} ${r.challengeDone ? '<span class="good">✓</span>' : '<span class="muted">✗</span>'}</div>
      <h1 class="outcome ${cls}">${txt}</h1>
      <div class="aerial-list">${r.aerials.length ? r.aerials.map(aerialLine).join('') : '<div class="muted">Nenhum aéreo nesta onda: suba a face rápido e solte o espaço perto do lip.</div>'}</div>
      <div class="grid2">
        <span class="muted">Aéreos</span><span>${r.subtotal}</span>
        <span class="muted">Combo</span><span>× ${num(r.combo, 2)}${r.finish !== 1 ? ` · fim da onda × ${num(r.finish, 2)}` : ''}</span>
        <span class="muted">Combo · XP</span><span>x${r.comboAfter} · +${r.xp} XP${r.newDiscovery ? ' · <span class="accent">DESCOBERTA NOVA ×1,5</span>' : ''}</span>
      </div>
      <div class="wave-total"><span>Total da onda</span><b>${r.total}</b></div>
      <div class="actions"><button class="btn" data-action="next">${icon(last ? 'trophy' : 'wave')} ${last ? 'Resultado da bateria' : 'Próxima onda'} <span class="kbd">Espaço</span></button></div>
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
    <div class="screen page grain">
      <div class="header">
        <div><div class="eyebrow">Resultado</div><h1>Fim da bateria</h1></div>
        <div class="actions">
          <button class="btn secondary" data-action="menu">${icon('back')} Menu</button>
          <button class="btn outline" data-action="skills">${icon('stats')} Evoluir atributos</button>
          <button class="btn" data-action="again">${icon('play')} Nova bateria <span class="kbd">Enter</span></button>
        </div>
      </div>
      <div class="page-body">
        <div class="panel section">
          <h3>${icon('score')} Pontuação</h3>
          <div class="final-score">${sum.total}</div>
          ${rewards.newRecord ? '<div><span class="record-stamp">NOVO RECORDE PESSOAL</span></div>' : ''}
          <table class="summary"><tr><th>#</th><th>Aéreos</th><th>Resultado</th><th>Pontos</th></tr>${rows}</table>
        </div>
        <div class="panel section">
          <h3>${icon('stats')} Desempenho</h3>
          <div class="profile-row"><span class="muted">Taxa de sucesso</span><b>${pct(sum.successRate)} (${sum.landed}/${sum.landed + sum.falls})</b></div>
          <div class="profile-row"><span class="muted">Quedas</span><b>${sum.falls}</b></div>
          <div class="profile-row"><span class="muted">Melhor execução</span><b>${sum.bestExecution ? `${esc(sum.bestExecution.name)} · ${sum.bestExecution.quality}%` : '—'}</b></div>
          <div class="profile-row"><span class="muted">Maior combo</span><b>x${sum.bestCombo}</b></div>
          <div class="profile-row"><span class="muted">Maior onda</span><b>${sum.bestWave}</b></div>
          <div class="profile-row"><span class="muted">Pousos limpos</span><b>${sum.perfects}</b></div>
        </div>
        <div class="panel section">
          <h3>${icon('achievements')} Progresso</h3>
          <div class="profile-row"><span class="muted">Experiência</span><b>+${sum.xp} XP</b></div>
          <div class="profile-row"><span class="muted">Nível</span><b>${s.level}${rewards.xp.levelsGained ? ` <span class="good">(subiu ${rewards.xp.levelsGained})</span>` : ''}</b></div>
          <div class="bar"><span style="width:${(s.xp / xpToNext(s.level)) * 100}%"></span></div>
          <div class="profile-row"><span class="muted">Pontos de habilidade</span><b>+${rewards.pointsGained} (disponíveis: ${s.skillPoints})</b></div>
          <div class="profile-row"><span class="muted">Domínio técnico</span><b style="text-align:right">${esc(mastery || '—')}</b></div>
          <h3 style="margin-top:6px">${icon('lock')} Desbloqueios</h3>
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
