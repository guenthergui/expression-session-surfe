// Capturas reais da interface com o jogo rodando (npm run dev em :5180).
//   node brand/tools/capture.cjs [saida=brand/photography/ui] [largura=1440] [altura=900]
// Joga uma bateria completa com o piloto automático do próprio jogo (o mesmo
// das cenas de validação), então os resultados são de uma bateria de verdade.

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '../..');
const outDir = path.resolve(root, process.argv[2] || 'brand/photography/ui');
const W = Number(process.argv[3] || 1440);
const H = Number(process.argv[4] || 900);
const mobile = W < 800;
const URL = 'http://localhost:5180/';

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: mobile });
  const errors = [];
  page.on('pageerror', (e) => { errors.push(String(e)); console.log('PAGEERROR', String(e)); });
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const shot = async (name) => {
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(outDir, `${name}.jpg`), type: 'jpeg', quality: 88 });
    console.log('shot', name);
  };
  const app = (fn, arg) => page.evaluate(fn, arg);
  const key = (k) => page.keyboard.press(k);

  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.goto(URL);
  await page.waitForFunction(() => window.__es && document.getElementById('loading').classList.contains('done'), null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  await shot('01-menu');

  await app(() => window.__es.app.go('setup'));
  await shot('02-setup');
  await app(() => window.__es.app.go('skills'));
  await shot('03-skills');
  await app(() => window.__es.app.go('settings'));
  await shot('04-settings');
  await app(() => window.__es.app.go('locker'));
  await page.waitForTimeout(1200);
  await shot('05-locker');
  await app(() => window.__es.app.go('menu'));
  await app(() => window.__es.app.showHelp());
  await shot('06-help');
  await key('Escape');
  await page.evaluate(() => document.querySelectorAll('.modal-bg').forEach((m) => m.remove()));

  // Bateria completa. O navegador de captura (sem GPU) desenha a cena devagar,
  // então o tempo do jogo avança "sem desenhar" até cada momento e só o quadro
  // da captura é desenhado. A simulação é a mesma do jogo, passo de 1/60 s.
  await app(() => window.__es.pause(true));
  const ff = (cond, maxSeconds = 120) => page.evaluate(([cond, max]) => {
    const a = window.__es.app;
    const st = a.world.stage;
    const render = st.render;
    st.render = () => {};
    const test = new Function('a', `return (${cond})`);
    let i = 0;
    for (; i < max * 60; i++) {
      a.frame(1 / 60);
      if (test(a)) break;
    }
    st.render = render;
    a.frame(0);
    return i / 60;
  }, [cond, maxSeconds]);
  await app(() => window.__es.app.go('setup'));
  await key('Enter');
  await ff('false', 0.3);
  await shot('07-intro');
  const autopilot = () => page.evaluate(async () => {
    const { AutoPilot, planFor } = await import('/src/sim/autopilot.ts');
    const r = window.__es.app.debugRide;
    r.pilot = new AutoPilot(planFor(r.challenge));
    r.pilot.maxAttempts = 2;
  });
  for (let wave = 0; wave < 5; wave++) {
    await key('Space'); // roleta
    await ff('false', 0.9);
    if (wave === 0) await shot('08-wheel');
    await ff("!!document.querySelector('.maneuver-name')", 20);
    await ff('false', 0.5);
    if (wave === 0) await shot('09-challenge');
    await key('Space'); // remar
    await autopilot();
    if (wave === 0) {
      await ff('false', 2.2);
      await shot('10-ride');
      await ff("a.debugState().run && a.debugState().run.state === 'airborne'", 40);
      await ff('false', 0.3);
      await shot('11-air');
    }
    console.log('wave', wave, 'secs', await ff("!!document.querySelector('.outcome')", 240));
    await ff('false', 0.6);
    if (wave === 0) await shot('12-wave-result');
    await key('Space');
    await ff('false', 0.2);
  }
  await ff("!!document.querySelector('.final-score')", 10);
  await ff('false', 1.2);
  await shot('13-heat-result');
  await app(() => window.__es.app.go('menu'));
  await app(() => window.__es.pause(false));
  // Pausa
  console.log('errors', JSON.stringify(errors));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
