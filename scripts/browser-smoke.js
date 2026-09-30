async (page) => {
  const results = [];
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const assert = (value, message) => {
    if (!value) throw new Error(message);
    results.push(message);
  };
  const names = (route) => page.getByTestId(route).locator('.stop-text strong').allTextContents();
  const undo = async () => {
    await page.getByRole('button', { name: '撤销', exact: true }).click();
  };
  const drag = async (source, target) => {
    await source.scrollIntoViewIfNeeded();
    const box = await source.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 10, box.y + box.height / 2 - 10, { steps: 4 });
    await page.waitForTimeout(150);
    await target.scrollIntoViewIfNeeded();
    const destination = await target.boundingBox();
    await page.mouse.move(
      destination.x + destination.width / 2,
      destination.y + destination.height / 2,
      { steps: 18 },
    );
    await page.waitForTimeout(160);
    const final = await target.boundingBox();
    await page.mouse.move(final.x + final.width / 2, final.y + final.height / 2, { steps: 3 });
    await page.mouse.up();
    await page.waitForTimeout(200);
  };
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('listbox').getByRole('option').first().waitFor();
  assert(
    (await page.getByRole('listbox').getByRole('option').count()) === 3,
    'initial mock search returns three results',
  );
  assert(
    await page.evaluate(
      () =>
        document.documentElement.scrollHeight === innerHeight &&
        document.documentElement.scrollWidth === innerWidth,
    ),
    '1440x900 has no document overflow',
  );
  const search = page.getByRole('combobox', { name: '搜索地点、地址、景区' });
  await search.focus();
  await search.press('ArrowDown');
  await search.press('ArrowDown');
  await search.press('ArrowUp');
  await search.press('Enter');
  await page.getByRole('region', { name: '地点详情' }).waitFor();
  assert(
    (await page.locator('.place-popover h2').innerText()) === '上海外滩',
    'keyboard search opens the shared place popover',
  );
  assert((await names('route-1')).length === 3, 'search selection does not insert a stop');
  await page.getByRole('button', { name: '收藏', exact: true }).click();
  assert((await page.locator('.favorite-count').innerText()) === '6', 'favorite appears in basket');
  await page.getByRole('button', { name: '加入行程', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /上午路线/ })
    .click();
  assert((await names('route-1')).length === 4, 'destination picker adds a stop');
  await undo();
  assert((await names('route-1')).length === 3, 'undo restores route');
  await page.getByRole('button', { name: '重做', exact: true }).click();
  assert((await names('route-1')).length === 4, 'redo restores insertion');
  await undo();
  if (await page.getByRole('button', { name: '关闭地点详情' }).isVisible()) {
    await page.getByRole('button', { name: '关闭地点详情' }).click();
  }
  await drag(
    page.getByRole('button', { name: '拖动酒店', exact: true }),
    page.getByTestId('stop-r1-nanjing'),
  );
  assert(
    JSON.stringify(await names('route-1')) === JSON.stringify(['上海外滩', '南京东路', '酒店']),
    'pointer drag reorders stops',
  );
  await undo();
  await drag(
    page.getByRole('button', { name: '拖动收藏豫园', exact: true }),
    page.getByTestId('insert-route-1-2'),
  );
  assert(
    JSON.stringify(await names('route-1')) ===
      JSON.stringify(['酒店', '上海外滩', '豫园', '南京东路']),
    'favorite inserts between stops at requested position',
  );
  await undo();
  await drag(
    page.getByRole('button', { name: '拖动收藏上海中心', exact: true }),
    page.getByTestId('route-2').locator('.route-heading'),
  );
  assert((await names('route-2')).length === 3, 'favorite drops directly into a collapsed route');
  await undo();
  await drag(
    page.getByRole('button', { name: '拖动收藏上海博物馆', exact: true }),
    page.getByTestId('day-2').locator('.day-heading'),
  );
  assert((await names('route-3')).length === 4, 'one-route day accepts favorite directly');
  await undo();
  await drag(
    page.getByRole('button', { name: '拖动收藏武康路', exact: true }),
    page.getByTestId('day-4').locator('.day-heading'),
  );
  assert(
    (await page.getByTestId('day-4').locator('.stop-card').count()) === 1,
    'empty day creates a default route and inserts favorite',
  );
  await undo();
  assert(
    (await page.getByTestId('day-4').locator('.route-card').count()) === 0,
    'one undo reverses route creation plus insertion',
  );
  await drag(
    page.getByRole('button', { name: '拖动收藏豫园', exact: true }),
    page.getByTestId('day-1').locator('.day-heading'),
  );
  await page.getByRole('dialog', { name: '加入行程' }).waitFor();
  assert(
    (await page.getByRole('dialog').locator('.destination-routes button').count()) === 2,
    'multi-route day opens route picker',
  );
  await page.getByRole('button', { name: '新建路线并加入' }).click();
  assert(
    (await page.getByTestId('day-1').locator('.route-card').count()) === 3,
    'multi-route picker supports creating a route',
  );
  await undo();
  await page.getByRole('button', { name: '全览所有路线' }).click();
  const linePoint = await page
    .locator('[data-route-id="route-1"] polyline')
    .nth(2)
    .evaluate((line) => {
      const point = line.getPointAtLength(line.getTotalLength() * 0.4);
      return new DOMPoint(point.x, point.y).matrixTransform(line.getScreenCTM()).toJSON();
    });
  await page.mouse.click(linePoint.x, linePoint.y);
  assert(
    (await page.getByTestId('route-1').locator('.stop-card').count()) === 3,
    'map polyline expands corresponding sidebar route',
  );
  await page.getByTestId('route-1').locator('.route-heading').hover();
  await page.getByRole('button', { name: '隐藏上午路线', exact: true }).click();
  assert(
    (await page.locator('[data-route-id="route-1"]').count()) === 0,
    'hide route removes polyline and markers',
  );
  await undo();
  await page.getByRole('button', { name: '调整收藏栏高度' }).press('Home');
  assert((await page.locator('.favorite-drawer').getAttribute('data-state')) === 'closed', 'favorite drawer collapses');
  await page.getByRole('button', { name: '调整收藏栏高度' }).press('ArrowUp');
  await page.getByRole('button', { name: '收藏豫园操作', exact: true }).click();
  const menu = await page.getByRole('menu').boundingBox();
  assert(menu.y > 0 && menu.y + menu.height < 900, 'favorite context menu stays inside viewport');
  await page.keyboard.press('Escape');
  await search.fill('不可能存在的地点');
  await page.waitForTimeout(400);
  assert(
    (await page.locator('.search-message').innerText()).includes('没有找到地点'),
    'search empty state is shown',
  );
  await search.fill('武康');
  await page.waitForTimeout(400);
  assert((await page.getByRole('listbox').getByRole('option').count()) === 1, 'fuzzy name search works');
  await search.press('Escape');
  assert((await page.getByRole('listbox').count()) === 0, 'Escape dismisses search');
  await page.waitForTimeout(700);
  assert(
    (await page.evaluate(
      () => JSON.parse(localStorage.getItem('trip-map-v2')).favorites.length,
    )) === 6,
    'edits persist in local storage',
  );
  assert(errors.length === 0, `console and page errors: ${errors.length}`);
  return { passed: results, errors };
}
