async (page) => {
  const passed = [], errors = [];
  const assert = (ok, message) => { if (!ok) throw new Error(message); passed.push(message); };
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('button', { name: 'AI 配置', exact: true }).click();
  await page.getByPlaceholder('已配置 · 留空保留现有密钥').waitFor();
  assert(await page.getByPlaceholder('已配置 · 留空保留现有密钥').inputValue() === '', 'saved key never returned to form');
  for (const [width, height] of [[1280, 900], [1440, 900], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    const box = await page.getByRole('dialog').boundingBox();
    assert(box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height, `AI config fits ${width}`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: 'artifacts/ai-config.png' });
  await page.getByRole('button', { name: '关闭弹窗' }).click();
  const places = await page.evaluate(async () => {
    const search = async q => (await (await fetch(`/api/amap/search?q=${encodeURIComponent(q)}`)).json()).places;
    return [(await search('上海外滩')).find(p => p.poiId === 'B00155FXB3'), (await search('上海豫园')).find(p => p.poiId === 'B00155MF55')];
  });
  assert(places.every(Boolean), 'real known POIs resolved');
  await page.evaluate(([a, b]) => {
    const stops = [a, b, a].map((p, order) => ({ ...p, id: `s${order}`, placeId: p.id, order }));
    localStorage.setItem('trip-map-v2', JSON.stringify({ version: 2, trip: { id: 'ai-fixture', name: 'AI 隔离联调', days: [{ id: 'day-1', name: 'Day 1', date: '2026-09-29', color: '#237bff', routes: [{ id: 'route-1', name: '联调路线', mode: 'walking', visible: true, color: '#237bff', stops }] }] }, favorites: [] }));
  }, places);
  await page.reload();
  await page.getByRole('button', { name: 'AI 路线助手', exact: true }).click();
  await page.getByRole('checkbox', { name: '固定各路线终点' }).uncheck();
  await page.getByRole('button', { name: '生成 AI 建议', exact: true }).click();
  await page.getByRole('heading', { name: '方案比较' }).waitFor({ timeout: 65000 });
  const preview = await page.locator('.ai-preview').innerText();
  assert(preview.includes('原方案') && preview.includes('候选方案'), 'real AI candidate and real AMap cost preview displayed');
  await page.screenshot({ path: 'artifacts/ai-preview.png' });
  const apply = page.getByRole('button', { name: '应用建议 · 可撤销' });
  if (await apply.isEnabled()) {
    await apply.click();
    await page.waitForTimeout(700);
    const order = await page.evaluate(() => JSON.parse(localStorage.getItem('trip-map-v2')).trip.days[0].routes[0].stops.map(s => s.id).join(','));
    assert(order !== 's0,s1,s2', 'AI application changes order');
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    await page.waitForTimeout(700);
    assert(await page.evaluate(() => JSON.parse(localStorage.getItem('trip-map-v2')).trip.days[0].routes[0].stops.map(s => s.id).join(',')) === 's0,s1,s2', 'one undo restores exact original order');
  } else passed.push('real candidate had no improvement; apply correctly disabled');
  assert(!errors.length, 'no browser runtime errors');
  return { passed, preview, errors };
}
