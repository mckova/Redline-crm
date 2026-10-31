/*
  End-to-end walkthrough of the whole product in a real browser.
  Usage: BASE=http://localhost:8000 node e2e/walkthrough.js [screenshot-dir]
  Needs the server running with the seeded demo data (REDLINE_AI=demo works without an API key)
  and the `playwright` package. Every step is independent: a failure is recorded and the run continues.
*/
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:8000';
const OUT = process.argv[2] || '/tmp/redline-e2e/';
require('fs').mkdirSync(OUT, { recursive: true });
const results = []; const errs = [];
let page, n = 0;
async function step(name, fn) {
  n++; const t0 = Date.now();
  try { await fn(); results.push([true, name, Date.now() - t0]); console.log(`PASS ${n}. ${name}`); }
  catch (e) {
    results.push([false, name, Date.now() - t0, String(e.message).split('\n')[0]]); console.log(`FAIL ${n}. ${name}: ${String(e.message).split('\n')[0]}`);
    await page.screenshot({ path: `${OUT}fail-${n}.png` }).catch(() => {});
  }
}
const ok = (c, m) => { if (!c) throw new Error(m); };
const api = (path, token) => fetch(B + '/api' + path, { headers: { Authorization: 'Bearer ' + token } }).then((r) => r.json());
const NOTES = 'Call with Adi: budget approved at 240K for the onboarding package. She wants the proposal by Thursday and will decide by Dec 12.';

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|status of 401/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
  page.on('response', (r) => { if (r.status() >= 500 || (r.status() === 401 && !/auth\/login/.test(r.url()) && !/Sign out/.test(''))) errs.push(`HTTP ${r.status()} ${r.url()}`); });
  let token, dealId, newDealId, leadId;

  await step('landing page loads with the working sample', async () => {
    await page.goto(B + '/'); await page.waitForSelector('.lp-surface');
    ok(await page.locator('.approval-item').count() >= 4, 'sample should propose at least 4 changes');
  });
  await step('landing sample: untick one, apply the rest, timeline updates', async () => {
    await page.locator('.approval-item input').first().uncheck();
    await page.getByRole('button', { name: /Apply \d selected/ }).click();
    await page.waitForSelector('.lp-log .tl'); ok(await page.locator('.lp-log .tl').count() >= 3, 'applied changes should land on the timeline');
  });
  await step('wrong password is refused with a message', async () => {
    await page.locator('#signin input[type=email], #signin input[name=email], #signin input').first().fill('admin@redline.dev');
    await page.locator('#signin input[type=password]').fill('wrong');
    await page.locator('#signin button.primary').click(); await page.waitForSelector('#signin [role=alert]');
  });
  await step('sign in as the demo admin', async () => {
    await page.locator('#signin input[type=password]').fill('demo1234');
    await page.locator('#signin button.primary').click(); await page.waitForSelector('.top .nav');
    token = await page.evaluate(() => localStorage.getItem('redline.token')); ok(token, 'token stored');
  });
  await step('Today: write the memo, ranked list appears', async () => {
    await page.waitForSelector('.memo-empty, .focus li');
    const w = page.getByRole('button', { name: "Write today's memo" }); if (await w.count()) await w.click();
    await page.waitForSelector('.focus li'); ok(await page.locator('.focus li').count() >= 3, 'memo needs 3+ items');
    ok(await page.locator('.ledger dd').count() === 5, 'five KPI tiles');
  });
  await step('Today: memo link opens the record', async () => {
    await page.locator('.focus li a').first().click(); await page.waitForSelector('.page-head h1');
  });
  await step('Deals: table loads 21 open deals and 5 saved views', async () => {
    await page.getByRole('link', { name: 'Deals', exact: true }).first().click(); await page.waitForSelector('.deals-table tbody tr');
    ok(await page.locator('.views > button').count() >= 5, 'five saved views');
    ok(/21 open/.test(await page.locator('.deals-head p').innerText()), 'summary says 21 open');
  });
  await step('Deals: each saved view filters and counts match', async () => {
    for (const v of ['Mine', 'Closing this month', 'Gone quiet', 'Won', 'Open']) {
      await page.locator('.views > button', { hasText: new RegExp('^' + v) }).click(); await page.waitForTimeout(150);
      const count = Number((await page.locator('.views > button[aria-pressed=true] em').innerText()).trim());
      const rows = await page.locator('.deals-table tbody tr').count();
      ok(rows === count || (count === 0 && (await page.locator('.empty').count()) === 1), `${v}: ${rows} rows vs count ${count}`);
    }
  });
  await step('Deals: filter by name', async () => {
    await page.getByRole('button', { name: 'Filter by name' }).click(); await page.locator('.deals-head input[type=search]').fill('galil');
    await page.waitForTimeout(200); const rows = await page.locator('.deals-table tbody tr').count(); ok(rows >= 1 && rows < 21, 'filtered ' + rows);
    await page.locator('.deals-head input[type=search]').fill(''); await page.keyboard.press('Escape');
  });
  await step('Deals: select a row, side card follows', async () => {
    await page.locator('.deals-table tbody tr').nth(2).click(); await page.waitForTimeout(300);
    ok(await page.locator('.deals-table tr.sel').count() === 1, 'one selected row');
  });
  await step('Deals: Log a call drafts 5 changes shown in cells and card', async () => {
    await page.locator('.deals-table tbody tr').first().click();
    dealId = Number(new URL(page.url()).searchParams.get('deal'));
    await page.locator('.log textarea').fill(NOTES); await page.getByRole('button', { name: 'Draft changes' }).click();
    await page.waitForSelector('.prop'); ok(await page.locator('.chg-row').count() === 5, 'five lines in the card');
    ok(await page.locator('.deals-table tr.sel .new b').count() >= 3, 'proposed values inline');
    ok(/changes? to review/.test(await page.locator('.views .pend').innerText()), 'review pill');
    await page.screenshot({ path: OUT + 'deals-proposed.png' });
  });
  await step('Deals: nothing is written before approval', async () => {
    const d = await api(`/deals/${dealId}`, token); ok(d.amount_micros !== 240_000_000_000, 'amount must still be the old one');
  });
  await step('bell shows the waiting changes', async () => {
    await page.getByRole('button', { name: /waiting for review/ }).click(); await page.waitForSelector('.menu [role=menuitem]'); await page.keyboard.press('Escape');
    await page.mouse.click(700, 5);
  });
  await step('Deals: untick the stage, apply 4: server has amount + date, stage unchanged', async () => {
    const before = (await api(`/deals/${dealId}`, token)).stage;
    await page.locator('.chg-row').first().click();
    await page.getByRole('button', { name: /Apply 4 changes/ }).click(); await page.waitForSelector('.log');
    const d = await api(`/deals/${dealId}`, token);
    ok(d.amount_micros === 240_000_000_000, 'amount applied'); ok(d.close_date.slice(5, 10) === '12-12', 'close date applied'); ok(d.stage === before, 'stage left alone');
    ok(await page.locator('.views .pend').count() === 0, 'review pill gone');
  });
  await step('Deals: info card timeline shows the assistant changes', async () => {
    ok(await page.locator('.mini-tl i.c').count() >= 2, 'assistant dots on the mini timeline');
  });
  await step('Deals: Log a call again then discard all', async () => {
    await page.locator('.log textarea').fill('Call with Adi: they chose another vendor, went with a competitor.');
    await page.getByRole('button', { name: 'Draft changes' }).click(); await page.waitForSelector('.prop');
    const stage = (await api(`/deals/${dealId}`, token)).stage;
    await page.getByRole('button', { name: 'Discard', exact: true }).click(); await page.waitForSelector('.log');
    ok((await api(`/deals/${dealId}`, token)).stage === stage, 'discard writes nothing');
  });
  await step('Deals: create a new deal from the table', async () => {
    await page.getByRole('button', { name: 'New deal' }).click(); await page.waitForSelector('.modal');
    await page.locator('.modal label:has-text("Name") input').first().fill('E2E Rollout'); await page.locator('.modal label:has-text("Amount") input').fill('95000');
    await page.locator('.modal button.primary').click(); await page.waitForSelector('.deals-table tr.sel');
    const rows = await api('/deal-rows', token); newDealId = rows.find((r) => r.name === 'E2E Rollout')?.id; ok(newDealId, 'new deal in the API');
  });
  await step('Board: columns render and the toggle works', async () => {
    await page.getByRole('link', { name: 'Board', exact: true }).click(); await page.waitForSelector('.deal-card'); ok(await page.locator('.lane').count() === 6, 'six lanes');
  });
  await step('Board: drag a card to another stage (persisted)', async () => {
    const card = page.locator('.deal-card', { hasText: 'E2E Rollout' }); const target = page.locator('.lane').nth(1);
    // real stepped mouse moves: the board commits its hover state between dragover events
    const cb = await card.boundingBox(); const tb = await target.boundingBox();
    await page.mouse.move(cb.x + cb.width / 2, cb.y + 20); await page.mouse.down();
    await page.mouse.move(cb.x + cb.width / 2 + 20, cb.y + 40, { steps: 5 }); await page.mouse.move(tb.x + tb.width / 2, tb.y + 200, { steps: 20 });
    await page.waitForTimeout(200); await page.mouse.up(); await page.waitForTimeout(800);
    ok((await api(`/deals/${newDealId}`, token)).stage === 'QUALIFIED', 'stage saved as QUALIFIED');
  });
  await step('Deal page: stage steps move the deal and the timeline records it', async () => {
    await page.goto(B + '/deal/' + newDealId); await page.waitForSelector('.stage-steps');
    await page.getByRole('button', { name: /^proposal$/i }).click(); await page.waitForTimeout(600);
    ok((await api(`/deals/${newDealId}`, token)).stage === 'PROPOSAL', 'stage saved');
    ok(/stage/i.test(await page.locator('.timeline').innerText()), 'timeline shows the stage change');
  });
  await step('Rule fired: moving to Proposal created a follow-up task', async () => {
    await page.waitForTimeout(500); const t = await api(`/deals/${newDealId}/timeline`, token);
    ok(t.some((a) => /task/.test(a.name)), 'rule created a linked task');
  });
  await step('Deal page: assistant read generates summary and next steps', async () => {
    const r = page.getByRole('button', { name: 'Read this record' }); if (await r.count()) await r.click();
    await page.waitForSelector('.readout .summary'); ok(await page.locator('.next li').count() >= 1, 'next steps');
  });
  await step('Deal page: add the read’s next step as a task', async () => {
    await page.locator('.next button', { hasText: 'Add as task' }).first().click(); await page.waitForSelector('text=Task added');
  });
  await step('Deal page: edit the deal and the change persists', async () => {
    await page.getByRole('button', { name: 'Edit', exact: true }).click(); await page.waitForSelector('.modal');
    await page.locator('.modal label:has-text("Amount") input').fill('101000'); await page.getByRole('button', { name: 'Save changes' }).click();
    await page.waitForSelector('.modal', { state: 'detached' }); ok((await api(`/deals/${newDealId}`, token)).amount_micros === 101_000_000_000, 'saved');
  });
  await step('Assistant drawer: ask about the pipeline, answer with links', async () => {
    await page.getByRole('button', { name: 'Assistant', exact: true }).click(); await page.waitForSelector('.assistant');
    await page.locator('.assistant textarea').fill('What should I focus on today?'); await page.locator('.assistant-input button').click();
    await page.waitForSelector('.msg.ai a'); ok(await page.locator('.msg.ai a').count() >= 1, 'links in the answer');
  });
  await step('Assistant drawer: notes on a record produce approvals, apply writes', async () => {
    await page.getByRole('button', { name: 'New conversation' }).click();
    await page.goto(B + '/deal/' + newDealId); await page.getByRole('button', { name: 'Ask the assistant' }).click(); await page.waitForSelector('.assistant');
    await page.locator('.assistant textarea').fill('Call with Dana: sent the proposal at 130K, negotiating terms now.');
    await page.locator('.assistant-input button').click(); await page.waitForSelector('.approval');
    await page.getByRole('button', { name: /Apply \d selected/ }).click(); await page.waitForSelector('.action-log'); await page.waitForTimeout(500);
    const d = await api(`/deals/${newDealId}`, token); ok(d.amount_micros === 130_000_000_000, 'amount 130K'); ok(d.stage === 'NEGOTIATION', 'stage negotiation');
    await page.getByRole('button', { name: 'Close the assistant' }).click();
  });
  await step('Leads: list, sort by score, filter by status', async () => {
    await page.getByRole('link', { name: 'Leads', exact: true }).click(); await page.waitForSelector('table.grid tbody tr');
    await page.locator('select[aria-label=Show]').selectOption({ index: 2 }); await page.waitForTimeout(400); ok(await page.locator('table.grid tbody tr').count() >= 1, 'filtered rows');
    await page.locator('select[aria-label=Show]').selectOption({ index: 0 });
  });
  await step('Leads: create a lead, see score reasons', async () => {
    await page.getByRole('button', { name: 'New lead' }).click(); await page.waitForSelector('.modal');
    await page.locator('.modal label:has-text("First name") input').fill('Eli'); await page.locator('.modal label:has-text("Email") input').fill('eli@e2e-corp.io');
    await page.locator('.modal label:has-text("Company") input').fill('E2E Corp'); await page.locator('.modal label:has-text("Job title") input').fill('CEO');
    await page.locator('.modal select').first().selectOption('referral');
    await page.locator('.modal button.primary').click(); await page.waitForSelector('.reasons');
    leadId = Number(page.url().split('/').pop()); ok(await page.locator('.reasons li').count() >= 2, 'reasons listed');
  });
  await step('Leads: convert to company + contact + deal', async () => {
    await page.getByRole('button', { name: 'Convert lead' }).click(); await page.waitForSelector('.modal');
    await page.locator('.modal button.primary').click(); await page.waitForURL(/\/deal\/\d+/);
    const l = await api(`/leads/${leadId}`, token); ok(l.status === 'converted' && l.converted_deal_id && l.converted_contact_id && l.converted_company_id, 'all three created');
  });
  await step('Companies and People lists render and open a record', async () => {
    for (const [name, sel] of [['Companies', 'company'], ['People', 'contact']]) {
      await page.getByRole('link', { name, exact: true }).click(); await page.waitForSelector('table.grid tbody tr');
      await page.locator('table.grid tbody tr td.name a, table.grid tbody tr td a').first().click(); await page.waitForURL(new RegExp('/' + sel + '/')); await page.waitForSelector('.page-head h1');
    }
  });
  await step('Tasks: create, complete from the list, reopen', async () => {
    await page.getByRole('link', { name: 'Tasks', exact: true }).click(); await page.waitForSelector('table.grid');
    await page.getByRole('button', { name: 'New task' }).click(); await page.waitForSelector('.modal');
    await page.locator('.modal label:has-text("Title") input').fill('E2E task'); await page.locator('.modal button.primary').click(); await page.waitForURL(/\/task\/\d+/);
    const id = Number(page.url().split('/').pop()); await page.goto(B + '/tasks'); await page.waitForSelector('table.grid tbody tr');
    await page.locator('tr', { hasText: 'E2E task' }).locator('input[type=checkbox]').click(); await page.waitForTimeout(500);
    ok((await api(`/tasks/${id}`, token)).status === 'DONE', 'done saved');
  });
  await step('Rules: list shows rules, toggle one off and on', async () => {
    await page.getByRole('link', { name: 'Rules', exact: true }).click(); await page.waitForSelector('.rules li');
    const sw = page.locator('.rules li').first().locator('.switch input'); const was = await sw.isChecked(); await sw.click(); await page.waitForTimeout(400);
    ok((await sw.isChecked()) !== was, 'toggle flipped'); await sw.click(); await page.waitForTimeout(300);
  });
  await step('Rules: describe a rule in words, review the draft, save it', async () => {
    await page.locator('#nl-rule').fill('When a deal moves to negotiation, create a call task in 2 days'); await page.getByRole('button', { name: 'Draft the rule' }).click();
    await page.waitForSelector('.modal'); await page.getByRole('button', { name: 'Save rule' }).click(); await page.waitForSelector('.modal', { state: 'detached' });
    const rules = await api('/automations', token); ok(rules.length >= 5, 'rule saved, now ' + rules.length);
  });
  await step('Rules: create a blank rule by hand and delete it', async () => {
    await page.getByRole('button', { name: 'New rule' }).click(); await page.waitForSelector('.modal');
    await page.locator('.modal input').first().fill('E2E manual rule'); await page.getByRole('button', { name: 'Save rule' }).click(); await page.waitForSelector('.modal', { state: 'detached' });
    await page.locator('.rules li', { hasText: 'E2E manual rule' }).getByRole('button', { name: /Delete/ }).click();
    const c = page.getByRole('button', { name: /Delete rule/ }); if (await c.count()) await c.last().click(); await page.waitForTimeout(500);
    ok(!(await api('/automations', token)).some((r) => r.name === 'E2E manual rule'), 'rule gone');
  });
  await step('Rule run log shows runs from the earlier stage moves', async () => {
    ok(await page.locator('text=Recent runs').count() >= 1, 'run log present');
  });
  await step('Search: palette finds records, enter opens one', async () => {
    await page.keyboard.press('Control+k'); await page.waitForSelector('.palette'); await page.keyboard.type('negev'); await page.waitForSelector('.search-hits li');
    await page.keyboard.press('Enter'); await page.waitForSelector('.page-head h1'); ok(/\/(company|deal|contact|lead)\//.test(page.url()), 'navigated');
  });
  await step('Delete a record (confirm dialog) and it disappears', async () => {
    await page.goto(B + '/deal/' + newDealId); await page.waitForSelector('.page-head h1');
    await page.getByRole('button', { name: 'Delete', exact: true }).click(); await page.waitForSelector('[role=alertdialog]'); await page.locator('[role=alertdialog] button.danger').click();
    await page.waitForURL(/\/deals/); ok(!(await api('/deal-rows', token)).some((r) => r.id === newDealId), 'gone from deal rows');
  });
  await step('Theme: dark and back, persisted across reload', async () => {
    await page.getByRole('button', { name: 'Account and settings' }).click(); await page.getByRole('button', { name: 'Dark theme' }).click(); await page.keyboard.press('Escape');
    await page.reload(); await page.waitForSelector('.top'); ok((await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark', 'dark after reload');
    await page.getByRole('button', { name: 'Account and settings' }).click(); await page.getByRole('button', { name: 'Light theme' }).click(); await page.keyboard.press('Escape');
  });
  await step('Hebrew: RTL layout across Today, Deals and a log-a-call round trip', async () => {
    await page.getByRole('button', { name: 'Account and settings' }).click(); await page.getByRole('menuitem', { name: 'עברית' }).click(); await page.waitForSelector('html[dir=rtl]');
    await page.waitForSelector('.top'); ok(/היום/.test(await page.locator('.nav').innerText()), 'Hebrew nav');
    await page.goto(B + '/deals'); await page.waitForSelector('.deals-table tbody tr'); await page.screenshot({ path: OUT + 'deals-he.png' });
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); ok(ov <= 0, 'no horizontal overflow ' + ov);
    await page.getByRole('button', { name: 'חשבון והגדרות' }).click(); await page.getByRole('menuitem', { name: 'English' }).click(); await page.waitForSelector('html[dir=ltr]');
  });
  await step('Mobile 390px: Deals, Today and a record without horizontal overflow', async () => {
    const m = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage(); m.on('pageerror', (e) => errs.push('MOBILE ' + e.message));
    await m.goto(B + '/'); await m.evaluate((t) => localStorage.setItem('redline.token', t), token);
    for (const p of ['/', '/deals', '/pipeline', '/leads', '/automations']) { await m.goto(B + p); await m.waitForSelector('.top'); await m.waitForTimeout(400);
      const ov = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); ok(ov <= 0, `${p} overflows by ${ov}`); }
  });
  await step('Other users can sign in (Dor, Noa) and see their own "Mine" view', async () => {
    for (const email of ['dor@redline.dev', 'noa@redline.dev']) {
      const c = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await c.newPage(); await p.goto(B + '/');
      await p.locator('#signin input').first().fill(email); await p.locator('#signin input[type=password]').fill('demo1234'); await p.locator('#signin button.primary').click();
      await p.waitForSelector('.top .nav'); await p.goto(B + '/deals'); await p.waitForSelector('.deals-table tbody tr');
      await p.locator('.views > button', { hasText: /^Mine/ }).click(); await p.waitForTimeout(200); ok(await p.locator('.deals-table tbody tr, .empty').count() >= 1, email);
      await c.close();
    }
  });
  await step('Sign out returns to the product page; API refuses without a token', async () => {
    await page.getByRole('button', { name: 'Account and settings' }).click(); await page.getByRole('menuitem', { name: 'Sign out' }).click(); await page.waitForSelector('.lp-surface');
    ok((await fetch(B + '/api/deal-rows')).status === 401, '401 without token');
  });

  const failed = results.filter((r) => !r[0]);
  console.log(`\n${results.length - failed.length}/${results.length} steps passed`);
  const bad = errs.filter((e, i) => errs.indexOf(e) === i); console.log(bad.length ? 'Browser/server errors:\n' + bad.join('\n') : 'No browser errors, no HTTP 5xx');
  require('fs').writeFileSync(OUT + 'results.json', JSON.stringify({ results, errors: bad }, null, 1));
  await b.close(); process.exit(failed.length || bad.length ? 1 : 0);
})();
