// Ajudantes mínimos para montar a interface em HTML sem framework.

export function el<T extends HTMLElement = HTMLElement>(html: string): T {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as T;
}

export function esc(s: string | number): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function signed(n: number, digits = 0): string {
  const v = n.toFixed(digits);
  return n > 0 ? `+${v}` : v;
}

export function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

export function hexColor(c: number): string {
  return `#${c.toString(16).padStart(6, '0')}`;
}

/** Liga um clique a cada elemento com data-action dentro de root. */
export function bind(root: HTMLElement, handlers: Record<string, (el: HTMLElement) => void>, onAny?: () => void) {
  root.querySelectorAll<HTMLElement>('[data-action]').forEach((node) => {
    node.addEventListener('click', (e) => {
      e.stopPropagation();
      if ((node as HTMLButtonElement).disabled || node.classList.contains('locked')) return;
      const fn = handlers[node.dataset.action!];
      if (fn) {
        onAny?.();
        fn(node);
      }
    });
  });
}
