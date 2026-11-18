// "Fotografia" da marca: quadros congelados do próprio jogo (cenas de validação
// com o piloto automático), sem nenhuma imagem de terceiros.
//   node brand/tools/photos.cjs   (com npm run dev rodando em :5180)

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '../..');
const outDir = path.resolve(root, 'brand/photography/game');

const SHOTS = [
  { id: 'air-reverse-pico', maneuver: 'air-reverse', plus: 0.42, location: 'pico-leste' },
  { id: 'indy-rampa', maneuver: 'indy-air', plus: 0.45, location: 'ponta-rampa' },
  { id: '360-pico', maneuver: '360-air', plus: 0.4, location: 'pico-leste' },
  { id: 'backflip-lagoa', maneuver: 'backflip', plus: 0.42, location: 'lagoa-azul' },
  { id: 'superman-rampa', maneuver: 'superman', plus: 0.5, location: 'ponta-rampa' },
  { id: 'method-pico', maneuver: 'method-air', plus: 0.45, location: 'pico-leste' },
  { id: 'decolagem-pico', maneuver: 'air-reverse', plus: 0.06, location: 'pico-leste' },
  { id: 'stalefish-lagoa', maneuver: 'stalefish-air', plus: 0.45, location: 'lagoa-azul' },
];

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto('http://localhost:5180/');
  await page.waitForFunction(() => window.__es && document.getElementById('loading').classList.contains('done'), null, { timeout: 90000 });
  await page.evaluate(() => {
    const a = window.__es.app;
    a.setCameraMode('proxima');
    window.__es.pause(true);
    document.getElementById('ui').style.display = 'none';
  });
  for (const s of SHOTS) {
    await page.evaluate((s) => {
      const a = window.__es.app;
      // Avança sem desenhar até o quadro congelado e desenha uma vez só.
      const st = a.world.stage;
      const render = st.render;
      st.render = () => {};
      a.labScene({ maneuver: s.maneuver, at: { event: 'decolagem', plus: s.plus }, location: s.location });
      for (let i = 0; i < 1200 && a.labFreeze === null; i++) a.frame(1 / 60);
      st.render = render;
      a.frame(0);
    }, s);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(outDir, `${s.id}.jpg`), type: 'jpeg', quality: 90, timeout: 300000 });
    console.log('photo', s.id);
  }
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
