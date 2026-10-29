import * as THREE from 'three';
import type { App } from '../game/App';
import type { Judgement, Outcome } from '../core/types';
import { QUALITIES, type Quality } from '../core/save';
import { QUALITY } from '../render/Stage';

// Cenas de validação visual. Só aparecem abrindo o jogo com "?lab" no endereço
// durante o desenvolvimento (npm run dev), para nunca surgirem por acidente
// para o jogador. Cada cena monta uma onda com resultados forçados, avança até
// um instante e congela, com a câmera apontada para o que deve ser inspecionado.

type CamPreset = 'jogo' | 'corpo' | 'rosto' | 'maos' | 'pes' | 'prancha' | 'agua' | 'onda';

interface Scene {
  id: string;
  label: string;
  maneuver: string;
  outcome: Outcome;
  at: { event: 'inicio' | 'drop' | 'emPe' | 'decolagem' | 'pouso'; plus: number };
  camera: CamPreset;
  results?: (i: number, phase: string) => Judgement;
}

const missRotation = (_: number, phase: string): Judgement => (phase === 'rotacao' ? 'miss' : 'perfect');

export const SCENES: Scene[] = [
  { id: 'remada', label: '1. Remada deitado na prancha', maneuver: 'straight-air', outcome: 'limpa', at: { event: 'inicio', plus: 0.6 }, camera: 'corpo' },
  { id: 'levantando', label: '1b. Drop: levantando', maneuver: 'straight-air', outcome: 'limpa', at: { event: 'drop', plus: 0.35 }, camera: 'corpo' },
  { id: 'parado', label: '1c. Em pé, de perto (costas para a câmera)', maneuver: 'straight-air', outcome: 'limpa', at: { event: 'emPe', plus: 0.3 }, camera: 'corpo' },
  { id: 'rosto', label: '2. Rosto e cabelo', maneuver: 'straight-air', outcome: 'limpa', at: { event: 'emPe', plus: 0.3 }, camera: 'rosto' },
  { id: 'maos', label: '2b. Mãos e dedos (abertas)', maneuver: 'straight-air', outcome: 'limpa', at: { event: 'emPe', plus: 0.3 }, camera: 'maos' },
  { id: 'pes', label: '2c. Pés no deck (direito à frente)', maneuver: 'straight-air', outcome: 'limpa', at: { event: 'emPe', plus: 0.3 }, camera: 'pes' },
  { id: 'prancha', label: '3. Prancha, quilhas, parafina e leash', maneuver: 'straight-air', outcome: 'limpa', at: { event: 'emPe', plus: 0.3 }, camera: 'prancha' },
  { id: 'face', label: '4. Acelerando na face da onda', maneuver: 'straight-air', outcome: 'limpa', at: { event: 'emPe', plus: 1.0 }, camera: 'jogo' },
  { id: 'compressao', label: '5. Compressão perto do lip', maneuver: 'air-reverse', outcome: 'limpa', at: { event: 'decolagem', plus: -0.02 }, camera: 'corpo' },
  { id: 'decolagem', label: '6. Decolagem', maneuver: 'air-reverse', outcome: 'limpa', at: { event: 'decolagem', plus: 0.08 }, camera: 'corpo' },
  { id: 'ascensao', label: '7. Ascensão', maneuver: 'straight-air', outcome: 'limpa', at: { event: 'decolagem', plus: 0.3 }, camera: 'jogo' },
  { id: 'r180', label: '8. Rotação de 180°', maneuver: 'air-reverse', outcome: 'limpa', at: { event: 'decolagem', plus: 0.5 }, camera: 'corpo' },
  { id: 'r360', label: '9. Rotação de 360°', maneuver: 'fs-360', outcome: 'limpa', at: { event: 'decolagem', plus: 0.62 }, camera: 'corpo' },
  { id: 'grab', label: '10. Grab (Indy)', maneuver: 'indy-air', outcome: 'limpa', at: { event: 'decolagem', plus: 0.65 }, camera: 'corpo' },
  { id: 'descida', label: '11. Descida e preparação do pouso', maneuver: 'straight-air', outcome: 'limpa', at: { event: 'pouso', plus: -0.15 }, camera: 'jogo' },
  { id: 'limpa', label: '12. Pouso limpo', maneuver: 'air-reverse', outcome: 'limpa', at: { event: 'pouso', plus: 0.12 }, camera: 'corpo' },
  { id: 'instavel', label: '13. Pouso instável', maneuver: 'air-reverse', outcome: 'instavel', at: { event: 'pouso', plus: 0.5 }, camera: 'corpo' },
  { id: 'queda', label: '14. Queda (corpo e prancha separados)', maneuver: 'air-reverse', outcome: 'queda', results: missRotation, at: { event: 'pouso', plus: 0.55 }, camera: 'jogo' },
  { id: 'agua', label: '15. Prancha na água', maneuver: 'straight-air', outcome: 'limpa', at: { event: 'emPe', plus: 0.6 }, camera: 'agua' },
  { id: 'spray', label: '16. Espuma e spray de perto', maneuver: 'air-reverse', outcome: 'limpa', at: { event: 'decolagem', plus: 0.18 }, camera: 'agua' },
  { id: 'onda', label: '17. Onda inteira', maneuver: 'straight-air', outcome: 'limpa', at: { event: 'decolagem', plus: 0.3 }, camera: 'onda' },
];

