const { chromium } = require('playwright');
const fs = require('fs');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ userAgent: UA });
  const page = await context.newPage();

  // pass the cloudflare challenge once on the plain site before hitting the api
  await page.goto('https://pointercrate.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(5000);

  async function gotoJSON(url, tries) {
    for (let i = 0; i < tries; i++) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await wait(700);
        const text = await page.evaluate(() => document.body.innerText);
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'data' in parsed) {
          return parsed.data;
        }
        return parsed;
      } catch (e) {
        console.log('  retrying ' + url + ' (' + e.message.split('\n')[0] + ')');
      }
      await wait(4000);
    }
    return null;
  }

  // 1. paginate the whole demon list
  console.log('fetching list...');
  let all = [];
  let after = '';
  let safety = 0;
  while (safety < 30) {
    safety++;
    const url = 'https://pointercrate.com/api/v2/demons/?limit=100' + (after ? '&after=' + after : '');
    const batch = await gotoJSON(url, 3);
    if (!Array.isArray(batch) || batch.length === 0) break;
    all = all.concat(batch);
    if (batch.length < 100) break;
    const next = batch[batch.length - 1].id;
    if (String(next) === after) break;
    after = String(next);
    await wait(500);
  }

  const demons = all
    .filter((d) => d && d.position != null && d.position <= 150)
    .sort((a, b) => a.position - b.position);
  console.log('list ok:', demons.length, 'demons (position <= 150)');

  // 2. per-demon details for verifier/publisher + completion records
  const cap = Number(process.argv[2] || 0); // optional limit for testing
  const records = {};
  let failures = 0;
  for (let i = 0; i < demons.length; i++) {
    if (cap && i >= cap) break;
    const d = demons[i];
    const detail = await gotoJSON('https://pointercrate.com/api/v2/demons/' + d.id, 2);
    if (detail && Array.isArray(detail.records)) {
      records[d.id] = detail.records.map((r) => ({
        player: r.player ? { id: r.player.id, name: r.player.name } : null,
        progress: r.progress,
        status: r.status,
        video: r.video
      }));
    } else {
      failures++;
      records[d.id] = [];
    }
    await wait(350);
    if ((i + 1) % 25 === 0) console.log('  ...' + (i + 1) + '/' + (cap || demons.length) + ' details');
  }
  console.log('details done:', (cap || demons.length) - failures, 'ok,', failures, 'failed');

  // 3. write data
  const list = demons.map((d) => ({
    id: d.id, position: d.position, name: d.name,
    requirement: d.requirement, video: d.video, thumbnail: d.thumbnail,
    publisher: d.publisher, verifier: d.verifier, level_id: d.level_id
  }));
  fs.writeFileSync('data/demonlist.json', JSON.stringify(list, null, 2) + '\n');
  fs.writeFileSync(
    'data/records.json',
    JSON.stringify({ updated_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), demons: records }, null, 2) + '\n'
  );
  fs.writeFileSync('data/updated_at.txt', new Date().toISOString().replace(/\.\d+Z$/, 'Z'));

  await browser.close();
  console.log('success:', list.length, 'entries, records for', Object.keys(records).length, 'demons');
}

main().catch((e) => { console.error(e); process.exit(1); });