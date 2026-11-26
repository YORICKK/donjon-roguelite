// Test de bout en bout : parcours réel dans un navigateur (Edge ou Chrome déjà installé, via playwright-core).
//   npm run e2e
// Compile le jeu en mode « e2e » (sans Firebase : tout en local, aucun compte créé), le sert,
// puis joue : connexion → campagne solo (classe, roue, équipement, lancement, premières salles),
// mode infini, et une partie à 2 joueurs (2 onglets). Échoue au moindre écran bloqué ou erreur console.
import { build, preview } from 'vite';
import { chromium } from 'playwright-core';

const PORT = 4179;
const URL = `http://localhost:${PORT}/`;

await build({ mode: 'e2e', logLevel: 'warn', build: { outDir: 'dist-e2e', emptyOutDir: true } });
const server = await preview({ mode: 'e2e', build: { outDir: 'dist-e2e' }, preview: { port: PORT, strictPort: true }, logLevel: 'warn' });

let browser;
for (const channel of ['msedge', 'chrome']) {
  try { browser = await chromium.launch({ channel, headless: true }); break; } catch { /* essai suivant */ }
}
if (!browser) throw new Error('Ni Edge ni Chrome trouvés pour le test.');

const errors = [];
const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
let failed = false;

async function openPage(name) {
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${name}] ${m.text()}`); });
  await page.goto(URL);
  await page.fill('#pseudo', name);
  await page.press('#pseudo', 'Enter');
  await page.waitForSelector('[data-action="solo"]');
  return page;
}

const click = (page, sel) => page.locator(sel).first().click();

/** Choisit une classe puis traverse roue et équipement jusqu'au bouton de lancement (ou « Prêt »). */
async function setupHero(page, classId) {
  await click(page, `[data-action="class"][data-id="${classId}"]`);
  await click(page, '[data-action="nextStep"]'); // → roue
  await page.waitForSelector('.wheel-editor');
  await click(page, '[data-action="autoWheel"]');
  await click(page, '[data-action="nextStep"]'); // → équipement
  await page.waitForSelector('[data-action="prevStep"]');
}

/** Vote la 1re option disponible jusqu'à avoir traversé `rooms` salles (ou la fin du run). */
async function playRooms(page, rooms) {
  let seen = 0;
  for (let i = 0; i < 200 && seen < rooms; i++) {
    if (await page.locator('.over-title').count()) return 'over';
    const vote = page.locator('[data-action="vote"]:not([disabled])').first();
    if (await vote.count()) {
      const path = (await vote.getAttribute('data-id'))?.startsWith('go:');
      await vote.click();
      if (path) seen++;
    } else {
      const next = page.locator('[data-action="continue"]:not([disabled]), [data-action="pick"]:not([disabled])').first();
      if (await next.count()) await next.click();
    }
    await page.waitForTimeout(400);
  }
  return seen;
}

async function step(label, fn) {
  const t = Date.now();
  try {
    await fn();
    console.log(`✔ ${label} (${((Date.now() - t) / 1000).toFixed(1)} s)`);
  } catch (e) {
    failed = true;
    console.log(`✘ ${label}\n   ${e.message.split('\n')[0]}`);
  }
}

const solo = await openPage('Testeur');

await step('Campagne solo : salon → classe → roue → équipement → lancement', async () => {
  await click(solo, '[data-action="solo"]');
  await setupHero(solo, 'guerrier');
  await click(solo, '[data-action="start"]');
  await solo.waitForSelector('.lv', { timeout: 5000 });
});

await step('Campagne solo : traverser 2 salles', async () => {
  const r = await playRooms(solo, 2);
  if (r !== 'over' && r < 2) throw new Error(`bloqué après ${r} salle(s)`);
});

await step('Mode infini : lancement à l’étage 1', async () => {
  const inf = await openPage('Infini');
  await click(inf, '[data-action="endless"]');
  await setupHero(inf, 'mage');
  await click(inf, '[data-action="start"]');
  const lv = await inf.locator('.lv').first().textContent({ timeout: 5000 });
  if (!/Mode infini — étage 1/.test(lv)) throw new Error(`titre inattendu : ${lv}`);
  await playRooms(inf, 1);
});

await step('Mode auto : le jeu avance seul (3 salles ou fin du run)', async () => {
  const auto = await openPage('Robot');
  await click(auto, '[data-action="solo"]');
  await setupHero(auto, 'guerrier');
  await click(auto, '[data-action="start"]');
  await auto.waitForSelector('[data-action="toggleAuto"]', { timeout: 5000 });
  await click(auto, '[data-action="toggleAuto"]');
  await auto.waitForFunction(() => {
    if (document.querySelector('.over-title')) return true;
    const k = document.querySelector('.kicker')?.textContent || '';
    const m = k.match(/Étage (\d+)/);
    return m && Number(m[1]) >= 3;
  }, null, { timeout: 90000, polling: 500 });
});

await step('Classement du mode infini : écran et retour au menu', async () => {
  const lb = await openPage('Classement');
  await click(lb, '[data-action="leaderboard"]');
  await lb.waitForSelector('.board, .panel h2:has-text("Classement")', { timeout: 5000 });
  await lb.waitForFunction(() => !document.body.textContent.includes('Chargement…'), null, { timeout: 5000 });
  await click(lb, '[data-action="menu"]');
  await lb.waitForSelector('[data-action="endless"]');
});

await step('Multijoueur à 2 onglets : créer, rejoindre, prêts, lancer', async () => {
  const host = await openPage('Hote');
  await click(host, '[data-action="create"]');
  const code = (await host.locator('.code').first().textContent()).trim();
  const guest = await openPage('Invite');
  await guest.fill('input[name="code"]', code);
  await guest.press('input[name="code"]', 'Enter');
  await guest.waitForSelector('[data-action="class"]');
  await setupHero(host, 'clerc');
  await setupHero(guest, 'voleur');
  await click(guest, '[data-action="ready"]');
  await click(host, '[data-action="ready"]');
  await host.waitForSelector('[data-action="start"]:not([disabled])', { timeout: 5000 });
  await click(host, '[data-action="start"]');
  await guest.waitForSelector('.lv', { timeout: 5000 });
  // l'invité vote, l'hôte aussi : la partie doit avancer chez les deux
  await click(guest, '[data-action="vote"]:not([disabled])');
  await click(host, '[data-action="vote"]:not([disabled])');
  await guest.waitForFunction(() => !document.querySelector('[data-action="vote"][data-id^="go:"]'), null, { timeout: 8000 });
});

await step('Aucune erreur dans la console', async () => {
  const real = errors.filter((e) => !/favicon|fonts\.g/.test(e));
  if (real.length) throw new Error(real.slice(0, 3).join(' | '));
});

await browser.close();
await new Promise((r) => server.httpServer.close(r));
console.log(failed ? '\nÉCHEC du test de bout en bout.' : '\nTout le parcours fonctionne.');
process.exit(failed ? 1 : 0);
