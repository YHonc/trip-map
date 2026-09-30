async page => {
  const base = new URL(page.url()).origin;
  if (base !== 'http://127.0.0.1:32146') throw new Error('Use the isolated fixture only');
  await page.reload();
  await page.getByRole('button', { name: '编辑行程名称', exact: true }).waitFor();
  await page.locator('.startup-overlay').waitFor({ state: 'hidden' });
  const rename = async name => {
    await page.getByRole('button', { name: '编辑行程名称', exact: true }).click();
    await page.getByRole('textbox', { name: '行程名称', exact: true }).fill(name);
    await page.getByRole('button', { name: '保存', exact: true }).click();
  };
  const flush = () => page.evaluate(() => window.tripMapFlush());
  await rename('计划A 已保存编辑');
  if (!await flush()) throw new Error('Initial save failed');
  const initial = await (await page.request.get(`${base}/api/plans`)).json();
  const a = initial.plans.find(p => p.trip.id === initial.currentId);
  const b = structuredClone(a); b.trip.id = 'fixture-import-b'; b.trip.name = '计划B 导入';
  await page.getByRole('button', { name: '导入 / 导出', exact: true }).click();
  await page.getByLabel('选择行程 JSON 文件', { exact: true }).setInputFiles({ name: 'plan-b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(b)) });
  await page.getByRole('button', { name: '导入此行程', exact: true }).click();
  await page.getByRole('combobox', { name: '切换旅行计划' }).filter({ hasText: b.trip.name }).waitFor();
  if (!await flush()) throw new Error('Import save failed');
  let saved = await (await page.request.get(`${base}/api/plans`)).json();
  if (saved.plans.find(p => p.trip.id === a.trip.id).trip.name !== '计划A 已保存编辑') throw new Error('Import reverted plan A');
  await page.getByRole('combobox', { name: '切换旅行计划' }).click();
  await page.getByRole('option').filter({ hasText: '计划A 已保存编辑' }).click();
  await page.getByRole('combobox', { name: '切换旅行计划' }).filter({ hasText: '计划A 已保存编辑' }).waitFor();
  if (!await flush()) throw new Error('Switch save failed');
  let release, started;
  const gate = new Promise(resolve => { release = resolve; });
  const entered = new Promise(resolve => { started = resolve; });
  let intercept = true;
  await page.route('**/api/plans', async route => {
    if (route.request().method() === 'PUT' && intercept) { intercept = false; started(); await gate; }
    await route.continue();
  });
  try {
    await rename('计划A 保存中');
    await entered;
    await page.getByRole('combobox', { name: '切换旅行计划' }).click();
    await page.getByRole('option').filter({ hasText: '计划B 导入' }).click();
    // Switching waits for the pending save. A later edit must survive that wait.
    await rename('计划A 等待期间的新编辑');
    release();
    await page.getByRole('combobox', { name: '切换旅行计划' }).filter({ hasText: '计划B 导入' }).waitFor();
    if (!await flush()) throw new Error('Delayed switch failed');
  } finally { release(); await page.unroute('**/api/plans'); }
  saved = await (await page.request.get(`${base}/api/plans`)).json();
  if (saved.plans.find(p => p.trip.id === a.trip.id).trip.name !== '计划A 等待期间的新编辑') throw new Error('Switch lost edits made while saving');
  await page.reload();
  await page.getByRole('combobox', { name: '切换旅行计划' }).filter({ hasText: '计划B 导入' }).waitFor();
  return { passed: ['import preserves edits of previous plan', 'switch waits for in-flight save', 'edits made during switch survive', 'current plan persists after reload'] };
}
