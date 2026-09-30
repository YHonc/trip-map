async page => {
  const base = new URL(page.url()).origin;
  if (base !== 'http://127.0.0.1:32146') throw new Error('Run only against serve-desktop-fixture.cjs');
  const config = await (await page.request.get(`${base}/api/amap/config`)).json();
  if (config.baseURL !== 'http://127.0.0.1:32147') throw new Error('Set the isolated fixture gateway in Map Settings first');
  const first = await page.request.get(`${base}/api/amap/cities?q=fixture-city`);
  const second = await page.request.get(`${base}/api/amap/cities?q=fixture-city`);
  if (!first.ok() || second.headers()['x-amap-upstream-requests'] !== '0') throw new Error('Repeated city query missed cache');
  const route = { origin: { lng: 116.4, lat: 39.9 }, destination: { lng: 116.41, lat: 39.91 }, mode: 'walking' };
  const road = await page.request.post(`${base}/api/amap/route`, { data: route });
  const repeated = await page.request.post(`${base}/api/amap/route`, { data: route });
  if (!road.ok() || repeated.headers()['x-amap-upstream-requests'] !== '0' || !(await road.json()).calculatedAt) throw new Error('Route persistence metadata or cache failed');
  const saved = await (await page.request.get(`${base}/api/plans`)).json();
  const other = await page.context().browser().newContext();
  const otherPage = await other.newPage();
  try {
    await otherPage.goto(base);
    await otherPage.getByRole('combobox', { name: '切换旅行计划' }).filter({ hasText: 'SQLite 桌面测试' }).waitFor();
    const changed = structuredClone(saved); changed.plans[0].trip.name = '并发版本核验';
    const write = await page.request.put(`${base}/api/plans`, { data: changed });
    if (!write.ok()) throw new Error('Fixture write failed');
    const conflict = await page.request.put(`${base}/api/plans`, { data: saved });
    if (conflict.status() !== 409) throw new Error('Stale writer overwrote saved plans');
    await page.request.put(`${base}/api/plans`, { data: { ...saved, revision: (await write.json()).revision } });
  } finally { await other.close(); }
  const blocked = await page.request.get(`${base}/api/plans`, { headers: { Origin: 'https://example.invalid' } });
  if (blocked.ok()) throw new Error('Cross-site read allowed');
  return { passed: ['SQLite plans shared by isolated browser profiles', 'city and road API cache hit with zero repeated upstream calls', 'route calculation timestamp', 'stale writer rejected', 'cross-site read rejected'], cache: await (await page.request.get(`${base}/api/amap/cache`)).json() };
}
