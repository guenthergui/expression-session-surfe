import { ATTRIBUTE_EN, ATTRIBUTE_HINTS, ATTRIBUTE_LABELS, MAX_ATTRIBUTE } from '../data/attributes';
import { BOARDS, FINS, formatDims } from '../data/equipment';
import { LOCATIONS, WIND_HINTS, WIND_LABELS, findLocation } from '../data/locations';
import { STEPS, clampSetup, sectionLabel, type HeatSetup } from '../core/conditions';
import { FAMILY_LABELS, findManeuver } from '../core/maneuvers';
import { conditionModifier, conditionParts } from '../core/performance';
import { spendPoint, xpToNext } from '../core/progression';
import { FAMILIES, QUALITIES, type CameraMode, type Quality } from '../core/save';
import { QUALITY } from '../render/Stage';
import { ATTRIBUTE_KEYS, type PhaseMods } from '../core/types';
import { persist, state } from '../game/state';
import { bind, el, esc, signed } from './dom';
import { icon } from './icons';
import { lockerScreen, type LockerHost } from './locker';

export { lockerScreen };

export interface MenuHost extends LockerHost {
  go(screen: 'menu' | 'setup' | 'skills' | 'locker' | 'settings'): void;
  startHeat(setup: HeatSetup): void;
  preview(setup: HeatSetup): void;
  refreshLook(): void;
  setQuality(q: Quality): void;
  setSound(on: boolean): void;
  setCameraMode(mode: CameraMode): void;
  resetProgress(): void;
  click(): void;
  showHelp(): void;
}

const PHASE_SHORT: Record<keyof PhaseMods, string> = { impulsao: 'Impulsão', rotacao: 'Rotação', grab: 'Grab', aterrissagem: 'Pouso' };

function modsHtml(mods: PhaseMods): string {
  return `<div class="mods">${(Object.keys(mods) as (keyof PhaseMods)[])
    .map((k) => `<span>${PHASE_SHORT[k]} <b class="${mods[k] > 0 ? 'good' : mods[k] < 0 ? 'bad' : 'dim'}">${signed(mods[k])}</b></span>`)
    .join('')}</div>`;
}

export function menuScreen(host: MenuHost): HTMLElement {
  const s = state.save;
  const root = el(`
    <div class="screen menu">
      <div class="menu-left">
        <div class="logo">EXPRESSION<br/>SESSION<small>SURFE AÉREO</small></div>
        <div class="panel profile">
          <div class="profile-row"><b>Nível ${s.level}</b><span class="muted">XP ${s.xp}/${xpToNext(s.level)}</span></div>
          <div class="bar"><span style="width:${(s.xp / xpToNext(s.level)) * 100}%"></span></div>
          <div class="profile-row"><span class="muted">Pontos de habilidade</span><b class="${s.skillPoints ? 'warn' : ''}">${s.skillPoints}</b></div>
          <div class="profile-row"><span class="muted">Recorde de bateria</span><b>${s.records.bestHeatScore}</b></div>
          <div class="profile-row"><span class="muted">Melhor onda · melhor combo</span><b>${s.records.bestWaveScore} · x${s.records.bestCombo}</b></div>
          <div class="profile-row"><span class="muted">Baterias · pousos</span><b>${s.records.heatsPlayed} · ${s.stats.landed}/${s.stats.waves}</b></div>
        </div>
      </div>
      <div class="menu-buttons">
        <button class="btn" data-action="play">${icon('play')} Começar bateria <span class="kbd">Enter</span></button>
        <button class="btn secondary" data-action="skills">${icon('chart')} Evolução do surfista${s.skillPoints ? ` <span class="kbd warn">${s.skillPoints} pts</span>` : ''}</button>
        <button class="btn secondary" data-action="locker">${icon('shirt')} Vestiário</button>
        <button class="btn secondary" data-action="settings">${icon('gear')} Configurações</button>
        <button class="btn secondary" data-action="help">${icon('help')} Como jogar</button>
      </div>
    </div>`);
  bind(root, {
    play: () => host.go('setup'),
    skills: () => host.go('skills'),
    locker: () => host.go('locker'),
    settings: () => host.go('settings'),
    help: () => host.showHelp(),
  }, () => host.click());
  return root;
}

