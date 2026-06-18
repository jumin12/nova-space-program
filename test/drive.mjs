/* drive.mjs — test driver: runs the game, executes a JS scenario, captures screenshots/state/errors */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const indexUrl = pathToFileURL(path.join(here, '..', 'index.html')).href;
const outDir = path.join(here, 'shots');
fs.mkdirSync(outDir, { recursive: true });

const scenarioFile = process.argv[2];
if (!scenarioFile) { console.error('usage: node drive.mjs <scenario.mjs>'); process.exit(1); }
const scenario = (await import(pathToFileURL(path.resolve(scenarioFile)).href)).default;

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));

await page.goto(indexUrl, { waitUntil: 'domcontentloaded' });

const api = {
  page,
  browser,
  sleep: ms => page.waitForTimeout(ms),
  shot: async name => { await page.screenshot({ path: path.join(outDir, name + '.png') }); console.log('shot:', name); },
  state: async () => {
    const s = await page.evaluate(() => window.render_game_to_text ? window.render_game_to_text() : null);
    console.log('STATE:', s);
    return s ? JSON.parse(s) : null;
  },
  click: (x, y) => page.mouse.click(x, y),
  key: async (k, ms = 80) => { await page.keyboard.down(k); await page.waitForTimeout(ms); await page.keyboard.up(k); },
  evalJs: (fn, arg) => page.evaluate(fn, arg),
  log: (...a) => console.log(...a),
};

try {
  await scenario(api);
} catch (e) {
  console.error('SCENARIO ERROR:', e);
  await api.shot('error-final');
}
if (errors.length) {
  console.log('\n=== CONSOLE ERRORS (' + errors.length + ') ===');
  for (const e of errors.slice(0, 30)) console.log('-', e.slice(0, 500));
} else console.log('\n=== NO CONSOLE ERRORS ===');
await browser.close();
