/*
  Page-by-page QA sweep: every page and overlay, at four widths, light and dark, English and Hebrew.
  Writes screenshots and a findings list (overflow, clipped labels, overlaps, broken images, unlabeled controls,
  untranslated Hebrew chrome, console and HTTP errors).
  Usage: BASE=http://localhost:8020 node e2e/qa-sweep.js [out-dir]
*/
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:8020';
const OUT = process.argv[2] || '/tmp/qa/';
const fs = require('fs'); fs.mkdirSync(OUT, { recursive: true });
const PAGES = [
  ['today', '/'], ['deals', '/deals'], ['board', '/pipeline'], ['deal', '/deal/1'], ['leads', '/leads'], ['lead', '/lead/3'],
  ['companies', '/companies'], ['company', '/company/1'], ['people', '/contacts'], ['person', '/contact/1'], ['tasks', '/tasks'], ['task', '/task/1'],
  ['notes', '/notes'], ['note', '/note/1'], ['rules', '/automations'],
];
const OVERLAYS = ['new-deal-form', 'assistant', 'search', 'account-menu', 'bell-menu', 'rule-editor', 'deals-proposal'];
const COMBOS = [
  ['en-light-1440', 1440, 900, 'light', 'en'], ['en-light-1024', 1024, 768, 'light', 'en'], ['en-light-768', 768, 1024, 'light', 'en'], ['en-light-390', 390, 844, 'light', 'en'],
  ['en-dark-1440', 1440, 900, 'dark', 'en'], ['en-dark-390', 390, 844, 'dark', 'en'],
  ['he-light-1440', 1440, 900, 'light', 'he'], ['he-light-390', 390, 844, 'light', 'he'], ['he-dark-1440', 1440, 900, 'dark', 'he'],
];
const findings = []; const log = (combo, page, kind, msg) => { findings.push({ combo, page, kind, msg }); };

