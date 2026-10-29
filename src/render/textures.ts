import * as THREE from 'three';

// Texturas procedurais desenhadas em canvas: não dependem de arquivos externos.
// Ficam em cache para serem reaproveitadas entre prancha, surfista e cenário.

const cache = new Map<string, THREE.Texture>();

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function hex(c: number, a = 1): string {
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  return `rgba(${r},${g},${b},${a})`;
}

/** Gerador pseudoaleatório simples para as texturas saírem sempre iguais. */
function rand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function finish(key: string, c: HTMLCanvasElement, color = true, repeat?: [number, number]): THREE.Texture {
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  cache.set(key, t);
  return t;
}

/** Variação sutil de tom para pele: manchas, poros e leve vermelhidão. */
export function skinTexture(): THREE.Texture {
  const key = 'skin';
  if (cache.has(key)) return cache.get(key)!;
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 256);
  const r = rand(7);
  for (let i = 0; i < 2200; i++) {
    const v = 225 + r() * 30;
    g.fillStyle = `rgba(${v},${v - 18 - r() * 10},${v - 28 - r() * 12},${0.12 + r() * 0.12})`;
    g.beginPath();
    g.arc(r() * 256, r() * 256, 0.6 + r() * 2.4, 0, Math.PI * 2);
    g.fill();
  }
  return finish(key, c, true, [2, 2]);
}

/** Relevo de neoprene: grão fino e costuras. Usado como bumpMap da roupa. */
export function neopreneBump(): THREE.Texture {
  const key = 'neoprene';
  if (cache.has(key)) return cache.get(key)!;
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#808080';
  g.fillRect(0, 0, 256, 256);
  const r = rand(11);
  for (let i = 0; i < 9000; i++) {
    const v = 110 + r() * 40;
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(r() * 256, r() * 256, 1.2, 1.2);
  }
  // Costuras horizontais e verticais
  g.strokeStyle = '#3a3a3a';
  g.lineWidth = 3;
  for (const y of [64, 192]) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(256, y);
    g.stroke();
  }
  g.beginPath();
  g.moveTo(128, 0);
  g.lineTo(128, 256);
  g.stroke();
  return finish(key, c, false, [1, 1]);
}

/** Fios de cabelo para cor e relevo. */
export function hairTexture(): THREE.Texture {
  const key = 'hair';
  if (cache.has(key)) return cache.get(key)!;
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#9a9a9a';
  g.fillRect(0, 0, 256, 256);
  const r = rand(3);
  for (let i = 0; i < 1600; i++) {
    const x = r() * 256;
    const v = 120 + r() * 120;
    g.strokeStyle = `rgba(${v},${v},${v},0.55)`;
    g.lineWidth = 0.6 + r();
    g.beginPath();
    g.moveTo(x, 0);
    g.bezierCurveTo(x + (r() - 0.5) * 20, 90, x + (r() - 0.5) * 20, 170, x + (r() - 0.5) * 16, 256);
    g.stroke();
  }
  return finish(key, c, true, [3, 1]);
}

export type BoardGraphic = 'liso' | 'faixa' | 'fade' | 'xadrez';

/**
 * Arte da prancha. O eixo horizontal é o comprimento (rabeta → bico) e o
 * vertical dá a volta na seção: metade de cima é o deck, metade de baixo o fundo.
 */
export function boardTexture(style: BoardGraphic, color: number, accent: number): THREE.Texture {
  const key = `board-${style}-${color}-${accent}`;
  if (cache.has(key)) return cache.get(key)!;
  const W = 1024;
  const H = 256;
  const [c, g] = canvas(W, H);
  g.fillStyle = hex(color);
  g.fillRect(0, 0, W, H);
  // Fundo um pouco mais claro e acetinado
  g.fillStyle = 'rgba(255,255,255,0.08)';
  g.fillRect(0, H / 2, W, H / 2);
  if (style === 'faixa') {
    g.fillStyle = hex(accent);
    g.fillRect(W * 0.56, 0, W * 0.07, H);
    g.fillStyle = hex(accent, 0.6);
    g.fillRect(W * 0.66, 0, W * 0.015, H);
  } else if (style === 'fade') {
    for (const y0 of [0, H / 2]) {
      const grad = g.createLinearGradient(0, y0, 0, y0 + H / 2);
      grad.addColorStop(0, hex(accent, 0.95));
      grad.addColorStop(0.28, hex(accent, 0));
      grad.addColorStop(0.72, hex(accent, 0));
      grad.addColorStop(1, hex(accent, 0.95));
      g.fillStyle = grad;
      g.fillRect(0, y0, W, H / 2);
    }
  } else if (style === 'xadrez') {
    const size = 16;
    for (let x = W * 0.8; x < W; x += size) {
      for (let y = 0; y < H; y += size) {
        if (((x / size) | 0) % 2 === ((y / size) | 0) % 2) {
          g.fillStyle = hex(accent);
          g.fillRect(x, y, size, size);
        }
      }
    }
  }
  // Longarina de madeira no centro do deck e do fundo
  g.fillStyle = 'rgba(120,80,40,0.85)';
  g.fillRect(0, H * 0.25 - 1.5, W, 3);
  g.fillRect(0, H * 0.75 - 1.5, W, 3);
  // Logotipo discreto no deck
  g.fillStyle = hex(accent, 0.9);
  g.font = 'bold 22px sans-serif';
  g.save();
  g.translate(W * 0.47, H * 0.25);
  g.fillText('EXPRESSION', -70, -18);
  g.restore();
  return finish(key, c);
}

/** Antiderrapante (deck pad) com sulcos. */
export function padTexture(): THREE.Texture {
  const key = 'pad';
  if (cache.has(key)) return cache.get(key)!;
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#1b1d20';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#2d3035';
  g.lineWidth = 4;
  for (let x = 4; x < 128; x += 10) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, 128);
    g.stroke();
  }
  return finish(key, c);
}

