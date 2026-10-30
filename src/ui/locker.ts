import {
  DEFAULT_LOOK,
  REGION_LABELS,
  TATTOO_REGIONS,
  cloneLook,
  itemsOf,
  tattooCovered,
  type CatalogItem,
  type Category,
  type GarmentStyle,
  type Look,
  type TattooRegion,
} from '../data/cosmetics';
import { TRANSPARENT_FIN_UNLOCK, isUnlocked, transparentAllowed, unlockHint, unlockText } from '../core/unlocks';
import { state } from '../game/state';
import { bind, el, esc, hexColor } from './dom';
import { icon } from './icons';
import { confirmModal } from './screens';

// Vestiário: prévia 3D com órbita e zoom à esquerda, categorias à direita.
// As escolhas são feitas numa cópia da aparência e aparecem na hora no modelo;
// só "Salvar" grava no progresso. "Cancelar" (ou Esc) volta ao que estava salvo.

export type LockerFocus = 'rosto' | 'corpo' | 'prancha' | 'quilhas';
export type LockerView = 'frente' | 'costas' | 'lado';

export interface LockerHost {
  lockerPreview(look: Look): void;
  lockerFocus(focus: LockerFocus): void;
  lockerOrbit(dYaw: number, dPitch: number, zoom: number): void;
  lockerView(view: LockerView): void;
  saveLook(look: Look): void;
  go(screen: 'menu'): void;
  click(): void;
}

type TabId = 'pele' | 'cabelo' | 'roupa' | 'tatuagem' | 'acessorio' | 'prancha' | 'quilhas';
type Status = 'todos' | 'equipados' | 'liberados' | 'bloqueados';
type Piece = 'suit' | 'top' | 'bottom';

const TABS: { id: TabId; label: string; icon: string; focus: LockerFocus }[] = [
  { id: 'pele', label: 'Pele e rosto', icon: 'user', focus: 'rosto' },
  { id: 'cabelo', label: 'Cabelo', icon: 'user', focus: 'rosto' },
  { id: 'roupa', label: 'Roupa', icon: 'shirt', focus: 'corpo' },
  { id: 'tatuagem', label: 'Tatuagens', icon: 'wave', focus: 'corpo' },
  { id: 'acessorio', label: 'Acessórios', icon: 'check', focus: 'corpo' },
  { id: 'prancha', label: 'Prancha', icon: 'board', focus: 'prancha' },
  { id: 'quilhas', label: 'Quilhas', icon: 'fin', focus: 'quilhas' },
];

const STATUS_LABELS: Record<Status, string> = { todos: 'Todos', equipados: 'Equipados', liberados: 'Liberados', bloqueados: 'Bloqueados' };

const TAG_LABELS: Record<string, string> = {
  frio: 'Subtom frio', quente: 'Subtom quente', neutro: 'Neutro', oliva: 'Oliva',
  natural: 'Naturais', fantasia: 'Fantasia',
  neutras: 'Neutras', quentes: 'Quentes', frias: 'Frias', especiais: 'Especiais',
  curto: 'Curtos', medio: 'Médios', longo: 'Longos', preso: 'Presos', cacheado: 'Cacheados', volume: 'Volume', ousado: 'Ousados',
  lycra: 'Lycra', tecido: 'Tecido', avulsa: 'Avulsa',
  traço: 'Traço', mar: 'Mar', símbolo: 'Símbolos', flor: 'Flores',
};

const PIECE_LABELS: Record<Piece, string> = { suit: 'Neoprene', top: 'Parte de cima', bottom: 'Bermuda' };

