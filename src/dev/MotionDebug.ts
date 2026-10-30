import * as THREE from 'three';
import { BODY, ZONE_LABEL, kneeFlexion } from '../anim/stance';
import type { App } from '../game/App';

// Depuração do movimento, só no modo de desenvolvimento (?lab). Desenha por
// cima da cena as referências que o animador usa e mede o resultado no rig
// de verdade (pés, joelhos e mãos), para validar contato e anatomia:
//   - âncoras dos pés no deck (verde) e tornozelos do rig (amarelo);
//   - centro de massa combinado (branco) e sua trajetória;
//   - vetor de velocidade (azul), aceleração (laranja) e eixo do giro (roxo);
//   - normal da onda (ciano), ponto de contato com a água e o Lip (vermelho).

const COLORS = {
  anchor: 0x3ddc84,
  ankle: 0xffd34d,
  com: 0xffffff,
  contact: 0x29b6f6,
  lip: 0xff5252,
  velocity: 0x448aff,
  accel: 0xff9100,
  axis: 0xb388ff,
  normal: 0x18ffff,
  trail: 0xffffff,
};

const TRAIL = 240;

function dot(color: number, r = 0.035): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.9 }));
  m.renderOrder = 999;
  return m;
}

function arrow(color: number): THREE.ArrowHelper {
  const a = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, color, 0.12, 0.07);
  a.renderOrder = 999;
  a.traverse((o) => {
    const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
    if (mat) {
      mat.depthTest = false;
      mat.transparent = true;
    }
  });
  return a;
}

export class MotionDebug {
  readonly group = new THREE.Group();
  readonly label = document.createElement('div');
  private readonly anchorF = dot(COLORS.anchor);
  private readonly anchorB = dot(COLORS.anchor);
  private readonly ankleL = dot(COLORS.ankle, 0.025);
  private readonly ankleR = dot(COLORS.ankle, 0.025);
  private readonly com = dot(COLORS.com, 0.05);
  private readonly contact = dot(COLORS.contact);
  private readonly lip = dot(COLORS.lip, 0.06);
  private readonly vel = arrow(COLORS.velocity);
  private readonly acc = arrow(COLORS.accel);
  private readonly axis = arrow(COLORS.axis);
  private readonly normal = arrow(COLORS.normal);
  private readonly trailGeo = new THREE.BufferGeometry();
  private readonly trail: THREE.Line;
  private readonly points: THREE.Vector3[] = [];
  private lastT = -1;
  enabled = true;

  constructor(private readonly app: App) {
    this.trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL * 3), 3));
    this.trail = new THREE.Line(this.trailGeo, new THREE.LineBasicMaterial({ color: COLORS.trail, depthTest: false, transparent: true, opacity: 0.7 }));
    this.trail.frustumCulled = false;
    this.trail.renderOrder = 998;
    this.group.add(this.anchorF, this.anchorB, this.ankleL, this.ankleR, this.com, this.contact, this.lip, this.vel, this.acc, this.axis, this.normal, this.trail);
    app.world.stage.scene.add(this.group);
    this.label.className = 'panel motion-debug';
    document.body.appendChild(this.label);
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    this.group.visible = on;
    this.label.style.display = on ? '' : 'none';
  }

  /** Limpa a trajetória (nova cena). */
  reset() {
    this.points.length = 0;
    this.lastT = -1;
  }

  update() {
    const ride = this.app.debugRide;
    if (!this.enabled || !ride) return;
    const f = ride.animator.current;
    const d = f.debug;
    this.anchorF.position.copy(d.anchorFront);
    this.anchorB.position.copy(d.anchorBack);
    const rig = this.app.world.rig;
    this.ankleL.position.copy(rig.ankleWorld('left'));
    this.ankleR.position.copy(rig.ankleWorld('right'));
    this.com.position.copy(d.com);
    this.contact.position.copy(d.contact);
    this.lip.position.copy(d.lip);
    const setArrow = (a: THREE.ArrowHelper, from: THREE.Vector3, v: THREE.Vector3, scale: number) => {
      const len = v.length() * scale;
      a.visible = len > 0.02;
      if (!a.visible) return;
      a.position.copy(from);
      a.setDirection(v.clone().normalize());
      a.setLength(len, Math.min(0.15, len * 0.3), Math.min(0.08, len * 0.2));
    };
    setArrow(this.vel, d.com, d.velocity, 0.15);
    setArrow(this.acc, d.com, d.accel, 0.06);
    setArrow(this.axis, d.com, d.spinAxis, 0.8);
    setArrow(this.normal, f.boardPos, d.waveNormal, 0.9);
    // Trajetória do centro de massa (só avança quando o tempo da onda avança).
    if (ride.time !== this.lastT) {
      this.lastT = ride.time;
      this.points.push(d.com.clone());
      if (this.points.length > TRAIL) this.points.shift();
      const pos = this.trailGeo.getAttribute('position') as THREE.BufferAttribute;
      this.points.forEach((p, i) => pos.setXYZ(i, p.x, p.y, p.z));
      pos.needsUpdate = true;
      this.trailGeo.setDrawRange(0, this.points.length);
    }
    this.label.innerHTML = this.report();
  }

  /** Medidas no rig de verdade: contato dos pés com o deck, flexão dos joelhos e alcance do grab. */
  private report(): string {
    const app = this.app;
    const ride = app.debugRide!;
    const f = ride.animator.current;
    const d = f.debug;
    const rig = app.world.rig;
    const board = app.world.board;
    const inv = board.group.quaternion.clone().invert();
    const local = (p: THREE.Vector3) => p.clone().sub(board.group.position).applyQuaternion(inv);
    const sole = (side: 'left' | 'right') => {
      // Sola = tornozelo menos a altura do tornozelo, no eixo do pé.
      const a = local(rig.ankleWorld(side));
      const footUp = new THREE.Vector3(0, 1, 0).applyQuaternion(inv.clone().multiply(rig.footQuat(side)));
      a.addScaledVector(footUp, -BODY.ankleHeight);
      return { gap: (a.y - board.deckY(a.x, a.z)) * 1000, x: a.x };
    };
    const back = sole('left');
    const front = sole('right');
    const knee = (side: 'left' | 'right') => THREE.MathUtils.radToDeg(kneeFlexion(rig.hipWorld(side).distanceTo(rig.ankleWorld(side)))).toFixed(0);
    const standing = !f.falling && f.phase !== 'remada' && f.phase !== 'drop';
    const fmt = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(0)}`;
    const ok = (mm: number) => (Math.abs(mm) <= 8 ? 'ok' : 'FORA');
    return `
      <b>${ride.maneuver.name}</b> (${d.choreo}) · ${d.state}<br>
      fase: ${f.phase}${d.zone ? ` · zona: ${ZONE_LABEL[d.zone]}` : ''}<br>
      giro (°): ombros ${fmt(d.shoulders)} · quadril ${fmt(d.hips)} · prancha ${fmt(d.board)} · borda ${fmt(d.roll)}<br>
      velocidade ${d.velocity.length().toFixed(1)} m/s · aceleração ${d.accel.length().toFixed(1)} m/s²<br>
      ${standing ? `pé de trás: ${fmt(back.gap)} mm do deck (${ok(back.gap)}), x=${back.x.toFixed(2)} m · pé da frente: ${fmt(front.gap)} mm (${ok(front.gap)})<br>
      joelhos: trás ${knee('left')}° · frente ${knee('right')}°${ride.animator.grabReach ? ` · ombro–borda ${(ride.animator.grabReach * 100).toFixed(0)} cm` : ''}` : 'pés fora da base (remada, levantar ou queda)'}`;
  }
}