const tmp = new THREE.Vector3();

function cameraFor(app: App, preset: CamPreset): ((cam: THREE.PerspectiveCamera) => void) | null {
  const w = app.world;
  const place = (cam: THREE.PerspectiveCamera, target: THREE.Vector3, offset: [number, number, number]) => {
    cam.position.copy(target).add(tmp.set(...offset));
    cam.lookAt(target);
  };
  switch (preset) {
    case 'jogo':
      return null;
    case 'corpo':
      return (cam) => place(cam, w.rig.pelvis.getWorldPosition(new THREE.Vector3()), [-1.3, 0.35, 2.9]);
    case 'rosto':
      return (cam) => place(cam, w.rig.head.getWorldPosition(new THREE.Vector3()).add(tmp.set(0, 0.06, 0)), [0.18, 0.04, 0.6]);
    case 'maos':
      return (cam) => place(cam, w.rig.wristWorld('right'), [0.12, 0.05, 0.45]);
    case 'pes':
      return (cam) => place(cam, w.rig.ankleWorld('right'), [0.35, 0.35, 0.75]);
    case 'prancha':
      return (cam) => place(cam, w.board.group.position.clone(), [0.4, 1.1, 1.7]);
    case 'agua':
      return (cam) => place(cam, w.board.group.position.clone(), [-1.8, 0.25, 2.6]);
    case 'onda':
      return (cam) => {
        const b = w.board.group.position;
        cam.position.set(b.x - 9, 5.5, 24);
        cam.lookAt(b.x + 4, 1, 0);
      };
  }
}

export function mountLab(app: App) {
  const panel = document.createElement('div');
  panel.className = 'panel lab-panel';
  panel.innerHTML = `
    <div class="header"><b>Cenas de validação</b><button class="btn small secondary" data-lab="close">Fechar</button></div>
    <div class="lab-list">${SCENES.map((s) => `<button class="btn small secondary" data-scene="${s.id}">${s.label}</button>`).join('')}</div>
    <div class="sub muted">18. Comparar qualidade gráfica:</div>
    <div class="options">${QUALITIES.map((q) => `<button class="btn small secondary" data-q="${q}">${QUALITY[q].label}</button>`).join('')}</div>
    <div class="options">
      <button class="btn small secondary" data-lab="play">Continuar a animação</button>
      <button class="btn small secondary" data-lab="menu">Voltar ao jogo</button>
    </div>
    <div class="sub" data-lab="info"></div>`;
  document.body.appendChild(panel);
  const info = panel.querySelector<HTMLElement>('[data-lab=info]')!;
  let current: Scene | null = null;

  const run = (s: Scene) => {
    current = s;
    app.labScene({ maneuver: s.maneuver, outcome: s.outcome, at: s.at, results: s.results });
    app.world.camRig.override = cameraFor(app, s.camera);
    app.frame(0);
    info.textContent = `${s.label} · ${app.world.currentQuality} · ${Math.round(app.fps)} FPS`;
  };

  panel.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest('button');
    if (!t) return;
    if (t.dataset.scene) run(SCENES.find((s) => s.id === t.dataset.scene)!);
    if (t.dataset.q) {
      app.setQuality(t.dataset.q as Quality);
      if (current) run(current);
    }
    if (t.dataset.lab === 'play') app.labFreeze = null;
    if (t.dataset.lab === 'menu') app.go('menu');
    if (t.dataset.lab === 'close') panel.remove();
  });
  return { panel, run, scenes: SCENES };
}
