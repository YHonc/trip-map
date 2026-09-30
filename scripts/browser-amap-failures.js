async (page) => {
  // Dedicated test session only. All POI/route responses in this script are fixtures.
  const saved = await page.evaluate(() => localStorage.getItem('trip-map-v2'));
  const data = JSON.parse(saved);
  if (data.trip.id !== 'real-fixture') throw new Error('Run browser-amap.js in the isolated session first');
  const passed = [];
  const assert = (ok, message) => { if (!ok) throw new Error(message); passed.push(message); };
  let failSearch = true, failRoute = true, holdDriving = false;
  const held = [];
  const routeHandler = async route => {
    const request = route.request().postDataJSON();
    if (failRoute) return route.fulfill({ status: 503, json: { error: '测试：高德配额不足（10003）' } });
    const geometry = { source: 'amap', path: [request.origin, request.destination], paths: [[request.origin, request.destination]], distance: request.mode === 'riding' ? 3400 : 1200, duration: 240 };
    if (holdDriving && request.mode === 'driving') { held.push(() => route.fulfill({ json: { ...geometry, distance: 99000 } })); return; }
    await route.fulfill({ json: geometry });
  };
  const searchHandler = route => route.fulfill(failSearch
    ? { status: 503, json: { error: '测试：搜索网络故障' } }
    : { json: { places: data.favorites } });
  await page.route('**/api/amap/route', routeHandler);
  await page.route('**/api/amap/search?*', searchHandler);
  try {
    await page.reload();
    await page.getByTestId('route-1').locator('.route-error').waitFor();
    assert((await page.getByTestId('route-1').locator('.route-error').innerText()).includes('10003'), 'quota errors are visible');
    assert(await page.locator('.stop-card').count() === 2, 'failed planning preserves stops');
    assert((await page.locator('.trip-summary .route-cost-summary').innerText()).includes('部分路程待计算'), 'unknown distance is not reported as zero');
    await page.locator('.search-message').filter({ hasText: '搜索网络故障' }).waitFor();
    failSearch = false;
    await page.getByRole('button', { name: '请重试', exact: true }).click();
    await page.getByRole('listbox').getByRole('option').first().waitFor();
    assert(await page.getByRole('listbox').getByRole('option').count() === 2, 'failed search can be retried');
    await page.getByRole('combobox', { name: '搜索地点、地址、景区' }).press('Escape');
    failRoute = false;
    await page.getByTestId('route-1').getByRole('button', { name: '重新计算' }).click();
    await page.getByTestId('route-1').locator('.route-error').waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: /测试：高德配额不足.*重试/ }).click();
    await page.waitForFunction(() => document.querySelector('.trip-summary .route-cost-summary').textContent.includes('2.4 公里'));
    passed.push('route and transfer failures recover through manual retry');
    const transfer = page.getByRole('checkbox', { name: '转场：route-1 → route-2' });
    await transfer.uncheck();
    const changeMode = async name => {
      await page.getByTestId('route-1').locator('.route-heading').hover();
      await page.getByRole('button', { name: 'route-1设置', exact: true }).click();
      await page.getByRole('menu').getByRole('button', { name, exact: true }).click();
    };
    holdDriving = true;
    await changeMode('驾车');
    for (let i = 0; !held.length && i < 30; i++) await page.waitForTimeout(100);
    assert(held.length === 1, 'old driving request is held while route changes');
    await changeMode('骑行');
    await page.waitForFunction(() => document.querySelector('.trip-summary .route-cost-summary').textContent.includes('3.4 公里'));
    await held.shift()();
    await page.waitForTimeout(300);
    assert((await page.locator('.trip-summary .route-cost-summary').innerText()).includes('3.4 公里'), 'old route response cannot overwrite the new mode result');
    await page.getByRole('combobox', { name: '转场 route-1 到 route-2 交通方式' }).press('Enter');
    await page.getByRole('option', { name: '驾车', exact: true }).click();
    await transfer.check();
    for (let i = 0; !held.length && i < 30; i++) await page.waitForTimeout(100);
    assert(held.length === 1, 'transfer request is held before disabling');
    await transfer.uncheck();
    await held.shift()();
    await page.waitForTimeout(300);
    assert((await page.locator('.trip-summary .route-cost-summary').innerText()).includes('3.4 公里'), 'disabled transfer ignores its late response');
    const configHandler = route => route.fulfill({ json: { ready: false, missing: ['AMAP_SECURITY_CODE'] } });
    await page.route('**/api/amap/config', configHandler);
    holdDriving = false;
    await page.reload();
    await page.locator('.map-provider-notice').filter({ hasText: '未配置 AMAP_SECURITY_CODE' }).waitFor();
    assert(await page.locator('.cartography').count() === 0, 'missing credentials show an error without a Mock fallback');
    await page.unroute('**/api/amap/config', configHandler);
    return { passed };
  } finally {
    for (const release of held) await release().catch(() => {});
    await page.evaluate(value => localStorage.setItem('trip-map-v2', value), saved);
    await page.unroute('**/api/amap/route', routeHandler);
    await page.unroute('**/api/amap/search?*', searchHandler);
    await page.reload();
  }
}