export function setupScreen(host: MenuHost): HTMLElement {
  const save = state.save;
  let setup: HeatSetup = clampSetup(save.unlockedLocations.includes(save.lastSetup.locationId) ? save.lastSetup : { ...save.lastSetup, locationId: 'pico-leste' });
  const root = el(`
    <div class="screen page">
      <div class="header">
        <h1>Preparação da bateria</h1>
        <div class="actions">
          <button class="btn secondary" data-action="back">${icon('back')} Voltar</button>
          <button class="btn" data-action="start">${icon('play')} Iniciar bateria <span class="kbd">Enter</span></button>
        </div>
      </div>
      <div class="page-body">
        <div class="panel section"><h3>Prancha</h3><div data-slot="boards" style="display:grid;gap:8px"></div></div>
        <div style="display:grid;gap:18px">
          <div class="panel section"><h3>Quilhas</h3><div data-slot="fins" style="display:grid;gap:8px"></div></div>
          <div class="panel section"><h3>Local</h3><div data-slot="locs" style="display:grid;gap:8px"></div></div>
        </div>
        <div class="panel section"><h3>Condições do mar</h3><div data-slot="cond" style="display:grid;gap:12px"></div></div>
      </div>
    </div>`);

  bind(root, { back: () => host.go('menu'), start: () => host.startHeat(setup) }, () => host.click());

  const effects = () => {
    const loc = findLocation(setup.locationId);
    const ref = findManeuver('air-reverse')!;
    const c = { height: setup.height, power: setup.power, windType: setup.windType, windSpeed: setup.windSpeed, sectionQuality: setup.sectionQuality };
    const parts = conditionParts(c, ref, loc.id);
    const C = conditionModifier(c, ref, loc.id, save.attributes.leituraOnda);
    const box = root.querySelector<HTMLElement>('[data-slot=effects]');
    if (!box) return;
    box.innerHTML = `
      <div class="sub muted">${loc.windAffects ? esc(WIND_HINTS[setup.windType]) : 'Piscina de ondas: sem vento e ondas sempre iguais.'}</div>
      <div class="sub muted">Seção: ${sectionLabel(setup.sectionQuality)}. Cada onda varia um pouco em torno destes valores.</div>
      <div class="card" style="cursor:default">
        <div class="title">Efeito das condições na chance</div>
        <div class="mods">
          <span>Altura <b class="${parts.height >= 0 ? 'good' : 'bad'}">${signed(parts.height, 1)}</b></span>
          <span>Potência <b class="${parts.power >= 0 ? 'good' : 'bad'}">${signed(parts.power, 1)}</b></span>
          <span>Vento <b class="${parts.wind >= 0 ? 'good' : 'bad'}">${signed(parts.wind, 1)}</b></span>
          <span>Seção <b class="${parts.section >= 0 ? 'good' : 'bad'}">${signed(parts.section, 1)}</b></span>
        </div>
        <div class="sub">Total com sua leitura de onda (${save.attributes.leituraOnda}): <b>${signed(C, 1)} pontos</b>, numa manobra média.</div>
      </div>`;
  };

  const render = () => {
    const boards = root.querySelector<HTMLElement>('[data-slot=boards]')!;
    boards.innerHTML = BOARDS.map((b) => {
      const locked = !save.unlockedBoards.includes(b.id);
      return `<div class="card ${b.id === setup.boardId ? 'selected' : ''} ${locked ? 'locked' : ''}" data-action="board" data-id="${b.id}">
        <div class="title">${esc(b.name)} <span class="muted">· ${esc(b.archetype)}</span></div>
        <div class="sub">${esc(formatDims(b.dims))}</div>
        <div class="sub">${esc(b.description)}${locked ? ` · libera no nível ${b.unlockLevel}` : ''}</div>
        ${modsHtml(b.mods)}
      </div>`;
    }).join('');
    const fins = root.querySelector<HTMLElement>('[data-slot=fins]')!;
    fins.innerHTML = FINS.map((f) => `<div class="card ${f.id === setup.finId ? 'selected' : ''} ${save.unlockedFins.includes(f.id) ? '' : 'locked'}" data-action="fin" data-id="${f.id}">
        <div class="title">${esc(f.name)}</div><div class="sub">${esc(f.description)}</div>${modsHtml(f.mods)}</div>`).join('');
    const locs = root.querySelector<HTMLElement>('[data-slot=locs]')!;
    locs.innerHTML = LOCATIONS.map((l) => {
      const locked = !save.unlockedLocations.includes(l.id);
      return `<div class="card ${l.id === setup.locationId ? 'selected' : ''} ${locked ? 'locked' : ''}" data-action="loc" data-id="${l.id}">
        <div class="title">${esc(l.name)} <span class="muted">· ${esc(l.kind)}</span></div>
        <div class="sub">${locked ? `Bloqueado: libera no nível ${l.unlockLevel}` : esc(l.description)}</div></div>`;
    }).join('');

    const loc = findLocation(setup.locationId);
    const cond = root.querySelector<HTMLElement>('[data-slot=cond]')!;
    const slider = (key: keyof typeof STEPS, label: string, range: [number, number], unit: string, digits = 0, disabled = false) => `
      <div class="slider-row"><span class="muted">${label}</span>
        <input type="range" data-input="${key}" data-digits="${digits}" data-unit="${unit}" min="${range[0]}" max="${range[1]}" step="${STEPS[key]}" value="${setup[key]}" ${disabled ? 'disabled' : ''}/>
        <b>${(setup[key] as number).toFixed(digits)} ${unit}</b></div>`;
    cond.innerHTML = `
      ${slider('height', 'Altura da onda', loc.heightRange, 'm', 2)}
      ${slider('power', 'Potência', loc.powerRange, '/100')}
      <div class="slider-row"><span class="muted">Direção do vento</span>
        <select data-input="windType" ${loc.windAffects ? '' : 'disabled'}>${loc.windTypes.map((w) => `<option value="${w}" ${w === setup.windType ? 'selected' : ''}>${WIND_LABELS[w]}</option>`).join('')}</select>
        <span></span></div>
      ${slider('windSpeed', 'Intensidade do vento', loc.windSpeedRange, 'km/h', 0, !loc.windAffects)}
      ${slider('sectionQuality', 'Qualidade da seção', loc.sectionRange, '', 0)}
      <div data-slot="effects" style="display:grid;gap:10px"></div>`;
    effects();

    for (const slot of ['boards', 'fins', 'locs']) {
      bind(root.querySelector<HTMLElement>(`[data-slot=${slot}]`)!, {
        board: (n) => update({ boardId: n.dataset.id! }),
        fin: (n) => update({ finId: n.dataset.id! }),
        loc: (n) => update({ ...clampSetup({ ...setup, locationId: n.dataset.id! }) }),
      }, () => host.click());
    }
    // Sliders só atualizam o número e o quadro de efeitos, para não perder o arraste.
    cond.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-input]').forEach((input) => {
      input.addEventListener('input', () => {
        const key = input.dataset.input as keyof HeatSetup;
        const value = key === 'windType' ? input.value : Number(input.value);
        setup = clampSetup({ ...setup, [key]: value });
        host.preview(setup);
        const label = input.nextElementSibling as HTMLElement | null;
        if (label && input instanceof HTMLInputElement) {
          label.textContent = `${(setup[key] as number).toFixed(Number(input.dataset.digits))} ${input.dataset.unit}`;
        }
        effects();
      });
    });
  };

  const update = (patch: Partial<HeatSetup>) => {
    setup = clampSetup({ ...setup, ...patch });
    host.preview(setup);
    render();
  };
  render();
  host.preview(setup);
  (root as HTMLElement & { submit?: () => void }).submit = () => host.startHeat(setup);
  return root;
}

