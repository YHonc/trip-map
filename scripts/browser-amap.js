async (page) => {
  const passed = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const assert = (value, message) => { if (!value) throw new Error(message); passed.push(message); };
  const places = await page.evaluate(async () => {
    const search = async q => (await (await fetch(`/api/amap/search?q=${encodeURIComponent(q)}`)).json()).places;
    const a = (await search('上海外滩')).find(p => p.poiId === 'B00155FXB3');
    const b = (await search('上海豫园')).find(p => p.poiId === 'B00155MF55');
    return [a, b];
  });
  assert(places.every(Boolean), 'known Bund and Yuyuan POIs returned');
  const modes = await page.evaluate(async places => {
    const results = [];
    for (const mode of ['driving', 'walking', 'riding']) {
      const point = p => ({ lng: p.lng, lat: p.lat });
      const response = await fetch('/api/amap/route', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ origin: point(places[0]), destination: point(places[1]), mode }) });
      const result = await response.json();
      results.push({ mode, ok: response.ok, source: result.source, meters: result.distance, seconds: result.duration, points: result.path?.length });
    }
    return results;
  }, places);
  assert(modes.every(result => result.ok && result.source === 'amap' && result.meters > 0 && result.seconds > 0 && result.points > 1), 'all three travel modes return real road geometry and costs');
  await page.evaluate(places => {
    const route = (id, stops) => ({ id, name: id, mode: 'walking', visible: true, color: '#237bff', stops: stops.map((p, order) => ({ ...p, id: `${id}-${order}`, placeId: p.id, order })) });
    localStorage.setItem('trip-map-v2', JSON.stringify({ version: 2, trip: { id: 'real-fixture', name: '高德真实联调', days: [{ id: 'day-1', name: 'Day 1', date: '2026-09-29', color: '#237bff', routes: [route('route-1', places), route('route-2', [places[0]])] }] }, favorites: places }));
  }, places);
  await page.reload();
  await page.getByRole('combobox', { name: '搜索地点、地址、景区' }).press('Escape');
  await page.locator('.amap-trip-marker').first().waitFor();
  await page.waitForFunction(() => document.querySelector('.route-cost-summary')?.textContent.includes('公里'));
  assert(await page.locator('.amap-trip-marker').count() === 3, 'three stops including repeated POI have independent markers');
  assert((await page.locator('.route-cost-summary').innerText()).includes('高德预计'), 'route and transfer totals use real results');
  await page.getByTestId('route-1').locator('.stop-main').first().click();
  await page.getByRole('region', { name: '地点详情' }).waitFor();
  await page.waitForTimeout(400);
  let box = await page.getByRole('region', { name: '地点详情' }).boundingBox();
  assert(box.x >= 395 && box.y >= 90 && box.y + box.height < 710, 'real marker detail lies above drawer');
  await page.getByRole('button', { name: '放大地图' }).click();
  await page.waitForTimeout(400);
  box = await page.getByRole('region', { name: '地点详情' }).boundingBox();
  assert(Number.isFinite(box.x), 'popover follows SDK zoom');
  await page.getByRole('button', { name: '关闭地点详情' }).click();
  await page.getByRole('button', { name: '全览所有路线' }).click();
  for (const [width, height] of [[1280, 900], [1440, 900], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(350);
    assert(await page.evaluate(() => document.documentElement.scrollHeight === innerHeight && document.documentElement.scrollWidth === innerWidth), `AMap ${width}: no overflow`);
    const controls = await page.locator('.map-controls').boundingBox(), drawer = await page.locator('.favorite-drawer').boundingBox();
    assert(controls.y + controls.height <= drawer.y, `AMap ${width}: controls above drawer`);
    await page.getByRole('button', { name: '全览所有路线' }).click();
    await page.waitForTimeout(600);
    const markers = await page.locator('.amap-trip-marker').evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; }));
    assert(markers.every(marker => marker.top >= 93 && marker.bottom < drawer.y), `AMap ${width}: fit view keeps every stop above favorites`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: '全览所有路线' }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'artifacts/amap-verified.png' });
  assert(errors.length === 0, 'no page runtime errors');
  return { passed, modes, errors };
}
