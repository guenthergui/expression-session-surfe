import * as THREE from 'three';

// Camada de nuvens procedurais: cada pixel do domo projeta o raio da câmera
// num plano de nuvens a ~1,5 km de altura e lê ruído fractal ali. Assim as
// nuvens têm perspectiva real (encolhem e se juntam no horizonte), andam com o
// vento e são iluminadas pela cor do sol. Como o céu, são desenhadas no fundo
// do quadro e não dependem da distância de renderização.

const vertexShader = `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }`;

const fragmentShader = `
  uniform float time;
  uniform float coverage;
  uniform vec3 sunDir;
  uniform vec3 sunColor;
  uniform vec3 shadeColor;
  uniform vec2 wind;
  uniform float intensity;
  varying vec3 vDir;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
    for (int i = 0; i < OCTAVES; i++) {
      v += a * noise(p);
      p = r * p * 2.03;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 dir = normalize(vDir);
    if (dir.y < 0.005) discard;
    // Interseção do raio com o plano das nuvens (unidades: quilômetros).
    vec2 p = dir.xz / dir.y * 1.5 + wind * time;
    float base = fbm(p * 0.9);
    float d = smoothstep(1.0 - coverage, 1.15 - coverage * 0.6, base);
    if (d < 0.01) discard;
    // Iluminação: amostra deslocada para o sol dá o lado escuro de cada nuvem.
    float toward = fbm(p * 0.9 + normalize(sunDir.xz + 1e-4) * 0.08);
    float lit = clamp(0.55 + (base - toward) * 6.0, 0.0, 1.0);
    vec3 col = mix(shadeColor, sunColor, lit);
    // Borda iluminada quando a nuvem está na frente do sol.
    float glow = pow(max(dot(dir, sunDir), 0.0), 12.0);
    col += sunColor * glow * (1.0 - d) * 1.5;
    // Somem perto do horizonte, onde a névoa domina.
    float fade = smoothstep(0.0, 0.18, dir.y);
    gl_FragColor = vec4(col * intensity, d * fade * 0.92);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export class Clouds {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private octaves = 0;

  constructor(scene: THREE.Scene, octaves: number) {
    this.mat = this.makeMaterial(octaves);
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), this.mat);
    this.mesh.scale.setScalar(2500);
    this.mesh.frustumCulled = false;
    // Logo depois do céu e antes de tudo o mais.
    this.mesh.renderOrder = -1;
    scene.add(this.mesh);
  }

  private makeMaterial(octaves: number) {
    this.octaves = octaves;
    return new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        coverage: { value: 0.45 },
        sunDir: { value: new THREE.Vector3(0, 1, 0) },
        sunColor: { value: new THREE.Color(1, 1, 1) },
        shadeColor: { value: new THREE.Color(0.6, 0.65, 0.72) },
        wind: { value: new THREE.Vector2(0.004, 0.0015) },
        intensity: { value: 4 },
      },
      defines: { OCTAVES: Math.max(1, octaves) },
      vertexShader,
      fragmentShader,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      fog: false,
    });
  }

  setOctaves(octaves: number) {
    if (octaves === this.octaves) return;
    const old = this.mat;
    this.mat = this.makeMaterial(octaves);
    for (const k of Object.keys(old.uniforms)) this.mat.uniforms[k].value = old.uniforms[k].value;
    this.mesh.material = this.mat;
    old.dispose();
    this.mesh.visible = octaves > 0;
  }

  /**
   * Cor das nuvens a partir do sol: brancas ao meio-dia, douradas e rosadas
   * ao entardecer, com a base em cinza azulado ou arroxeado.
   */
  apply(sunDir: THREE.Vector3, sunElevation: number, coverage: number, exposure: number) {
    const u = this.mat.uniforms;
    // Compensa a exposição da cena, para a nuvem ter o mesmo brilho do céu em volta.
    u.intensity.value = 1.5 / Math.max(0.05, exposure);
    u.sunDir.value.copy(sunDir);
    u.coverage.value = coverage;
    const warm = THREE.MathUtils.clamp(1 - sunElevation / 35, 0, 1);
    (u.sunColor.value as THREE.Color).setRGB(1.0, 0.97 - 0.32 * warm, 0.93 - 0.55 * warm).multiplyScalar(1.15 - 0.25 * warm);
    (u.shadeColor.value as THREE.Color).setRGB(0.62 - 0.12 * warm, 0.66 - 0.24 * warm, 0.74 - 0.2 * warm);
  }

  setWind(x: number, z: number) {
    (this.mat.uniforms.wind.value as THREE.Vector2).set(0.003 + x * 0.004, 0.0012 + z * 0.004);
  }

  update(time: number, cameraPos: THREE.Vector3) {
    this.mat.uniforms.time.value = time;
    this.mesh.position.copy(cameraPos);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
