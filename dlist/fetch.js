const { chromium } = require('playwright');
const fs = require('fs');

async function gotoWithRetry(page, url, attempts) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      return;
    } catch (e) {
      lastErr = e;
      console.log('nav attempt ' + (i + 1) + ' failed: ' + e.message);
      await page.waitForTimeout(3000);
    }
  }
  throw lastErr;
}

async function fetchPage(page, after) {
  const url = 'https://pointercrate.com/api/v2/demons/?limit=100' + (after ? ('&after=' + after) : '');
  await gotoWithRetry(page, url, 3);
  await page.waitForTimeout(3000);
  const text = await page.evaluate(() => document.body.innerText);
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error('non-JSON response for ' + url + ' — first 800 chars:');
    console.error(text.slice(0, 800));
    throw e;
  }
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  // pass the challenge once on the plain site before hammering the API
  await gotoWithRetry(page, 'https://pointercrate.com/', 3);
  await page.waitForTimeout(6000);

  let all = [];
  let afterId = 0;
  let safety = 0;

  try {
    while (safety < 20) {
      safety++;
      const batch = await fetchPage(page, afterId);
      if (!Array.isArray(batch) || batch.length === 0) break;
      all = all.concat(batch);
      if (batch.length < 100) break;
      afterId = batch[batch.length - 1].id;
      await page.waitForTimeout(2000);
    }
  } catch (e) {
    console.error('failed while paginating:', e.message);
    if (all.length === 0) {
      await browser.close();
      process.exit(1);
    }
    // fall through and save whatever we got so far
  }

  fs.mkdirSync('data', { recursive: true });
  all = all.filter(function(d){ return d.position && d.position <= 150; });
  all.sort((a, b) => (a.position || 0) - (b.position || 0));
  fs.writeFileSync('data/demonlist.json', JSON.stringify(all, null, 2));
  fs.writeFileSync('data/updated_at.txt', new Date().toISOString().replace(/\.\d+Z$/, 'Z'));
  console.log('success:', all.length, 'entries fetched');

  await browser.close();
})();