export function skillsScreen(host: MenuHost): HTMLElement {
  const root = el(`<div class="screen page"></div>`);
  const render = () => {
    const s = state.save;
    root.innerHTML = `
      <div class="header">
        <h1>Evolução do surfista</h1>
        <div class="actions">
          <button class="btn secondary" data-action="back">${icon('back')} Menu</button>
          <button class="btn" data-action="play">${icon('play')} Nova bateria</button>
        </div>
      </div>
      <div class="page-body" style="grid-template-columns: minmax(420px, 2fr) minmax(280px, 1fr)">
        <div class="panel section">
          <div class="header"><h3>Atributos</h3><span>Pontos disponíveis: <b class="${s.skillPoints ? 'warn' : ''}">${s.skillPoints}</b></span></div>
          ${ATTRIBUTE_KEYS.map((k) => `
            <div class="attr-row">
              <span class="name">${ATTRIBUTE_LABELS[k]}<small>${ATTRIBUTE_EN[k]}</small></span>
              <div class="bar"><span style="width:${s.attributes[k]}%"></span></div>
              <b>${s.attributes[k]}</b>
              <button class="btn small" data-action="add" data-key="${k}" ${s.skillPoints > 0 && s.attributes[k] < MAX_ATTRIBUTE ? '' : 'disabled'}>+</button>
              <span class="hint">${ATTRIBUTE_HINTS[k]}</span>
            </div>`).join('')}
        </div>
        <div style="display:grid;gap:18px">
          <div class="panel section">
            <h3>Nível</h3>
            <div class="profile-row"><b>Nível ${s.level}</b><span class="muted">XP ${s.xp}/${xpToNext(s.level)}</span></div>
            <div class="bar"><span style="width:${(s.xp / xpToNext(s.level)) * 100}%"></span></div>
            <div class="sub muted">Cada nível dá 4 pontos e cada bateria completa dá mais 1. Atributos vão até 100.</div>
          </div>
          <div class="panel section">
            <h3>Domínio técnico</h3>
            ${FAMILIES.map((f) => `
              <div class="profile-row"><span>${FAMILY_LABELS[f]}</span><b>${Math.round(s.mastery[f])}</b></div>
              <div class="bar"><span style="width:${s.mastery[f]}%"></span></div>`).join('')}
            <div class="sub muted">Sobe ao surfar cada família. Soma até +10 de capacidade nas manobras dela.</div>
          </div>
          <div class="panel section">
            <h3>Estatísticas</h3>
            <div class="profile-row"><span class="muted">Ondas</span><b>${s.stats.waves}</b></div>
            <div class="profile-row"><span class="muted">Pousos · quedas</span><b>${s.stats.landed} · ${s.stats.falls}</b></div>
            <div class="profile-row"><span class="muted">Comandos Perfect</span><b>${s.stats.perfects}</b></div>
            <div class="profile-row"><span class="muted">Melhor execução</span><b>${s.records.bestExecution}%</b></div>
          </div>
        </div>
      </div>`;
    bind(root, {
      add: (n) => {
        if (spendPoint(state.save, n.dataset.key as (typeof ATTRIBUTE_KEYS)[number])) {
          persist();
          render();
        }
      },
      back: () => host.go('menu'),
      play: () => host.go('setup'),
    }, () => host.click());
  };
  render();
  return root;
}

