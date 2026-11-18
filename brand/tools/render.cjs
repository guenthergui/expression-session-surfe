// Rasteriza a marca com o Chromium do Playwright (nenhuma dependência nova no
// jogo: o Playwright só é usado aqui, para exportar arquivos).
//
//   node brand/tools/render.cjs jobs.json
//
// jobs.json: [{ "type": "svg", "src": "a.svg", "out": "a.png", "width": 2048 },
//             { "type": "html", "src": "p.html", "out": "p.png", "width": 1080, "height": 1350, "scale": 1 },
//             { "type": "pdf", "src": "manual.html", "out": "manual.pdf" }]
// Caminhos relativos à raiz do repositório.

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '../..');
const abs = (p) => path.resolve(root, p);

(async () => {
  const jobs = JSON.parse(fs.readFileSync(abs(process.argv[2]), 'utf8'));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const job of jobs) {
    fs.mkdirSync(path.dirname(abs(job.out)), { recursive: true });
    if (job.type === 'svg') {
      const svg = fs.readFileSync(abs(job.src), 'utf8');
      const vb = /viewBox="([\d.\-\s]+)"/.exec(svg)[1].split(/\s+/).map(Number);
      const w = job.width;
      const h = Math.round((w * vb[3]) / vb[2]);
      const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      const body = svg.replace(/<svg([^>]*?)\swidth="[^"]*"/, '<svg$1').replace(/<svg([^>]*?)\sheight="[^"]*"/, '<svg$1');
      await page.setContent(`<html><body style="margin:0;background:transparent">${body.replace('<svg', `<svg width="${w}" height="${h}"`)}</body></html>`);
      await page.screenshot({ path: abs(job.out), omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
      await page.close();
    } else if (job.type === 'html') {
      const page = await browser.newPage({ viewport: { width: job.width, height: job.height }, deviceScaleFactor: job.scale ?? 1 });
      await page.goto('file://' + abs(job.src));
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(job.wait ?? 150);
      await page.screenshot(job.out.endsWith('.jpg') ? { path: abs(job.out), type: 'jpeg', quality: 90 } : { path: abs(job.out), omitBackground: !!job.transparent });
      await page.close();
    } else if (job.type === 'pdf') {
      const page = await browser.newPage();
      await page.goto('file://' + abs(job.src));
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(400);
      await page.pdf({ path: abs(job.out), preferCSSPageSize: true, printBackground: true });
      await page.close();
    }
    console.log('ok', job.out);
  }
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