async function audit(p, combo, name, he) {
  const r = await p.evaluate((he) => {
    const out = []; const vw = document.documentElement.clientWidth;
    const ov = document.documentElement.scrollWidth - vw; if (ov > 0) out.push(['overflow', `page is ${ov}px wider than the screen`]);
    const scrollers = (e) => { for (let n = e.parentElement; n && n !== document.body; n = n.parentElement) { const s = getComputedStyle(n); if (/(auto|scroll|hidden|clip)/.test(s.overflowX) && n.scrollWidth > n.clientWidth) return true; } return false; };
    const label = (e) => (e.getAttribute('aria-label') || e.innerText || e.className || e.tagName).toString().trim().slice(0, 40);
    for (const e of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const b = e.getBoundingClientRect(); if (!b.width || !b.height) continue;
      if (b.right > vw + 1 && !scrollers(e) && !e.closest('.nav') && getComputedStyle(e).position !== 'fixed') out.push(['offscreen', `${e.tagName}.${String(e.className).slice(0, 30)} "${label(e)}" ends at ${Math.round(b.right)} > ${vw}`]);
      if (b.left < -1 && !scrollers(e) && !e.closest('.nav')) out.push(['offscreen', `${e.tagName}.${String(e.className).slice(0, 30)} "${label(e)}" starts at ${Math.round(b.left)}`]);
      if (/^(BUTTON|A)$/.test(e.tagName) || e.matches('.stage,.tag,.chip,.seg > *,.views > *,.nav a')) {
        if (e.scrollWidth > e.clientWidth + 1 && cs.overflowX !== 'visible' ) out.push(['clipped', `"${label(e)}" is cut off`]);
        if (b.height > 70 && e.tagName === 'BUTTON' && !e.closest('.approval,.prop,.prompts')) out.push(['tall-button', `"${label(e)}" wraps to ${Math.round(b.height)}px`]);
      }
      if (e.tagName === 'IMG' && (!e.complete || e.naturalWidth === 0)) out.push(['broken-image', e.src]);
      if (/^(BUTTON|INPUT|SELECT|TEXTAREA)$/.test(e.tagName) && e.type !== 'hidden') {
        const lab = e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || (e.labels && e.labels.length) || e.innerText?.trim() || e.getAttribute('title') || e.closest('label') || e.getAttribute('placeholder');
        if (!lab) out.push(['unlabeled', `${e.tagName} ${String(e.className).slice(0, 30)} has no accessible name`]);
      }
    }
    // top bar: no two direct children overlap
    const kids = [...document.querySelectorAll('.top > *')].filter((k) => k.getBoundingClientRect().width && getComputedStyle(k).display !== 'none').map((k) => [k, k.getBoundingClientRect()]);
    for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) { const a = kids[i][1], c = kids[j][1]; if (a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1) out.push(['overlap', `top bar: ${label(kids[i][0])} overlaps ${label(kids[j][0])}`]); }
    // text overlapping the card edge: any text wider than its card
    for (const e of document.querySelectorAll('.page *, .deals-main *, .prop *, .info *, .log *')) {
      if (e.children.length || !e.textContent.trim()) continue; const b = e.getBoundingClientRect(); const card = e.closest('.page,.deals-main,.prop,.info,.log'); if (!card || !b.width) continue; const c = card.getBoundingClientRect();
      if (b.right > c.right + 1 || b.left < c.left - 1) { if (!scrollers(e)) out.push(['spills-card', `"${e.textContent.trim().slice(0, 40)}" leaves its card`]); }
    }
    // text contrast: composite every ancestor background over the page ground; a gradient counts as the accent teal it is drawn in
    {
      const parse = (c) => { const m = c.match(/[\d.]+/g); if (!m) return null; const [r, g, b, a = 1] = m.map(Number); return [r, g, b, a]; };
      const over = (top, bot) => { const a = top[3] + bot[3] * (1 - top[3]); return a === 0 ? [0, 0, 0, 0] : [0, 1, 2].map((i) => (top[i] * top[3] + bot[i] * bot[3] * (1 - top[3])) / a).concat(a); };
      const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const seenC = new Set();
      const w2 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = w2.nextNode(); n; n = w2.nextNode()) {
        const txt = n.textContent.trim(); const e = n.parentElement; if (!txt || !e || e.closest('svg,script,style')) continue;
        const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
        const bb = e.getBoundingClientRect(); if (!bb.width || !bb.height) continue;
        let bg = [0, 0, 0, 0], unknown = false, stops = null;
        for (let a = e; a; a = a.parentElement) { const s2 = getComputedStyle(a); if (s2.backgroundImage !== 'none' && /gradient/.test(s2.backgroundImage)) { const own = parse(s2.backgroundColor); if (own && own[3] > 0.99) { bg = over(bg, own); break; } stops = (s2.backgroundImage.match(/rgba?\([^)]*\)/g) || []).map(parse).filter(Boolean); if (!stops.length) stops = [[14, 107, 102, 1]]; break; } const c = parse(s2.backgroundColor); if (c && c[3] > 0) bg = over(bg, c); if (bg[3] >= 0.999) break; }
        if (unknown) continue;
        if (!stops && bg[3] < 0.999) bg = over(bg, parse(getComputedStyle(document.documentElement).backgroundColor) || [255, 255, 255, 1]);
        if (!stops && bg[3] < 0.999) bg = over(bg, [255, 255, 255, 1]);
        const ratios = (stops ? stops.map((st) => over(bg, st)) : [bg]).map((bgc) => { const L1 = lum(over(parse(cs.color), bgc)), L2 = lum(bgc); return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05); }); const ratio = Math.min(...ratios);
        const big = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && +cs.fontWeight >= 700);
        const need = big ? 3 : 4.5;
        if (ratio < need - 0.05) { const k = txt.slice(0, 30) + e.className; if (seenC.has(k)) continue; seenC.add(k); out.push(['contrast', `${ratio.toFixed(2)}:1 "${txt.slice(0, 40)}" <${e.tagName}.${String(e.className).slice(0, 24)}>`]); }
      }
    }
    if (he) { // Latin-only UI text in Hebrew mode (record data excluded by listing for review)
      const seen = new Set();
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) { const s = n.textContent.trim(); const par = n.parentElement; if (!s || !par || getComputedStyle(par).display === 'none' || par.closest('a,td,option,.brand,.tl,.faint')) continue;
        if (/^[A-Za-z][A-Za-z ,.'’:?!()%-]{2,}$/.test(s) && !seen.has(s)) { seen.add(s); out.push(['english-in-hebrew', `${s.slice(0, 60)} <${par.className || par.tagName}>`]); } }
    }
    return out;
  }, he);
  for (const [k, m] of r) log(combo, name, k, m);
}

