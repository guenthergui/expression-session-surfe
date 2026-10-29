import './ui/style.css';
import { App } from './game/App';

// Ponto de entrada: monta o jogo e roda o laço principal com tempo real
// (delta em segundos), para animações e comandos não dependerem da taxa de quadros.

const view = document.getElementById('view')!;
const ui = document.getElementById('ui')!;
const loading = document.getElementById('loading')!;
const fill = document.getElementById('loading-fill')!;
const text = document.getElementById('loading-text')!;

function fail(err: unknown) {
  text.textContent = `Não foi possível iniciar o jogo: ${err instanceof Error ? err.message : String(err)}. Verifique se o navegador tem WebGL ativado.`;
  fill.style.width = '100%';
  fill.style.background = '#ff6262';
  console.error(err);
}

function start() {
  fill.style.width = '40%';
  let app: App;
  try {
    app = new App(view, ui);
  } catch (e) {
    fail(e);
    return;
  }
  fill.style.width = '100%';
  setTimeout(() => loading.classList.add('done'), 250);

  let last = performance.now();
  const step = (dtSeconds: number) => app.frame(Math.min(0.05, Math.max(0, dtSeconds)));
  let paused = false;
  const loop = (now: number) => {
    if (!paused) step((now - last) / 1000);
    last = now;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame((now) => {
    last = now;
    loop(now);
  });

  // Só em desenvolvimento: permite inspecionar e avançar o jogo pelo console.
  if (import.meta.env.DEV) {
    // Cenas de validação visual: só com ?lab no endereço, para não aparecerem por acidente.
    const lab = new URLSearchParams(location.search).has('lab')
      ? import('./dev/Lab').then((m) => m.mountLab(app))
      : null;
    (window as unknown as Record<string, unknown>).__es = {
      app,
      lab,
      /** Avança o jogo manualmente em passos de 1/60 s (útil com a aba em segundo plano). */
      step(ms: number) {
        const n = Math.ceil(ms / (1000 / 60));
        for (let i = 0; i < n; i++) step(1 / 60);
      },
      /** Congela o laço automático, para inspecionar um quadro. */
      pause(on = true) {
        paused = on;
      },
    };
  }
}

setTimeout(start, 30);
