async (page) => {
  await page.evaluate(() => localStorage.clear());
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await page.getByRole('option').first().waitFor();
  await page.waitForTimeout(650);
  await page.screenshot({ path: 'artifacts/desktop-1440.png' });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.screenshot({ path: 'artifacts/desktop-1920.png' });
  await page.setViewportSize({ width: 1440, height: 900 });
  return { screenshots: ['artifacts/desktop-1440.png', 'artifacts/desktop-1920.png'] };
}
