async (page) => {
  // Run only in the dedicated stage-local test session.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(1000);
  const passed = [];
  const assert = (value, message) => { if (!value) throw new Error(message); passed.push(message); };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('combobox', { name: '搜索地点、地址、景区' }).press('Escape');
  for (const [width, height] of [[1280, 900], [1440, 900], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(350);
    assert(await page.evaluate(() => document.documentElement.scrollHeight === innerHeight && document.documentElement.scrollWidth === innerWidth), `${width}×${height}: no document overflow`);
    const controls = await page.locator('.map-controls').boundingBox();
    const drawer = await page.locator('.favorite-drawer').boundingBox();
    assert(controls.y + controls.height <= drawer.y, `${width}: map controls clear favorites`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: '收起Day 1', exact: true }).click();
  await page.getByTestId('day-1').locator('.day-toggle').click();
  assert(await page.getByRole('button', { name: '展开Day 1', exact: true }).isVisible(), 'selecting day does not expand it');
  await page.getByRole('button', { name: '展开Day 1', exact: true }).click();
  await page.getByRole('button', { name: '收起上午路线', exact: true }).click();
  await page.getByTestId('route-1').locator('.route-toggle').click();
  assert(await page.getByRole('button', { name: '展开上午路线', exact: true }).isVisible(), 'selecting route does not expand it');
  await page.getByRole('button', { name: '展开上午路线', exact: true }).click();
  const transfer = page.getByRole('combobox', { name: '转场 上午路线 到 下午路线 交通方式' });
  await transfer.press('Enter');
  await page.getByRole('option', { name: '骑行', exact: true }).click();
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  assert(await transfer.inputValue() === 'driving', 'transfer edit is one undo transaction');
  await page.getByRole('checkbox', { name: '转场：上午路线 → 下午路线' }).uncheck();
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  assert(await page.getByRole('checkbox', { name: '转场：上午路线 → 下午路线' }).isChecked(), 'transfer enablement is undoable');
  await page.waitForTimeout(800);
  const legacy = await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('trip-map-v2'));
    delete data.version;
    data.trip.name = '旧行程迁移 fixture';
    for (const p of [...data.favorites, ...data.trip.days.flatMap(d => d.routes.flatMap(r => r.stops))]) { delete p.provider; delete p.coordinateSystem; }
    const raw = JSON.stringify(data);
    localStorage.removeItem('trip-map-v2'); localStorage.setItem('trip-map-v1', raw);
    return raw;
  });
  await page.reload();
  await page.getByRole('heading', { name: '旧行程迁移 fixture', exact: true }).waitFor();
  await page.waitForTimeout(800);
  assert(await page.evaluate(raw => localStorage.getItem('trip-map-v1-backup') === raw && localStorage.getItem('trip-map-v1') === raw, legacy), 'legacy migration preserves exact original and backup');
  const imported = JSON.parse(legacy); imported.trip.name = '文件选择器 fixture';
  await page.getByRole('button', { name: '导入 / 导出', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'fixture.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported)) });
  await page.getByRole('button', { name: '导入此行程', exact: true }).click();
  await page.getByRole('heading', { name: '文件选择器 fixture', exact: true }).waitFor();
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await page.getByRole('heading', { name: '旧行程迁移 fixture', exact: true }).waitFor();
  passed.push('JSON file imports; one undo restores previous trip');
  assert(errors.length === 0, 'no runtime page errors');
  await page.screenshot({ path: 'artifacts/stages-1440.png' });
  return { passed, errors };
}