/** Tatuagem com fundo transparente, aplicada numa faixa sobre o braço ou a perna. */
export function tattooTexture(style: 'tribal' | 'ondas'): THREE.Texture {
  const key = `tattoo-${style}`;
  if (cache.has(key)) return cache.get(key)!;
  const [c, g] = canvas(512, 128);
  g.clearRect(0, 0, 512, 128);
  g.fillStyle = 'rgba(25,30,40,0.85)';
  g.strokeStyle = 'rgba(25,30,40,0.85)';
  if (style === 'tribal') {
    for (let i = 0; i < 8; i++) {
      const x = i * 64;
      g.beginPath();
      g.moveTo(x, 64);
      g.quadraticCurveTo(x + 32, 0, x + 64, 64);
      g.quadraticCurveTo(x + 32, 40, x, 64);
      g.fill();
      g.beginPath();
      g.moveTo(x, 70);
      g.quadraticCurveTo(x + 32, 128, x + 64, 70);
      g.quadraticCurveTo(x + 32, 92, x, 70);
      g.fill();
    }
  } else {
    g.lineWidth = 7;
    for (let row = 0; row < 2; row++) {
      g.beginPath();
      for (let x = 0; x <= 512; x += 4) {
        const y = 44 + row * 40 + Math.sin(x / 26) * 12;
        if (x === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  const t = finish(key, c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** Partícula redonda e suave para spray e espuma. */
export function sprayTexture(): THREE.Texture {
  const key = 'spray';
  if (cache.has(key)) return cache.get(key)!;
  const [c, g] = canvas(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.75)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return finish(key, c);
}

/** Areia, pedra e concreto para o cenário. */
export function groundTexture(kind: 'areia' | 'pedra' | 'concreto'): THREE.Texture {
  const key = `ground-${kind}`;
  if (cache.has(key)) return cache.get(key)!;
  const [c, g] = canvas(256, 256);
  const base = { areia: '#d9c49a', pedra: '#5b5650', concreto: '#b9bcbf' }[kind];
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  const r = rand(kind.length * 13);
  for (let i = 0; i < 6000; i++) {
    const d = (r() - 0.5) * 50;
    g.fillStyle = `rgba(${128 + d},${120 + d},${110 + d},0.18)`;
    g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 2);
  }
  return finish(key, c, true, [8, 8]);
}

/**
 * Parafina com bolinhas e riscos de aplicação: mais densa nas zonas dos pés e
 * rala nas bordas. O canal alfa dá a cobertura; a mesma imagem serve de relevo.
 */
export function waxTexture(): THREE.Texture {
  const key = 'wax';
  if (cache.has(key)) return cache.get(key)!;
  const W = 512;
  const H = 256;
  const [c, g] = canvas(W, H);
  g.clearRect(0, 0, W, H);
  const r = rand(19);
  // Densidade: horizontal = comprimento (rabeta → bico), vertical = largura.
  const density = (u: number, v: number) => {
    const across = 1 - Math.pow(Math.abs(v - 0.5) * 2, 3);
    const feet = 0.55 + 0.45 * Math.max(Math.exp(-Math.pow((u - 0.23) / 0.16, 2)), Math.exp(-Math.pow((u - 0.85) / 0.2, 2)));
    return across * feet;
  };
  for (let i = 0; i < 9000; i++) {
    const u = r();
    const v = r();
    if (r() > density(u, v)) continue;
    const s = 1 + r() * 3.5;
    const l = 215 + r() * 35;
    g.fillStyle = `rgba(${l},${l - 4},${l - 14},${0.35 + r() * 0.5})`;
    g.beginPath();
    g.ellipse(u * W, v * H, s * (1 + r()), s, r() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  // Riscos em diagonal da aplicação em cruz
  g.strokeStyle = 'rgba(240,236,224,0.18)';
  g.lineWidth = 2;
  for (let i = 0; i < 60; i++) {
    const x = r() * W;
    const y = r() * H;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (r() > 0.5 ? 30 : -30), y + 30);
    g.stroke();
  }
  return finish(key, c);
}

/**
 * Mapa de normais de água que repete sem emenda: soma de ondulações em várias
 * direções e escalas, convertida em normais. Duas cópias com escalas e
 * velocidades diferentes dão o detalhe fino sobre a geometria da onda.
 */
export function waterNormalTexture(seed: number): THREE.Texture {
  const key = `water-normal-${seed}`;
  if (cache.has(key)) return cache.get(key)!;
  const N = 256;
  const [c, g] = canvas(N, N);
  const r = rand(seed);
  // Ondas com número inteiro de ciclos por textura, para repetir sem emenda.
  const waves = Array.from({ length: 9 }, () => ({
    kx: Math.round((r() - 0.5) * 14),
    ky: Math.round((r() - 0.5) * 14) || 1,
    a: 0.4 + r(),
    p: r() * Math.PI * 2,
  }));
  const h = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let v = 0;
      for (const w of waves) v += (w.a / Math.hypot(w.kx, w.ky)) * Math.sin(((w.kx * x + w.ky * y) / N) * Math.PI * 2 + w.p);
      h[y * N + x] = v;
    }
  }
  const img = g.createImageData(N, N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = h[y * N + ((x + 1) % N)] - h[y * N + ((x - 1 + N) % N)];
      const dy = h[((y + 1) % N) * N + x] - h[((y - 1 + N) % N) * N + x];
      const nx = -dx * 6;
      const ny = -dy * 6;
      const len = Math.hypot(nx, ny, 1);
      const i = (y * N + x) * 4;
      img.data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = finish(key, c, false);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
