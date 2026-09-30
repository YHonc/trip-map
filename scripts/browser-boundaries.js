async (page) => {
  const passed = [];
  const assert = (ok, text) => {
    if (!ok) throw new Error(text);
    passed.push(text);
  };
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('listbox').getByRole('option').first().waitFor();
  await page.getByRole('button', { name: '编辑行程名称' }).click();
  const input = page.getByRole('textbox', { name: '行程名称' });
  await input.fill('');
  await input.pressSequentially('Shanghai trip', { delay: 35 });
  assert(
    (await input.inputValue()) === 'Shanghai trip',
    'modal retains keyboard focus through rerenders',
  );
  await page.getByRole('button', { name: '保存', exact: true }).click();
  assert(
    (await page.getByRole('heading', { level: 1 }).innerText()) === 'Shanghai trip',
    'trip title can be edited',
  );
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await page.getByRole('button', { name: '添加一天', exact: true }).click();
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  assert(
    (await page.locator('.day-card.active').getAttribute('data-testid')) === 'day-1',
    'undo newly selected day restores a valid selection',
  );
  const before = await page.locator('.day-card').count();
  for (let i = 0; i < 10; i++)
    await page.getByRole('button', { name: '添加一天', exact: true }).click();
  assert((await page.locator('.day-card').count()) === before + 10, 'many days can be added');
  await page.getByTestId('day-list').evaluate((el) => {
    el.scrollTop = 0;
  });
  const source = await page
    .getByRole('button', { name: '拖动收藏豫园', exact: true })
    .boundingBox();
  const list = await page.getByTestId('day-list').boundingBox();
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(source.x - 15, source.y - 15, { steps: 4 });
  await page.mouse.move(list.x + 100, list.y + list.height - 15, { steps: 20 });
  await page.waitForTimeout(1200);
  const bottomScroll = await page.getByTestId('day-list').evaluate((el) => el.scrollTop);
  assert(bottomScroll > 100, 'dragging near sidebar bottom auto-scrolls down');
  await page.mouse.move(list.x + 100, list.y + 12, { steps: 10 });
  await page.waitForTimeout(1000);
  const topScroll = await page.getByTestId('day-list').evaluate((el) => el.scrollTop);
  assert(topScroll < bottomScroll, 'dragging near sidebar top auto-scrolls up');
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('listbox').getByRole('option').first().waitFor();
  await page.screenshot({ path: 'artifacts/desktop-1440.png' });
  await page.setViewportSize({ width: 1920, height: 1080 });
  assert(
    await page.evaluate(
      () =>
        document.documentElement.scrollHeight === innerHeight &&
        document.documentElement.scrollWidth === innerWidth,
    ),
    '1920x1080 has no document overflow',
  );
  const drawer = await page.locator('.favorite-drawer').boundingBox();
  const controls = await page.locator('.map-controls').boundingBox();
  assert(controls.y + controls.height < drawer.y, 'expanded favorites do not cover map controls');
  await page.screenshot({ path: 'artifacts/desktop-1920.png' });
  await page.setViewportSize({ width: 1440, height: 900 });
  return { passed };
}
