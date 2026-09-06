// Run with the managed Playwright browser_run_code tool against the local site.
async function verifyPublicAtlasMobile(page, baseUrl = 'http://127.0.0.1:3100') {
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseUrl);
  const search = page.getByRole('searchbox', { name: 'Search languages and dialects' });
  await search.waitFor();
  check(
    (await search.getAttribute('placeholder')) === 'Find a language or dialect…',
    'Search copy must describe languages and dialects'
  );
  await page.getByRole('link', { name: 'Data provided by Joshua Project' }).waitFor();
  check(
    await page.getByRole('button', { name: 'Legend', exact: true }).isVisible(),
    'Mobile must offer a collapsed Legend button'
  );
  check(
    !(await page.getByRole('button', { name: 'Full Bible', exact: true }).isVisible()),
    'Legend starts closed'
  );
  check(
    !(await page.getByRole('button', { name: 'Records', exact: true }).isVisible()),
    'Records starts inside search'
  );
  check(
    !(await page.getByRole('button', { name: 'Fit results', exact: true }).isVisible()),
    'Map actions start inside Settings'
  );
  check(
    await page.getByRole('region', { name: 'Download EveryBible', exact: true }).isVisible(),
    'Floating QR/app card remains visible'
  );
  await page.getByRole('button', { name: 'Legend', exact: true }).click();
  check(
    await page.getByRole('button', { name: 'Full Bible', exact: true }).isVisible(),
    'Legend opens'
  );
  check(
    await page.getByRole('button', { name: 'No known Scripture', exact: true }).isVisible(),
    'Current Scripture legend remains available'
  );
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  check(
    !(await page.getByRole('button', { name: 'Full Bible', exact: true }).isVisible()),
    'Settings replaces Legend'
  );
  check(
    (await page.getByRole('button', { name: 'Dots', exact: true }).getAttribute('aria-pressed')) ===
      'true',
    'Dots is the default'
  );
  check(
    (await page.getByRole('button', { name: 'Recorded locations', exact: true }).count()) === 0,
    'Recorded locations is hidden on the public site'
  );
  check(
    await page.getByRole('button', { name: 'Fit results', exact: true }).isVisible(),
    'Settings contains map actions'
  );
  await page.keyboard.press('Tab');
  check(
    await page
      .getByRole('button', { name: 'Close settings', exact: true })
      .evaluate((button) => button === document.activeElement),
    'Keyboard navigation enters Settings without reopening Search'
  );
  await page.waitForFunction(() => !document.querySelector('[aria-label="Zoom in"]')?.disabled);
  await page.getByRole('button', { name: 'Map', exact: true }).click();
  check(
    (await page.getByRole('button', { name: 'Map', exact: true }).getAttribute('aria-pressed')) ===
      'true',
    'Projection can change from Settings'
  );
  await page.getByRole('button', { name: 'Globe', exact: true }).click();
  await page.getByRole('button', { name: 'Clusters', exact: true }).click();
  check(
    (await page.getByRole('button', { name: 'Clusters', exact: true }).getAttribute('aria-pressed')) === 'true',
    'Clusters can be selected'
  );
  await page.getByRole('button', { name: 'Dots', exact: true }).click();
  check(
    (await page.getByRole('button', { name: 'Dots', exact: true }).getAttribute('aria-pressed')) === 'true',
    'Dots can be restored'
  );
  await page.getByRole('button', { name: 'Reset view', exact: true }).click();
  await page.getByRole('button', { name: 'Close settings', exact: true }).click();
  check(
    !(await page.getByRole('button', { name: 'Fit results', exact: true }).isVisible()),
    'Settings closes'
  );
  await search.click();
  check(
    await page.getByRole('button', { name: 'Records', exact: true }).isVisible(),
    'Search reveals Records'
  );
  await page.getByRole('button', { name: 'Records', exact: true }).click();
  const collection = page.getByLabel('Collection');
  check(
    (await collection.locator('option').allTextContents()).join('|') ===
      'Languages & dialects|Languages|Dialects / varieties',
    'The main collection must contain languages and dialects without people groups'
  );
  await page.keyboard.press('Escape');
  await search.blur();
  await search.focus();
  check(
    await page.getByRole('button', { name: 'Records', exact: true }).isVisible(),
    'Keyboard focus reopens search after Escape'
  );
  await search.fill('Phu');
  await page.getByRole('heading', { name: 'Explore records' }).waitFor();
  await page.getByRole('button', { name: 'Legend', exact: true }).click();
  check(
    !(await page.getByRole('heading', { name: 'Explore records' }).isVisible()),
    'Legend replaces search results'
  );
  await page.keyboard.press('Escape');
  check(
    !(await page.getByRole('button', { name: 'Full Bible', exact: true }).isVisible()),
    'Escape closes the panel'
  );
  await page.getByRole('button', { name: 'Legend', exact: true }).click();
  await page.locator('.la-map-canvas').click({ position: { x: 8, y: 400 } });
  check(
    !(await page.getByRole('button', { name: 'Full Bible', exact: true }).isVisible()),
    'Tapping the map dismisses the panel'
  );
  check(
    await page.getByRole('region', { name: 'Download EveryBible', exact: true }).isVisible(),
    'QR/app card survives panel interactions'
  );
  await page.setViewportSize({ width: 320, height: 740 });
  check(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'No horizontal overflow on narrow phones'
  );
  await page.getByRole('button', { name: 'Legend', exact: true }).click();
  check(
    await page.evaluate(
      () =>
        document.querySelector('.pa-explorer-body').getBoundingClientRect().bottom <
        document.querySelector('.pa-download-dock').getBoundingClientRect().top
    ),
    'Expanded panel leaves the QR card unobstructed on narrow phones'
  );
  await page.getByRole('button', { name: 'Close legend', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.getByRole('button', { name: 'Globe', exact: true }).waitFor();
  check(
    await page.getByRole('button', { name: 'Records', exact: true }).isVisible(),
    'Desktop Records stays accessible'
  );
  check(
    await page.getByRole('button', { name: 'Full Bible', exact: true }).isVisible(),
    'Desktop legend remains visible'
  );
  return 'PASS: language/dialect collection, mobile collapse, exclusivity, dismissal, dot default, QR preservation, narrow phone and desktop controls';
}