(async () => {
  const b = await chromium.launch();
  const tok = (await (await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@redline.dev', password: 'demo1234' }) })).json()).token;
  const H = { Authorization: 'Bearer ' + tok, 'content-type': 'application/json' };
  for (const [combo, w, h, theme, lang] of process.env.LANDING_ONLY ? [] : COMBOS) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await ctx.addInitScript(([t, th, l]) => { localStorage.setItem('redline.token', t); localStorage.setItem('redline.theme', th); localStorage.setItem('redline.lang', l); }, [tok, theme, lang]);
    const p = await ctx.newPage(); const dir = OUT + combo + '/'; fs.mkdirSync(dir, { recursive: true });
    p.on('pageerror', (e) => log(combo, p.url(), 'js-error', e.message)); p.on('console', (m) => { if (m.type() === 'error') log(combo, p.url(), 'console', m.text().slice(0, 160)); });
    p.on('response', (r) => { if (r.status() >= 400) log(combo, p.url(), 'http-' + r.status(), r.url().replace(B, '')); });
    const he = lang === 'he';
    for (const [name, path] of PAGES) {
      try { await p.goto(B + path); await p.waitForSelector('.top', { timeout: 8000 }); await p.waitForTimeout(700); await p.screenshot({ path: dir + name + '.png' }); await audit(p, combo, name, he);
        if (name === 'today' && !(await p.locator('.focus li').count())) { await p.getByRole('button', { name: he ? /לכתוב את המזכר/ : /Write today/ }).click(); await p.waitForSelector('.focus li', { timeout: 20000 }); await p.waitForTimeout(500); await p.screenshot({ path: dir + 'today-memo.png' }); await audit(p, combo, 'today-memo', he); } }
      catch (e) { log(combo, name, 'load-failed', e.message.split('\n')[0]); await p.screenshot({ path: dir + name + '-FAILED.png' }).catch(() => {}); }
    }
    const shot = async (name, fn) => { try { await fn(); await p.waitForTimeout(500); await p.screenshot({ path: dir + name + '.png' }); await audit(p, combo, name, he); } catch (e) { log(combo, name, 'load-failed', e.message.split('\n')[0]); await p.screenshot({ path: dir + name + '-FAILED.png' }).catch(() => {}); } };
    const acct = he ? 'חשבון והגדרות' : 'Account and settings';
    await shot('new-deal-form', async () => { await p.goto(B + '/deals'); await p.waitForSelector('.deals-table tbody tr'); await p.locator('.deals-head .primary').click(); await p.waitForSelector('.modal'); });
    await p.keyboard.press('Escape');
    await shot('assistant', async () => { await p.goto(B + '/deal/1'); await p.waitForSelector('.page-head h1'); await p.locator('.top button.circ').nth(2).click(); await p.waitForSelector('.assistant'); });
    await shot('search', async () => { await p.goto(B + '/'); await p.waitForSelector('.top'); await p.keyboard.press('Control+k'); await p.waitForSelector('.palette'); await p.keyboard.type(he ? 'ne' : 'negev'); await p.waitForSelector('.search-hits li'); });
    await p.keyboard.press('Escape');
    await shot('account-menu', async () => { await p.goto(B + '/'); await p.waitForSelector('.top'); await p.getByRole('button', { name: acct }).click(); await p.waitForSelector('.menu'); });
    await shot('bell-menu', async () => { await p.goto(B + '/'); await p.waitForSelector('.top'); await p.locator('.top button.circ').nth(1).click(); await p.waitForSelector('.menu'); });
    await shot('rule-editor', async () => { await p.goto(B + '/automations'); await p.waitForSelector('.rules li'); await p.locator('.rules li').first().locator('button').nth(0).click(); await p.waitForSelector('.modal'); });
    await ctx.close();
  }
  // proposal state, once per theme/lang/width that matters
  for (const [combo, w, h, theme, lang] of process.env.LANDING_ONLY ? [] : [['en-light-1440', 1440, 900, 'light', 'en'], ['en-light-390', 390, 844, 'light', 'en'], ['he-light-1440', 1440, 900, 'light', 'he'], ['en-dark-1440', 1440, 900, 'dark', 'en']]) {
    const th = await (await fetch(B + '/api/ai/threads', { method: 'POST', headers: H, body: JSON.stringify({ target_type: 'deal', target_id: 2 }) })).json();
    await fetch(B + `/api/ai/threads/${th.id}/messages`, { method: 'POST', headers: H, body: JSON.stringify({ text: lang === 'he' ? 'שיחה עם עדי: התקציב אושר על 240 אלף, רוצה הצעת מחיר' : 'Call with Adi: budget approved at 240K. She wants the proposal by Thursday and will decide by Dec 12.' }) });
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    await ctx.addInitScript(([t, thm, l]) => { localStorage.setItem('redline.token', t); localStorage.setItem('redline.theme', thm); localStorage.setItem('redline.lang', l); }, [tok, theme, lang]);
    const p = await ctx.newPage(); const dir = OUT + combo + '/'; p.on('pageerror', (e) => log(combo, 'deals-proposal', 'js-error', e.message));
    try { await p.goto(B + '/deals?deal=2'); await p.waitForSelector('.prop', { timeout: 8000 }); await p.waitForTimeout(600); await p.screenshot({ path: dir + 'deals-proposal.png' }); await audit(p, combo, 'deals-proposal', lang === 'he'); }
    catch (e) { log(combo, 'deals-proposal', 'load-failed', e.message.split('\n')[0]); await p.screenshot({ path: dir + 'deals-proposal-FAILED.png' }).catch(() => {}); }
    await fetch(B + `/api/ai/threads/${th.id}/resolve`, { method: 'POST', headers: H, body: JSON.stringify({ decisions: {} }) });
    await ctx.close();
  }
  // the signed-out product page (it carries the working sample), in every theme and language
  for (const [combo, w, h, theme, lang] of [['en-light-1440', 1440, 900, 'light', 'en'], ['en-dark-1440', 1440, 900, 'dark', 'en'], ['en-dark-390', 390, 844, 'dark', 'en'], ['en-light-390', 390, 844, 'light', 'en'], ['he-dark-1440', 1440, 900, 'dark', 'he'], ['he-light-1440', 1440, 900, 'light', 'he']]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    await ctx.addInitScript(([thm, l]) => { localStorage.setItem('redline.theme', thm); localStorage.setItem('redline.lang', l); }, [theme, lang]);
    const p = await ctx.newPage(); const dir = OUT + combo + '/'; fs.mkdirSync(dir, { recursive: true });
    p.on('pageerror', (e) => log(combo, 'landing', 'js-error', e.message));
    try { await p.goto(B + '/'); await p.waitForSelector('.approval-item', { timeout: 8000 }); await p.waitForTimeout(600); await p.screenshot({ path: dir + 'landing.png', fullPage: true }); await audit(p, combo, 'landing', lang === 'he'); }
    catch (e) { log(combo, 'landing', 'load-failed', e.message.split('\n')[0]); }
    await ctx.close();
  }
  await b.close();
  fs.writeFileSync(OUT + 'findings.json', JSON.stringify(findings, null, 1));
  const uniq = new Map(); for (const f of findings) { const k = `${f.kind}|${f.page}|${f.msg}`; if (!uniq.has(k)) uniq.set(k, []); uniq.get(k).push(f.combo); }
  for (const [k, c] of uniq) console.log(`[${k}] ${c.join(',')}`);
  console.log(`\n${findings.length} raw findings, ${uniq.size} distinct`);
})();
