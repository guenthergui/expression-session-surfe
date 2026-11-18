// Ícones da marca EXPRESSION SESSION: grade de 24, traço 2, pontas retas e
// cantos em quina (nada de curvas suaves). Herdam a cor do texto.
// O bloco entre os marcadores é gerado por brand/tools/build_brand.py.

const PATHS: Record<string, string> = {
  // <brand-icons>
  play: '<path d="M7 4l13 8-13 8z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  back: '<path d="M15 4l-8 8 8 8"/>',
  close: '<path d="M5 5l14 14M19 5L5 19"/>',
  check: '<path d="M4 13l5 5L20 6"/>',
  lock: '<path d="M5 11h14v10H5z"/><path d="M8 11V7l2-3h4l2 3v4"/>',
  help: '<path d="M8 2h8l6 6v8l-6 6H8l-6-6V8z"/><path d="M9 9l1.5-2h3L15 9v1.5L12 13v1.5M12 17.5v.5"/>',
  settings: '<path d="M10 2h4l.8 3 2.6 1.5 3-.9 2 3.5-2.2 2.1v3l2.2 2.1-2 3.5-3-.9-2.6 1.5-.8 3h-4l-.8-3-2.6-1.5-3 .9-2-3.5 2.2-2.1v-3L1.6 9.1l2-3.5 3 .9L9.2 5z"/><path d="M12 9l3 3-3 3-3-3z"/>',
  profile: '<path d="M12 2l4.5 2.6v5.2L12 12.4 7.5 9.8V4.6z"/><path d="M3 22l2.5-6.5h13L21 22"/>',
  surfer: '<path d="M13.5 2.5h3v3h-3z"/><path d="M5 9l5-1.5L14.5 8l4.5-2.5"/><path d="M10 7.5l-1 6.5 4 1.5 1 3.5"/><path d="M9 14l-3 4.5"/><path d="M2 21l20-3"/>',
  board: '<path d="M12 2l4 5.5V17l-4 5-4-5V7.5z"/><path d="M12 5.5v13"/>',
  fin: '<path d="M4 21h16l-2.5-8.5L9 3l.5 8z"/><path d="M9 21v-4"/>',
  equipment: '<path d="M9 3h6l1.2 2.5L21 8l-2 6-2.5-1.2V21h-9v-8.2L5 14 3 8l4.8-2.5z"/><path d="M12 6v15"/>',
  beach: '<path d="M2 21h20"/><path d="M2 17l3.3-2.5 3.4 2.5 3.3-2.5 3.3 2.5 3.4-2.5L22 17"/><path d="M17 3l3 3-3 3-3-3z"/><path d="M6 13V5l5 2.5"/>',
  wave: '<path d="M2 20l4.5-8 5-5 6 .5-3.5 3 4 2.5L20 20z"/><path d="M2 20h20"/>',
  championship: '<path d="M5 22V2"/><path d="M5 3h14l-3.5 4.5L19 12H5"/>',
  trophy: '<path d="M7 3h10v6l-2.5 4h-5L7 9z"/><path d="M7 5H3v3l4 3M17 5h4v3l-4 3"/><path d="M12 13v4M7.5 21l1-4h7l1 4z"/>',
  ranking: '<path d="M2 21h20"/><path d="M9 21V9h6v12"/><path d="M3 21v-7h6M15 14h6v7"/><path d="M12 3l1.2 2.4L12 6.5l-1.2-1.1z"/>',
  stats: '<path d="M2 21h20"/><path d="M4.5 21v-6h3v6M10.5 21V10h3v11M16.5 21V4h3v17"/>',
  training: '<path d="M12 2l10 10-10 10L2 12z"/><path d="M12 7l5 5-5 5-5-5z"/><path d="M12 11.2l.8.8-.8.8-.8-.8z"/>',
  maneuvers: '<path d="M2 21L7 9l5-5 5 5 5 12"/><path d="M9.5 2.5l5 3"/><path d="M18 17l4 4 0-5"/>',
  replay: '<path d="M4 3v6h6"/><path d="M4 9l4.5-5h7L20 9v6l-4.5 5h-7L5 17"/><path d="M10.5 9.5l4 2.5-4 2.5z"/>',
  audio: '<path d="M3 9h4l5-5v16l-5-5H3z"/><path d="M16 8.5l1.8 3.5L16 15.5M19 5.5l3 6.5-3 6.5"/>',
  music: '<path d="M9 18V5l12-2.5V16"/><path d="M5 16h4v4H5zM17 14h4v4h-4z"/>',
  controls: '<path d="M6 6h12l4 5v5l-3 3-4-3H9l-4 3-3-3v-5z"/><path d="M8 9.5v4M6 11.5h4M15.5 10.5h1M17.5 13h1"/>',
  achievements: '<path d="M8 2h8l-2 6h-4z"/><path d="M12 9.5l1.9 3.6 4 .6-2.9 2.8.7 4L12 18.6l-3.7 1.9.7-4-2.9-2.8 4-.6z"/>',
  speed: '<path d="M2 18l2.5-6.5L12 7l7.5 4.5L22 18"/><path d="M12 18l5-7"/><path d="M2 21h20"/>',
  height: '<path d="M2 21h20"/><path d="M10 18V4"/><path d="M5.5 8.5L10 4l4.5 4.5"/><path d="M16 12h6M16 16h6"/>',
  rotation: '<path d="M19 9l-3-4.5H8L5 9v6l3 4.5h8l3-4.5"/><path d="M14.5 9.5H19V5"/>',
  landing: '<path d="M12 2v9"/><path d="M8 7.5l4 4 4-4"/><path d="M3 15h18"/><path d="M2 20l3.3-2 3.4 2 3.3-2 3.3 2 3.4-2L22 20"/>',
  score: '<path d="M9.5 3L7.5 21M16.5 3l-2 18M3.5 8.5h18M2.5 15.5h18"/>',
  camera: '<path d="M2 7h5l2-3h6l2 3h5v13H2z"/><path d="M12 9.5l4 3.5-4 3.5-4-3.5z"/>',
  rotateLeft: '<path d="M4 3v6h6"/><path d="M4 9l4.5-5h7L20 9v6l-4.5 5h-7L5 17"/>',
  rotateRight: '<path d="M20 3v6h-6"/><path d="M20 9l-4.5-5h-7L4 9v6l4.5 5h7l3.5-3"/>',
  zoomIn: '<path d="M3 3h12v12H3z"/><path d="M15 15l6 6M9 6v6M6 9h6"/>',
  zoomOut: '<path d="M3 3h12v12H3z"/><path d="M15 15l6 6M6 9h6"/>',
  undo: '<path d="M9 14l-5-5 5-5"/><path d="M4 9h12l4 4v3l-3 3h-5"/>',
  shirt: '<path d="M9 3h6l1.2 2.5L21 8l-2 6-2.5-1.2V21h-9v-8.2L5 14 3 8l4.8-2.5z"/>',
  chart: '<path d="M2 21h20"/><path d="M4.5 21v-6h3v6M10.5 21V10h3v11M16.5 21V4h3v17"/>',
  gear: '<path d="M10 2h4l.8 3 2.6 1.5 3-.9 2 3.5-2.2 2.1v3l2.2 2.1-2 3.5-3-.9-2.6 1.5-.8 3h-4l-.8-3-2.6-1.5-3 .9-2-3.5 2.2-2.1v-3L1.6 9.1l2-3.5 3 .9L9.2 5z"/><path d="M12 9l3 3-3 3-3-3z"/>',
  user: '<path d="M12 2l4.5 2.6v5.2L12 12.4 7.5 9.8V4.6z"/><path d="M3 22l2.5-6.5h13L21 22"/>',
  // </brand-icons>
};

export function icon(name: keyof typeof PATHS | string): string {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${PATHS[name] ?? ''}</svg>`;
}
