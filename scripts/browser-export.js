async (page) => {
  const passed = [];
  await page.waitForFunction(() => document.querySelector('.trip-summary .route-cost-summary')?.textContent.includes('公里'));
  await page.getByRole('button', { name: '导入 / 导出', exact: true }).click();
  await page.getByRole('tab', { name: '导出行程', exact: true }).click();
  for (const [name, filename] of [['JSON 数据', 'verified-trip.json'], ['正常路线图', 'verified-map.svg'], ['规划 PNG 图片', 'verified-planning.png']]) {
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: new RegExp(name) }).click();
    const download = await pending;
    await download.saveAs(`artifacts/${filename}`);
    if (await download.failure()) throw new Error(`${name} download failed`);
    passed.push(`${name}: file downloaded`);
  }
  await page.getByRole('button', { name: '关闭弹窗' }).click();
  return { passed };
}