export function settingsScreen(host: MenuHost): HTMLElement {
  const root = el(`<div class="screen page"></div>`);
  const render = () => {
    const p = state.save.prefs;
    root.innerHTML = `
      <div class="header"><h1>Configurações</h1><div class="actions"><button class="btn secondary" data-action="back">${icon('back')} Menu</button></div></div>
      <div class="page-body" style="grid-template-columns: minmax(360px, 560px)">
        <div class="panel section">
          <h3>Qualidade gráfica</h3>
          <div class="options">
            ${QUALITIES.map((q) => `<button class="btn small secondary ${p.quality === q ? 'selected' : ''}" aria-pressed="${p.quality === q}" data-action="quality" data-q="${q}">${QUALITY[q].label}</button>`).join('')}
          </div>
          <div class="sub muted">${qualityText(p.quality)}</div>
          <h3>Câmera</h3>
          <div class="options">
            <button class="btn small secondary ${p.camera === 'lateral' ? 'selected' : ''}" aria-pressed="${p.camera === 'lateral'}" data-action="camera" data-mode="lateral">Lateral (onda inteira)</button>
            <button class="btn small secondary ${p.camera === 'proxima' ? 'selected' : ''}" aria-pressed="${p.camera === 'proxima'}" data-action="camera" data-mode="proxima">Próxima (corpo e prancha)</button>
          </div>
          <h3>Som</h3>
          <div class="options">
            <button class="btn small secondary ${p.sound ? 'selected' : ''}" aria-pressed="${p.sound}" data-action="sound" data-on="1">Ligado</button>
            <button class="btn small secondary ${p.sound ? '' : 'selected'}" aria-pressed="${!p.sound}" data-action="sound" data-on="0">Desligado</button>
          </div>
          <h3>Progresso</h3>
          <div class="sub muted">Apaga nível, atributos, domínio, desbloqueios e recordes. Não dá para desfazer.</div>
          <div><button class="btn danger small" data-action="reset">Reiniciar progressão</button></div>
        </div>
      </div>`;
    bind(root, {
      quality: (n) => {
        state.save.prefs.quality = n.dataset.q as Quality;
        persist();
        host.setQuality(state.save.prefs.quality);
        render();
      },
      camera: (n) => {
        state.save.prefs.camera = n.dataset.mode as CameraMode;
        persist();
        host.setCameraMode(state.save.prefs.camera);
        render();
      },
      sound: (n) => {
        state.save.prefs.sound = n.dataset.on === '1';
        persist();
        host.setSound(state.save.prefs.sound);
        render();
      },
      reset: () => {
        confirmModal(root, 'Reiniciar progressão?', 'Isso apaga todo o seu progresso salvo neste navegador.', 'Apagar tudo', () => {
          host.resetProgress();
          host.go('menu');
        });
      },
      back: () => host.go('menu'),
    }, () => host.click());
  };
  render();
  return root;
}

