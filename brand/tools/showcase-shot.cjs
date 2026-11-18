// Captura a seção de componentes do showcase para o manual.
const path = require('path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 1.5 });
  await p.goto('file://' + path.join(root, 'brand/showcase/index.html'));
  await p.evaluate(() => document.fonts.ready);
  await p.addStyleTag({ content: 'nav.top{display:none} .grain::after{display:none}' });
  await p.waitForTimeout(800);
  const el = await p.$('#componentes');
  await el.screenshot({ path: path.join(root, 'brand/photography/showcase-components.png') });
  await p.setViewportSize({ width: 1360, height: 900 });
  await p.screenshot({ path: path.join(root, 'brand/photography/showcase-hero.png') });
  await b.close();
  console.log('ok');
})();