export function lockerScreen(host: LockerHost): HTMLElement {
  let draft = cloneLook(state.save.look);
  let tab: TabId = 'roupa';
  let status: Status = 'todos';
  const tagFilter: Record<string, string> = {};
  let piece: Piece = draft.suit !== 'neo-nenhum' ? 'suit' : 'bottom';
  let region: TattooRegion = draft.tattoos[0]?.region ?? 'antebracoEsq';
  const saved = () => JSON.stringify(state.save.look);
  const dirty = () => JSON.stringify(draft) !== saved();
  const unlocked = (id: string) => isUnlocked(id, state.save);

  const root = el(`
    <div class="locker">
      <div class="locker-stage" data-stage>
        <div class="header" style="justify-content:flex-start">
          <button class="btn secondary small" data-action="cancel">${icon('back')} Menu</button>
        </div>
        <div class="view-controls panel" style="padding:8px;width:fit-content;border-radius:14px">
          <button class="btn secondary small" data-action="view" data-view="frente">Frente</button>
          <button class="btn secondary small" data-action="view" data-view="lado">Lado</button>
          <button class="btn secondary small" data-action="view" data-view="costas">Costas</button>
          <button class="btn secondary small" data-action="rot" data-d="-1" aria-label="Girar para a esquerda">${icon('rotateLeft')}</button>
          <button class="btn secondary small" data-action="rot" data-d="1" aria-label="Girar para a direita">${icon('rotateRight')}</button>
          <button class="btn secondary small" data-action="zoom" data-z="0.82" aria-label="Aproximar">${icon('zoomIn')}</button>
          <button class="btn secondary small" data-action="zoom" data-z="1.22" aria-label="Afastar">${icon('zoomOut')}</button>
          <span class="sub" style="align-self:center;padding:0 6px">Arraste para girar · roda do mouse para zoom</span>
        </div>
      </div>
      <div class="panel locker-panel">
        <div class="locker-head">
          <div><h1>Vestiário</h1><div class="sub">As mudanças aparecem na hora. Salve para usar nas baterias.</div></div>
          <div class="tabs" role="tablist" data-slot="tabs"></div>
          <div class="filters" data-slot="filters"></div>
        </div>
        <div class="locker-body" data-slot="body"></div>
        <div class="locker-foot">
          <span class="sub" data-slot="dirty"></span>
          <div class="actions">
            <button class="btn secondary small" data-action="reset">${icon('undo')} Padrão</button>
            <button class="btn secondary" data-action="cancel">Cancelar</button>
            <button class="btn" data-action="save">${icon('check')} Salvar</button>
          </div>
        </div>
      </div>
    </div>`);

  const body = root.querySelector<HTMLElement>('[data-slot=body]')!;
  const preview = () => {
    host.lockerPreview(draft);
    root.querySelector<HTMLElement>('[data-slot=dirty]')!.innerHTML = dirty() ? '<span class="warn">Alterações não salvas</span>' : 'Tudo salvo';
  };

  // ---------- Órbita da prévia ----------
  const stage = root.querySelector<HTMLElement>('[data-stage]')!;
  let drag: { x: number; y: number } | null = null;
  stage.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('button')) return;
    drag = { x: e.clientX, y: e.clientY };
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag) return;
    host.lockerOrbit(-(e.clientX - drag.x) * 0.01, (e.clientY - drag.y) * 0.006, 1);
    drag = { x: e.clientX, y: e.clientY };
  });
  const endDrag = () => (drag = null);
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    host.lockerOrbit(0, 0, e.deltaY > 0 ? 1.1 : 0.9);
  }, { passive: false });

  // ---------- Grupos de itens ----------

  /** Ações de escolha de cada grupo, preenchidas a cada renderização. */
  let setters: Record<string, (id: string) => void> = {};

  const passes = (key: string, item: CatalogItem, current: string) => {
    if (status === 'equipados' && item.id !== current) return false;
    if (status === 'liberados' && !unlocked(item.id)) return false;
    if (status === 'bloqueados' && unlocked(item.id)) return false;
    const tag = tagFilter[key];
    return !tag || item.tags.includes(tag);
  };

  const tagRow = (key: string, items: CatalogItem[]) => {
    const tags = [...new Set(items.flatMap((i) => i.tags))];
    if (tags.length < 2) return '';
    const cur = tagFilter[key] ?? '';
    return `<div class="filters">${['', ...tags].map((t) => `<button class="tab ${cur === t ? 'active' : ''}" data-action="tag" data-key="${key}" data-tag="${t}">${t ? esc(TAG_LABELS[t] ?? t) : 'Todas'}</button>`).join('')}</div>`;
  };

  const lockInfo = (item: CatalogItem) => `${icon('lock')} ${esc(unlockText(item.unlock))}`;

  /** Grupo em blocos com nome (estilos, peças, estampas). */
  const tiles = (title: string, key: string, category: Category, current: string, set: (id: string) => void, extra: { id: string; name: string }[] = []) => {
    setters[key] = set;
    const items = itemsOf(category);
    const shown = items.filter((i) => passes(key, i, current));
    const extraShown = status === 'bloqueados' ? [] : extra.filter((x) => status !== 'equipados' || x.id === current);
    const cells = [
      ...extraShown.map((x) => `<button class="tile ${x.id === current ? 'selected' : ''}" data-action="pick" data-key="${key}" data-id="${x.id}" aria-pressed="${x.id === current}"><span class="tile-name">${esc(x.name)}</span></button>`),
      ...shown.map((i) => {
        const ok = unlocked(i.id);
        return `<button class="tile ${i.id === current ? 'selected' : ''}" data-action="pick" data-key="${key}" data-id="${i.id}" ${ok ? '' : 'disabled'} aria-pressed="${i.id === current}" title="${esc(ok ? i.name : unlockHint(i.unlock))}">
          ${i.color !== undefined ? `<span class="preview-chip" style="background:${hexColor(i.color)}"></span>` : ''}
          <span class="tile-name">${esc(i.name)}</span>
          ${ok ? '' : `<span class="tile-req">${lockInfo(i)}</span>`}
        </button>`;
      }),
    ];
    return `<div class="group"><div class="group-title">${esc(title)}</div>${tagRow(key, items)}
      ${cells.length ? `<div class="tiles">${cells.join('')}</div>` : '<div class="sub">Nada neste filtro.</div>'}</div>`;
  };

  /** Grupo de cores em amostras redondas. */
  const swatches = (title: string, key: string, category: Category, current: string, set: (id: string) => void, extra?: { id: string; name: string }) => {
    setters[key] = set;
    const items = itemsOf(category);
    const shown = items.filter((i) => passes(key, i, current));
    const name = items.find((i) => i.id === current)?.name ?? extra?.name ?? '';
    const cells = shown.map((i) => {
      const ok = unlocked(i.id);
      const label = ok ? i.name : `${i.name} (bloqueado: ${unlockText(i.unlock)})`;
      return `<button class="swatch-btn ${i.id === current ? 'selected' : ''}" style="background:${hexColor(i.color ?? 0x888888)}" data-action="pick" data-key="${key}" data-id="${i.id}" ${ok ? '' : 'disabled'} title="${esc(ok ? i.name : unlockHint(i.unlock))}" aria-label="${esc(label)}" aria-pressed="${i.id === current}"></button>`;
    });
    if (extra && status !== 'bloqueados') {
      cells.unshift(`<button class="tile ${current === extra.id ? 'selected' : ''}" style="min-height:34px;padding:6px 12px" data-action="pick" data-key="${key}" data-id="${extra.id}"><span class="tile-name">${esc(extra.name)}</span></button>`);
    }
    const locked = shown.filter((i) => !unlocked(i.id));
    return `<div class="group"><div class="group-title">${esc(title)} <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">· ${esc(name)}</span></div>${tagRow(key, items)}
      ${cells.length ? `<div class="swatches">${cells.join('')}</div>` : '<div class="sub">Nada neste filtro.</div>'}
      ${locked.length ? `<div class="sub">${icon('lock')} ${locked.map((i) => `${esc(i.name)}: ${esc(unlockText(i.unlock))}`).join(' · ')}</div>` : ''}</div>`;
  };

  /** Escolha entre duas opções que não são itens do catálogo (ligado/desligado). */
  const toggle = (title: string, key: string, options: { id: string; name: string; locked?: string }[], current: string, set: (id: string) => void) => {
    setters[key] = set;
    return `<div class="group"><div class="group-title">${esc(title)}</div><div class="tiles">${options.map((o) => `
      <button class="tile ${o.id === current ? 'selected' : ''}" data-action="pick" data-key="${key}" data-id="${o.id}" ${o.locked ? 'disabled' : ''} aria-pressed="${o.id === current}">
        <span class="tile-name">${esc(o.name)}</span>${o.locked ? `<span class="tile-req">${icon('lock')} ${esc(o.locked)}</span>` : ''}
      </button>`).join('')}</div></div>`;
  };

  const styleOf = (p: Piece): GarmentStyle => (p === 'suit' ? draft.suitStyle : p === 'top' ? draft.topStyle : draft.bottomStyle);

  const coveredNote = () => {
    const hidden = draft.tattoos.filter((t) => tattooCovered(draft, t));
    return hidden.length ? `<div class="sub warn">${hidden.length === 1 ? '1 tatuagem fica coberta' : `${hidden.length} tatuagens ficam cobertas`} pela roupa atual.</div>` : '';
  };

  const sections: Record<TabId, () => string> = {
    pele: () => [
      swatches('Tom de pele', 'skin', 'pele', draft.skin, (id) => (draft.skin = id)),
      swatches('Olhos', 'eyes', 'olhos', draft.eyes, (id) => (draft.eyes = id)),
      tiles('Sobrancelhas', 'brows', 'sobrancelha', draft.brows, (id) => (draft.brows = id)),
      tiles('Barba e bigode', 'beard', 'barba', draft.beard, (id) => (draft.beard = id)),
    ].join(''),
    cabelo: () => [
      tiles('Corte', 'hair', 'cabelo', draft.hair, (id) => (draft.hair = id)),
      swatches('Cor do cabelo e das sobrancelhas', 'hairColor', 'corCabelo', draft.hairColor, (id) => (draft.hairColor = id)),
    ].join(''),
    roupa: () => {
      const parts = [tiles('Neoprene', 'suit', 'neoprene', draft.suit, (id) => {
        draft.suit = id;
        piece = id === 'neo-nenhum' ? 'bottom' : 'suit';
      })];
      if (draft.suit === 'neo-nenhum') {
        parts.push(tiles('Parte de cima', 'top', 'parteCima', draft.top, (id) => {
          draft.top = id;
          if (id === 'top-nenhum' && piece === 'top') piece = 'bottom';
        }));
        parts.push(tiles('Bermuda', 'bottom', 'bermuda', draft.bottom, (id) => (draft.bottom = id)));
      }
      const pieces: Piece[] = draft.suit !== 'neo-nenhum' ? ['suit'] : draft.top === 'top-nenhum' ? ['bottom'] : ['bottom', 'top'];
      if (!pieces.includes(piece)) piece = pieces[0];
      const st = styleOf(piece);
      parts.push(`<div class="group"><div class="group-title">Cores e estampa da peça</div>
        <div class="filters">${pieces.map((p) => `<button class="tab ${p === piece ? 'active' : ''}" data-action="piece" data-piece="${p}">${PIECE_LABELS[p]}</button>`).join('')}</div></div>`);
      parts.push(tiles('Estampa', 'pattern', 'estampa', st.pattern, (id) => (st.pattern = id)));
      const zone = (i: 0 | 1 | 2, label: string) => swatches(label, `color${i}`, 'cor', st.colors[i], (id) => (st.colors[i] = id));
      parts.push(zone(0, 'Cor principal'), zone(1, 'Cor da estampa'), zone(2, 'Detalhes, barras e painéis'));
      parts.push(coveredNote());
      return parts.join('');
    },
    tatuagem: () => {
      const current = draft.tattoos.find((t) => t.region === region);
      const regions = `<div class="group"><div class="group-title">Região · ${draft.tattoos.length} de ${TATTOO_REGIONS.length} com tatuagem</div>
        <div class="filters">${TATTOO_REGIONS.map((r) => {
          const has = draft.tattoos.some((t) => t.region === r);
          return `<button class="tab ${r === region ? 'active' : ''}" data-action="region" data-region="${r}">${has ? '● ' : ''}${esc(REGION_LABELS[r])}</button>`;
        }).join('')}</div></div>`;
      const designs = tiles(`Desenho em ${REGION_LABELS[region].toLowerCase()}`, 'tattoo', 'tatuagem', current?.design ?? '', (id) => {
        draft.tattoos = draft.tattoos.filter((t) => t.region !== region);
        if (id) draft.tattoos.push({ design: id, region, size: current?.size ?? 1, rotation: current?.rotation ?? 0 });
      }, [{ id: '', name: 'Nenhuma' }]);
      const sliders = current ? `<div class="group">
        <div class="field-row"><span class="muted">Tamanho</span><input type="range" min="60" max="140" step="5" value="${Math.round(current.size * 100)}" data-input="size" aria-label="Tamanho da tatuagem"/></div>
        <div class="field-row"><span class="muted">Rotação</span><input type="range" min="-180" max="180" step="5" value="${current.rotation}" data-input="rotation" aria-label="Rotação da tatuagem"/></div>
        ${tattooCovered(draft, current) ? '<div class="sub warn">Esta tatuagem fica coberta pela roupa atual. Escolha uma roupa mais curta para mostrar.</div>' : '<div class="sub">A tatuagem é pintada na pele e acompanha o movimento do corpo.</div>'}
      </div>` : '';
      const clear = draft.tattoos.length ? '<div><button class="btn danger small" data-action="clearTattoos">Remover todas</button></div>' : '';
      return regions + designs + sliders + clear;
    },
    acessorio: () => tiles('Acessório', 'accessory', 'acessorio', draft.accessory, (id) => (draft.accessory = id)),
    prancha: () => [
      '<div class="sub">Só aparência: a prancha escolhida na preparação define o desempenho.</div>',
      tiles('Arte', 'art', 'arte', draft.board.art, (id) => (draft.board.art = id)),
      swatches('Cor do deck', 'deck', 'cor', draft.board.deck, (id) => (draft.board.deck = id)),
      swatches('Cor do fundo', 'boardBottom', 'cor', draft.board.bottom, (id) => (draft.board.bottom = id)),
      swatches('Cor da arte', 'artColor', 'cor', draft.board.artColor, (id) => (draft.board.artColor = id)),
      swatches('Bico e rabeta', 'noseTail', 'cor', draft.board.noseTail, (id) => (draft.board.noseTail = id), { id: '', name: 'Sem tingimento' }),
      tiles('Acabamento', 'boardFinish', 'acabamento', draft.board.finish, (id) => (draft.board.finish = id)),
    ].join(''),
    quilhas: () => {
      const canClear = transparentAllowed(state.save);
      return [
        '<div class="sub">Só aparência: o conjunto de quilhas (thruster, twin, quad) vem da preparação.</div>',
        tiles('Perfil', 'finProfile', 'perfilQuilha', draft.fins.profile, (id) => (draft.fins.profile = id)),
        swatches('Cor', 'finColor', 'cor', draft.fins.color, (id) => (draft.fins.color = id)),
        toggle('Pintura', 'twoTone', [{ id: 'uma', name: 'Uma cor' }, { id: 'duas', name: 'Duas cores (ponta)' }], draft.fins.twoTone ? 'duas' : 'uma', (id) => (draft.fins.twoTone = id === 'duas')),
        draft.fins.twoTone ? swatches('Cor da ponta', 'finColor2', 'cor', draft.fins.color2, (id) => (draft.fins.color2 = id)) : '',
        toggle('Material', 'transparent', [{ id: 'opaca', name: 'Opaca' }, { id: 'cristal', name: 'Resina transparente', locked: canClear ? undefined : unlockText(TRANSPARENT_FIN_UNLOCK) }], draft.fins.transparent ? 'cristal' : 'opaca', (id) => (draft.fins.transparent = id === 'cristal')),
        tiles('Acabamento', 'finFinish', 'acabamento', draft.fins.finish, (id) => (draft.fins.finish = id)),
      ].join('');
    },
  };

  const render = () => {
    const tabsEl = root.querySelector<HTMLElement>('[data-slot=tabs]')!;
    tabsEl.innerHTML = TABS.map((t) => `<button class="tab ${t.id === tab ? 'active' : ''}" role="tab" aria-selected="${t.id === tab}" data-action="tab" data-tab="${t.id}">${icon(t.icon)} ${esc(t.label)}</button>`).join('');
    root.querySelector<HTMLElement>('[data-slot=filters]')!.innerHTML = (Object.keys(STATUS_LABELS) as Status[])
      .map((st) => `<button class="tab ${st === status ? 'active' : ''}" data-action="status" data-status="${st}">${STATUS_LABELS[st]}</button>`).join('');
    setters = {};
    const scroll = body.scrollTop;
    body.innerHTML = sections[tab]();
    body.scrollTop = scroll;
    const handlers = {
      tab: (n: HTMLElement) => {
        tab = n.dataset.tab as TabId;
        body.scrollTop = 0;
        host.lockerFocus(TABS.find((t) => t.id === tab)!.focus);
        render();
      },
      status: (n: HTMLElement) => {
        status = n.dataset.status as Status;
        render();
      },
      tag: (n: HTMLElement) => {
        tagFilter[n.dataset.key!] = n.dataset.tag!;
        render();
      },
      pick: (n: HTMLElement) => {
        setters[n.dataset.key!]?.(n.dataset.id!);
        preview();
        render();
      },
      piece: (n: HTMLElement) => {
        piece = n.dataset.piece as Piece;
        render();
      },
      region: (n: HTMLElement) => {
        region = n.dataset.region as TattooRegion;
        render();
      },
      clearTattoos: () => {
        draft.tattoos = [];
        preview();
        render();
      },
    };
    bind(tabsEl, handlers, () => host.click());
    bind(root.querySelector<HTMLElement>('[data-slot=filters]')!, handlers, () => host.click());
    bind(body, handlers, () => host.click());
    // Tamanho e rotação da tatuagem: atualizam o modelo durante o arraste.
    body.querySelectorAll<HTMLInputElement>('[data-input]').forEach((input) => {
      input.addEventListener('input', () => {
        const t = draft.tattoos.find((x) => x.region === region);
        if (!t) return;
        if (input.dataset.input === 'size') t.size = Number(input.value) / 100;
        else t.rotation = Number(input.value);
        preview();
      });
    });
  };

  const cancel = () => {
    if (!dirty()) return host.go('menu');
    confirmModal(root, 'Descartar alterações?', 'O visual volta a ser o último que você salvou.', 'Descartar', () => host.go('menu'));
  };

  bind(root.querySelector<HTMLElement>('.locker-foot')!, {
    save: () => {
      host.saveLook(draft);
      draft = cloneLook(state.save.look);
      preview();
      toast(root, 'Visual salvo');
    },
    cancel,
    reset: () => {
      draft = cloneLook(DEFAULT_LOOK);
      piece = 'suit';
      preview();
      render();
    },
  }, () => host.click());
  bind(stage, {
    cancel,
    view: (n) => host.lockerView(n.dataset.view as LockerView),
    rot: (n) => host.lockerOrbit(Number(n.dataset.d) * 0.4, 0, 1),
    zoom: (n) => host.lockerOrbit(0, 0, Number(n.dataset.z)),
  }, () => host.click());

  (root as HTMLElement & { cancel?: () => void }).cancel = cancel;
  render();
  preview();
  return root;
}

function toast(parent: HTMLElement, text: string) {
  const t = el(`<div class="toast" role="status">${icon('check')} ${esc(text)}</div>`);
  parent.appendChild(t);
  setTimeout(() => t.remove(), 1800);
}