export function confirmModal(parent: HTMLElement, title: string, text: string, confirm: string, onYes: () => void) {
  const m = el(`
    <div class="modal-bg">
      <div class="panel modal">
        <h2>${esc(title)}</h2>
        <div class="muted">${esc(text)}</div>
        <div class="actions">
          <button class="btn secondary" data-action="no">Cancelar</button>
          <button class="btn danger" data-action="yes">${esc(confirm)}</button>
        </div>
      </div>
    </div>`);
  bind(m, { no: () => m.remove(), yes: () => { m.remove(); onYes(); } });
  parent.appendChild(m);
}

export function helpModal(parent: HTMLElement) {
  const m = el(`
    <div class="modal-bg">
      <div class="panel modal" style="width:min(640px, calc(100vw - 32px))">
        <h2>Como jogar</h2>
        <div class="muted">Cada bateria tem 5 ondas. Antes de cada uma, a roleta sorteia a manobra. Cada onda começa com você deitado, remando: entre na onda, ganhe velocidade e decole no lip. No ar, os comandos vêm pela faixa de baixo: aperte a tecla quando ela passar pela linha amarela.</div>
        <div class="help-list">
          <span class="kbd">D</span><span>Drop: levanta e entra na onda (um toque)</span>
          <span class="kbd">W</span><span>Segure para ganhar velocidade (solte para parar de acelerar)</span>
          <span class="kbd">Espaço</span><span>Decolagem, perto do lip e com velocidade</span>
          <span class="kbd">← →</span><span>Direção e rotação: → frontside, ← backside</span>
          <span class="kbd">↑</span><span>Jogar o corpo no flip (manobras experimentais)</span>
          <span class="kbd">Z</span><span>Grab com a mão de trás (Indy, Stalefish)</span>
          <span class="kbd">X</span><span>Grab com a mão da frente (Mute, Melon)</span>
          <span class="kbd">↓</span><span>Aterrissagem</span>
        </div>
        <div class="muted">Perfect, Good e Late valem cada vez menos. Miss num comando com borda branca (essencial) é queda. A decolagem define a altura do aéreo; a rotação só gira com os comandos certos; o grab só acontece se você apertar.</div>
        <div class="actions"><button class="btn" data-action="ok">Entendi</button></div>
      </div>
    </div>`);
  bind(m, { ok: () => m.remove() });
  parent.appendChild(m);
}

