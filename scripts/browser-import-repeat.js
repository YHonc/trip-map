async page => {
  const data = await page.evaluate(() => localStorage.getItem('trip-map-v2'));
  if (!await page.getByRole('dialog', { name: '导入 / 导出' }).count()) await page.getByRole('button', { name: '导入 / 导出', exact: true }).click();
  let routeRequests = 0;
  page.on('request', request => { if (request.url().endsWith('/api/amap/route')) routeRequests++; });
  await page.getByLabel('选择行程 JSON 文件', { exact: true }).setInputFiles({ name: 'same-trip.json', mimeType: 'application/json', buffer: Buffer.from(data) });
  await page.getByText('same-trip.json', { exact: true }).waitFor();
  await page.getByRole('button', { name: '导入此行程', exact: true }).click();
  await page.waitForTimeout(700);
  if ((await page.locator('.route-cost-summary').first().innerText()).includes('待计算')) throw new Error('same import lost route results');
  if (routeRequests) throw new Error('same import triggered unnecessary route API calls');
  return { passed: ['file input imported current JSON', 'identical import preserved ready route results with zero route API requests'] };
}
