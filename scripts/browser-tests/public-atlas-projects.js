// Run with the managed browser_run_code tool, or an isolated local Playwright page.
async function verifyPublicAtlasProjects(page, baseUrl = 'http://127.0.0.1:3101') {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(baseUrl);
  await page.locator('.la-spread-canvas').waitFor({ timeout: 60000 });
  await page.getByRole('button', { name: 'Our languages' }).click();
  await page.waitForFunction(
    () => document.querySelectorAll('.pa-record-list > button').length === 23
  );
  await page.locator('.la-project-marker:visible').first().waitFor();
  console.log('Desktop list', await page.locator('.pa-record-list').innerText());
  console.log('Visible project markers', await page.locator('.la-project-marker:visible').count());
  await page.screenshot({ path: '/tmp/everybible-our-projects-desktop.png' });
  const marker = page.locator('.la-project-marker:visible').first();
  if (
    (await marker.evaluate((el) => getComputedStyle(el, '::after').animationName)) !==
    'project-pulse'
  )
    throw Error('Project pulse is missing');
  await marker.click();
  await page.getByRole('region', { name: 'Every Language project progress' }).waitFor();
  await page.getByRole('button', { name: 'Close profile', exact: true }).click();
  await page.getByRole('button', { name: 'Records', exact: true }).click();

  await page.locator('.pa-record-list > button').filter({ hasText: 'Bhujel' }).click();
  await page.getByRole('region', { name: 'Every Language project progress' }).waitFor();
  const progressText = await page.locator('.pa-project-progress').innerText();
  if (
    !progressText.includes('463 chapters recorded') ||
    !progressText.includes('38.9%') ||
    !progressText.includes('Bhujel: Andimul') ||
    !progressText.includes('2026-09-07')
  )
    throw Error('Project source/progress mismatch');
  await page.screenshot({ path: '/tmp/everybible-our-projects-progress.png' });
  await page.getByRole('button', { name: 'Clusters', exact: true }).click();
  await page.locator('.maplibregl-marker.la-project-marker').first().waitFor();
  console.log(
    'Cluster project markers',
    await page.locator('.maplibregl-marker.la-project-marker').count()
  );
  await page.getByRole('button', { name: 'Dots', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  if (
    (await page
      .locator('.la-project-marker:visible')
      .first()
      .evaluate((el) => getComputedStyle(el, '::after').animationName)) !== 'none'
  )
    throw Error('Reduced motion must disable pulse');
  const search = page.getByRole('searchbox', { name: 'Search languages and dialects' });
  await search.fill('Singaporean');
  await page.waitForFunction(() => document.querySelectorAll('.pa-project-list .pa-record-list > button').length === 1);
  await page.locator('.pa-project-list .pa-record-list > button').click();
  await page.getByRole('button', { name: 'Close project', exact: true }).waitFor();
  const unmapped = await page.locator('.pa-project-progress').innerText();
  if (!unmapped.includes('12 chapters recorded') || !unmapped.includes('1%')) throw Error('Unmapped project must retain progress');
  await page.getByRole('button', { name: 'Close project', exact: true }).click();
  await search.fill('');
  await page.getByRole('button', { name: 'Records', exact: true }).click();
  await page.locator('.pa-record-list > button').filter({ hasText: 'Bhujel' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Close profile', exact: true }).click();
  await page.getByRole('button', { name: 'Our languages' }).click();
  await page.getByRole('button', { name: 'Our languages' }).click();
  await page.locator('.pa-record-list > button').filter({ hasText: 'Bhujel' }).click();
  await page.screenshot({ path: '/tmp/everybible-our-projects-mobile.png' });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const boxes = await Promise.all(
      ['Our languages', 'Legend', 'Settings'].map((name) =>
        page.getByRole('button', { name, exact: name !== 'Our languages' }).boundingBox()
      )
    );
    if (boxes[0].x + boxes[0].width > boxes[1].x)
      throw Error('Mobile focus overlaps controls ' + width);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
      throw Error('overflow ' + width);
    console.log('Mobile layout passes', width);
  }
  if (errors.length) throw Error(errors.join('\n'));

  return { verified: true };
}