/** Explica o que cada nível gráfico muda de verdade. */
function qualityText(q: Quality): string {
  const p = QUALITY[q];
  const parts = [
    p.renderScale < 1 ? `cena 3D a ${Math.round(p.renderScale * 100)}% da resolução da tela` : `cena 3D na resolução da tela (até ${p.pixelRatio}×)`,
    p.shadows ? `sombras ${p.shadowSize}px` : 'sem sombras',
    `malha do mar a cada ${Math.round(p.oceanStep * 100)} cm`,
    `${p.particles} partículas`,
    `alcance de ${p.renderDistance} m`,
    p.detailNormals ? 'ondulações finas' : 'sem ondulações finas',
    p.wakePoints ? 'rastro de espuma' : 'sem rastro',
    p.bloom ? 'brilho suave nos reflexos' : '',
  ].filter(Boolean);
  return `${p.label}: ${parts.join(', ')}.`;
}

export interface PauseActions {
  resume(): void;
  help(): void;
  camera(): void;
  sound(): void;
  quit(): void;
  click(): void;
}

/** Menu de pausa da bateria (Esc). O tempo da onda fica parado enquanto ele está aberto. */
export function pauseMenu(a: PauseActions): HTMLElement {
  const m = el(`
    <div class="modal-bg">
      <div class="panel modal" role="dialog" aria-label="Pausa" style="width:min(420px, calc(100vw - 32px))">
        <div class="header"><h2>${icon('pause')} Pausa</h2><span class="kbd">Esc</span></div>
        <div class="menu-buttons" style="width:auto">
          <button class="btn" data-action="resume">${icon('play')} Continuar</button>
          <button class="btn secondary" data-action="camera">${icon('gear')} <span data-label="camera"></span></button>
          <button class="btn secondary" data-action="sound">${icon('gear')} <span data-label="sound"></span></button>
          <button class="btn secondary" data-action="help">${icon('help')} Como jogar</button>
          <button class="btn danger" data-action="quit">${icon('close')} Sair da bateria</button>
        </div>
      </div>
    </div>`);
  const labels = () => {
    const p = state.save.prefs;
    m.querySelector<HTMLElement>('[data-label=camera]')!.textContent = `Câmera: ${p.camera === 'lateral' ? 'lateral' : 'próxima'}`;
    m.querySelector<HTMLElement>('[data-label=sound]')!.textContent = `Som: ${p.sound ? 'ligado' : 'desligado'}`;
  };
  bind(m, {
    resume: () => a.resume(),
    help: () => a.help(),
    camera: () => {
      a.camera();
      labels();
    },
    sound: () => {
      a.sound();
      labels();
    },
    quit: () => a.quit(),
  }, () => a.click());
  labels();
  setTimeout(() => m.querySelector<HTMLElement>('[data-action=resume]')?.focus(), 0);
  return m;
}
