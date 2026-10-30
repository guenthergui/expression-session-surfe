import * as THREE from 'three';

// Pintura procedural da aparência: estampas de roupa, tatuagens e arte da
// prancha. Tudo é desenhado em canvas no próprio jogo (sem arquivos externos).
// As estampas e tatuagens são desenhadas em metros e convertidas para pixels
// com a escala de cada parte do corpo, para não esticarem.

export type Ctx = CanvasRenderingContext2D;

export function css(c: number, a = 1): string {
  return `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
}

/** Gerador pseudoaleatório para as estampas saírem sempre iguais. */
export function rand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ---------- Tatuagens ----------

const INK = 'rgba(20,24,34,0.9)';

function star(g: Ctx, x: number, y: number, r: number) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}

/** Cada desenho ocupa o quadrado de -0,5 a 0,5. */
const DESIGNS: Record<string, (g: Ctx) => void> = {
  tribal: (g) => {
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(0, -0.5);
      g.bezierCurveTo(s * 0.45, -0.3, s * 0.5, 0.1, s * 0.12, 0.5);
      g.bezierCurveTo(s * 0.25, 0.1, s * 0.2, -0.2, 0, -0.32);
      g.fill();
      g.beginPath();
      g.moveTo(s * 0.18, -0.05);
      g.quadraticCurveTo(s * 0.48, -0.12, s * 0.5, -0.42);
      g.quadraticCurveTo(s * 0.36, -0.18, s * 0.18, -0.05);
      g.fill();
    }
  },
  ondas: (g) => {
    g.lineWidth = 0.07;
    for (let row = 0; row < 3; row++) {
      g.beginPath();
      for (let i = 0; i <= 40; i++) {
        const x = -0.5 + i / 40;
        const y = -0.25 + row * 0.25 + Math.sin(x * 14 + row) * 0.07;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
  },
  sol: (g) => {
    g.beginPath();
    g.arc(0, 0, 0.2, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 0.05;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.beginPath();
      g.moveTo(Math.cos(a) * 0.27, Math.sin(a) * 0.27);
      g.lineTo(Math.cos(a) * (i % 2 ? 0.4 : 0.48), Math.sin(a) * (i % 2 ? 0.4 : 0.48));
      g.stroke();
    }
  },
  lua: (g) => {
    g.beginPath();
    g.arc(0, 0, 0.42, Math.PI * 0.35, Math.PI * 1.65);
    g.arc(0.14, 0, 0.33, Math.PI * 1.55, Math.PI * 0.45, true);
    g.closePath();
    g.fill();
    star(g, 0.3, -0.3, 0.08);
  },
  estrelas: (g) => {
    star(g, -0.2, -0.18, 0.2);
    star(g, 0.22, 0.05, 0.15);
    star(g, -0.05, 0.32, 0.1);
  },
  ancora: (g) => {
    g.lineWidth = 0.07;
    g.beginPath();
    g.arc(0, -0.38, 0.08, 0, Math.PI * 2);
    g.moveTo(0, -0.3);
    g.lineTo(0, 0.42);
    g.moveTo(-0.2, -0.16);
    g.lineTo(0.2, -0.16);
    g.moveTo(-0.38, 0.12);
    g.quadraticCurveTo(-0.3, 0.45, 0, 0.42);
    g.quadraticCurveTo(0.3, 0.45, 0.38, 0.12);
    g.stroke();
  },
  rosa: (g) => {
    g.lineWidth = 0.045;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.arc(0, -0.1, 0.07 + i * 0.07, Math.PI * (0.2 + i * 0.3), Math.PI * (1.6 + i * 0.3));
      g.stroke();
    }
    g.beginPath();
    g.moveTo(0, 0.2);
    g.quadraticCurveTo(0.05, 0.35, 0, 0.5);
    g.stroke();
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(s * 0.17, 0.33, 0.12, 0.05, s * -0.5, 0, Math.PI * 2);
      g.fill();
    }
  },
  concha: (g) => {
    g.lineWidth = 0.045;
    g.beginPath();
    g.moveTo(-0.45, 0.1);
    g.quadraticCurveTo(0, -0.7, 0.45, 0.1);
    g.lineTo(0.1, 0.38);
    g.lineTo(-0.1, 0.38);
    g.closePath();
    g.stroke();
    for (let i = -3; i <= 3; i++) {
      g.beginPath();
      g.moveTo(0, 0.36);
      g.lineTo(i * 0.13, -0.2 + Math.abs(i) * 0.08);
      g.stroke();
    }
  },
  coqueiro: (g) => {
    g.lineWidth = 0.06;
    g.beginPath();
    g.moveTo(-0.05, 0.5);
    g.quadraticCurveTo(0.12, 0.1, 0, -0.2);
    g.stroke();
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI * 0.95 + (i / 5) * Math.PI * 0.9;
      g.beginPath();
      g.ellipse(Math.cos(a) * 0.22, -0.2 + Math.sin(a) * 0.12, 0.25, 0.05, a, 0, Math.PI * 2);
      g.fill();
    }
  },
  montanha: (g) => {
    g.lineWidth = 0.05;
    g.beginPath();
    g.moveTo(-0.5, 0.35);
    g.lineTo(-0.18, -0.25);
    g.lineTo(0.02, 0.08);
    g.lineTo(0.2, -0.38);
    g.lineTo(0.5, 0.35);
    g.closePath();
    g.stroke();
    g.beginPath();
    g.arc(-0.3, -0.35, 0.08, 0, Math.PI * 2);
    g.stroke();
  },
  mandala: (g) => {
    g.lineWidth = 0.03;
    for (let ring = 1; ring <= 3; ring++) {
      const n = 6 * ring;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        g.beginPath();
        g.ellipse(Math.cos(a) * ring * 0.13, Math.sin(a) * ring * 0.13, 0.06, 0.025, a, 0, Math.PI * 2);
        g.stroke();
      }
    }
    g.beginPath();
    g.arc(0, 0, 0.05, 0, Math.PI * 2);
    g.fill();
  },
  raio: (g) => {
    g.beginPath();
    g.moveTo(0.1, -0.5);
    g.lineTo(-0.25, 0.05);
    g.lineTo(0, 0.05);
    g.lineTo(-0.12, 0.5);
    g.lineTo(0.28, -0.08);
    g.lineTo(0.03, -0.08);
    g.closePath();
    g.fill();
  },
  pena: (g) => {
    g.lineWidth = 0.035;
    g.beginPath();
    g.moveTo(-0.3, 0.45);
    g.quadraticCurveTo(0, 0, 0.3, -0.45);
    g.stroke();
    for (let i = 1; i < 12; i++) {
      const t = i / 12;
      const x = -0.3 + 0.6 * t;
      const y = 0.45 - 0.9 * t + Math.sin(t * Math.PI) * -0.0;
      const len = 0.18 * Math.sin(t * Math.PI);
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + s * len * 0.8 - len * 0.4, y + s * len * 0.8 - len * 0.2);
        g.stroke();
      }
    }
  },
  tubarao: (g) => {
    g.beginPath();
    g.moveTo(-0.3, 0.15);
    g.quadraticCurveTo(0.05, -0.15, 0.1, -0.45);
    g.quadraticCurveTo(0.2, -0.1, 0.35, 0.15);
    g.closePath();
    g.fill();
    g.lineWidth = 0.05;
    g.beginPath();
    for (let i = 0; i <= 30; i++) {
      const x = -0.5 + i / 30;
      const y = 0.25 + Math.sin(x * 18) * 0.04;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  },
};

export const TATTOO_DESIGNS = Object.keys(DESIGNS);

/**
 * Desenha uma tatuagem centrada em (x, y) com o tamanho em metros, a escala da
 * parte do corpo em pixels por metro e a rotação em graus. O traço é "misturado" à pele (multiply), como tinta.
 */
export function drawTattoo(g: Ctx, design: string, x: number, y: number, sizeMeters: number, ppmU: number, ppmV: number, rotationDeg: number) {
  const fn = DESIGNS[design];
  if (!fn) return;
  g.save();
  g.translate(x, y);
  // Converte para metros antes de girar, para a rotação não deformar o desenho.
  g.scale(ppmU, ppmV);
  g.rotate((rotationDeg * Math.PI) / 180);
  g.scale(sizeMeters, sizeMeters);
  g.fillStyle = INK;
  g.strokeStyle = INK;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.globalCompositeOperation = 'multiply';
  fn(g);
  g.restore();
}

// ---------- Estampas ----------

export interface PatternRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Pixels por metro na horizontal (volta) e na vertical (comprimento). */
  ppmU: number;
  ppmV: number;
  /** Semente para estampas aleatórias (floral, camuflado). */
  seed: number;
  /** Coluna em pixels do lado de fora da peça (para a faixa lateral). */
  outerX: number;
}

/** Preenche o retângulo com a estampa, usando cor principal, secundária e de detalhe. */
export function drawPattern(g: Ctx, pattern: string, c: [number, number, number], r: PatternRect) {
  const w = r.x1 - r.x0;
  const h = r.y1 - r.y0;
  if (w <= 0 || h <= 0) return;
  g.save();
  g.beginPath();
  g.rect(r.x0, r.y0, w, h);
  g.clip();
  g.fillStyle = css(c[0]);
  g.fillRect(r.x0, r.y0, w, h);
  const rnd = rand(r.seed);
  const mU = r.ppmU;
  const mV = r.ppmV;
  switch (pattern) {
    case 'estampa-listras': {
      const period = 0.06 * mV;
      g.fillStyle = css(c[1]);
      for (let y = r.y0; y < r.y1; y += period) g.fillRect(r.x0, y, w, period * 0.45);
      g.fillStyle = css(c[2]);
      for (let y = r.y0 + period * 0.5; y < r.y1; y += period) g.fillRect(r.x0, y, w, period * 0.08);
      break;
    }
    case 'estampa-faixa-lateral': {
      const band = 0.05 * mU;
      for (const x of [r.outerX, r.outerX + (r.x1 - r.x0)]) {
        g.fillStyle = css(c[1]);
        g.fillRect(x - band / 2, r.y0, band, h);
        g.fillStyle = css(c[2]);
        g.fillRect(x - band / 2 - 0.006 * mU, r.y0, 0.006 * mU, h);
        g.fillRect(x + band / 2, r.y0, 0.006 * mU, h);
      }
      break;
    }
    case 'estampa-blocos': {
      g.fillStyle = css(c[1]);
      g.fillRect(r.x0, r.y0 + h * 0.55, w, h * 0.45);
      g.fillStyle = css(c[2]);
      g.fillRect(r.x0, r.y0 + h * 0.55 - 0.006 * mV, w, 0.012 * mV);
      break;
    }
    case 'estampa-floral': {
      const n = Math.ceil((w / mU) * (h / mV) * 220);
      for (let i = 0; i < n; i++) {
        const x = r.x0 + rnd() * w;
        const y = r.y0 + rnd() * h;
        const s = (0.018 + rnd() * 0.016) * mU;
        g.fillStyle = css(c[1]);
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2 + rnd();
          g.beginPath();
          g.ellipse(x + Math.cos(a) * s * 0.9, y + Math.sin(a) * s * 0.9 * (mV / mU), s * 0.75, s * 0.45 * (mV / mU), a, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = css(c[2]);
        g.beginPath();
        g.ellipse(x, y, s * 0.35, s * 0.35 * (mV / mU), 0, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
    case 'estampa-geometrico': {
      const s = 0.05;
      for (let y = r.y0, row = 0; y < r.y1; y += s * mV, row++) {
        for (let x = r.x0 - (row % 2) * s * mU * 0.5, col = 0; x < r.x1; x += s * mU, col++) {
          g.fillStyle = css((row + col) % 3 === 0 ? c[2] : c[1]);
          g.beginPath();
          g.moveTo(x, y + s * mV);
          g.lineTo(x + s * mU * 0.5, y);
          g.lineTo(x + s * mU, y + s * mV);
          g.closePath();
          if ((row + col) % 2 === 0) g.fill();
        }
      }
      break;
    }
    case 'estampa-camuflado': {
      const n = Math.ceil((w / mU) * (h / mV) * 160);
      for (let i = 0; i < n; i++) {
        g.fillStyle = css(i % 2 ? c[1] : c[2], 0.95);
        const x = r.x0 + rnd() * w;
        const y = r.y0 + rnd() * h;
        g.beginPath();
        for (let k = 0; k < 7; k++) {
          const a = (k / 7) * Math.PI * 2;
          const rr = (0.025 + rnd() * 0.03) * mU;
          g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * (mV / mU));
        }
        g.closePath();
        g.fill();
      }
      break;
    }
    case 'estampa-degrade': {
      const grad = g.createLinearGradient(0, r.y0, 0, r.y1);
      grad.addColorStop(0, css(c[0]));
      grad.addColorStop(1, css(c[1]));
      g.fillStyle = grad;
      g.fillRect(r.x0, r.y0, w, h);
      break;
    }
    case 'estampa-xadrez': {
      const s = 0.07;
      g.fillStyle = css(c[1], 0.55);
      for (let x = r.x0; x < r.x1; x += s * mU) g.fillRect(x, r.y0, s * mU * 0.4, h);
      for (let y = r.y0; y < r.y1; y += s * mV) g.fillRect(r.x0, y, w, s * mV * 0.4);
      g.fillStyle = css(c[2], 0.8);
      for (let x = r.x0 + s * mU * 0.7; x < r.x1; x += s * mU) g.fillRect(x, r.y0, 0.005 * mU, h);
      break;
    }
    case 'estampa-tiedye': {
      const n = Math.ceil((w / mU) * (h / mV) * 14) + 1;
      for (let i = 0; i < n; i++) {
        const x = r.x0 + rnd() * w;
        const y = r.y0 + rnd() * h;
        for (let k = 6; k > 0; k--) {
          g.fillStyle = css(k % 2 ? c[1] : c[2], 0.35);
          g.beginPath();
          g.ellipse(x, y, k * 0.022 * mU, k * 0.022 * mV, 0, 0, Math.PI * 2);
          g.fill();
        }
      }
      break;
    }
    default:
      break;
  }
  g.restore();
}

// ---------- Prancha ----------

export interface BoardPaint {
  deck: number;
  bottom: number;
  art: string;
  artColor: number;
  noseTail: number | null;
}

const boardCache = new Map<string, THREE.Texture>();

/**
 * Arte da prancha. O eixo horizontal é o comprimento (rabeta → bico) e o
 * vertical dá a volta na seção: metade de cima é o deck, metade de baixo o fundo.
 */
export function boardArtTexture(p: BoardPaint): THREE.Texture {
  const key = JSON.stringify(p);
  const cached = boardCache.get(key);
  if (cached) return cached;
  const W = 1024;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = css(p.deck);
  g.fillRect(0, 0, W, H / 2);
  g.fillStyle = css(p.bottom);
  g.fillRect(0, H / 2, W, H / 2);
  const a = p.artColor;
  const rnd = rand(11);
  for (const y0 of [0, H / 2]) {
    const hh = H / 2;
    g.save();
    g.beginPath();
    g.rect(0, y0, W, hh);
    g.clip();
    switch (p.art) {
      case 'arte-faixa':
        g.fillStyle = css(a);
        g.fillRect(W * 0.56, y0, W * 0.07, hh);
        g.fillStyle = css(a, 0.6);
        g.fillRect(W * 0.66, y0, W * 0.015, hh);
        break;
      case 'arte-duas-faixas':
        g.fillStyle = css(a);
        g.fillRect(W * 0.5, y0, W * 0.035, hh);
        g.fillRect(W * 0.6, y0, W * 0.035, hh);
        break;
      case 'arte-fade': {
        const grad = g.createLinearGradient(0, y0, 0, y0 + hh);
        grad.addColorStop(0, css(a, 0.95));
        grad.addColorStop(0.28, css(a, 0));
        grad.addColorStop(0.72, css(a, 0));
        grad.addColorStop(1, css(a, 0.95));
        g.fillStyle = grad;
        g.fillRect(0, y0, W, hh);
        break;
      }
      case 'arte-listras':
        g.fillStyle = css(a);
        for (let i = 0; i < 6; i++) g.fillRect(W * (0.44 + i * 0.03), y0, W * 0.009, hh);
        break;
      case 'arte-respingos':
        g.fillStyle = css(a, 0.9);
        for (let i = 0; i < 160; i++) {
          const x = W * (0.3 + rnd() * 0.6);
          const y = y0 + rnd() * hh;
          g.beginPath();
          g.arc(x, y, 1.5 + rnd() * rnd() * 9, 0, Math.PI * 2);
          g.fill();
        }
        break;
      case 'arte-xadrez': {
        const size = 16;
        g.fillStyle = css(a);
        for (let x = W * 0.8; x < W; x += size) {
          for (let y = y0; y < y0 + hh; y += size) {
            if (((x / size) | 0) % 2 === ((y / size) | 0) % 2) g.fillRect(x, y, size, size);
          }
        }
        break;
      }
      case 'arte-chamas':
        g.fillStyle = css(a);
        for (let i = 0; i < 9; i++) {
          const yy = y0 + (i + 0.5) * (hh / 9);
          const len = W * (0.25 + rnd() * 0.2);
          g.beginPath();
          g.moveTo(W, yy - hh / 18);
          g.quadraticCurveTo(W - len * 0.6, yy - hh / 9, W - len, yy);
          g.quadraticCurveTo(W - len * 0.6, yy + hh / 12, W, yy + hh / 18);
          g.fill();
        }
        break;
      default:
        break;
    }
    g.restore();
  }
  // Bico e rabeta tingidos (dip)
  if (p.noseTail !== null) {
    g.fillStyle = css(p.noseTail);
    g.fillRect(0, 0, W * 0.05, H);
    g.fillRect(W * 0.93, 0, W * 0.07, H);
  }
  // Fundo um pouco mais claro e acetinado
  g.fillStyle = 'rgba(255,255,255,0.06)';
  g.fillRect(0, H / 2, W, H / 2);
  // Longarina de madeira no centro do deck e do fundo
  g.fillStyle = 'rgba(120,80,40,0.85)';
  g.fillRect(0, H * 0.25 - 1.5, W, 3);
  g.fillRect(0, H * 0.75 - 1.5, W, 3);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  boardCache.set(key, t);
  // Mantém poucas texturas na memória: a prévia troca de arte muitas vezes.
  if (boardCache.size > 24) {
    const first = boardCache.keys().next().value as string;
    if (first !== key) {
      boardCache.get(first)!.dispose();
      boardCache.delete(first);
    }
  }
  return t;
}
