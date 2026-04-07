-- Phase 18.3: 20 Timed Reading Challenge Plans
-- Covers aggressive sprints through full Bible, NT, Gospels, Psalms, etc.
-- Entries seeded via scripts/generate-plan-entries.ts → migration 20260407000400

INSERT INTO reading_plans (slug, title_key, description_key, duration_days, category, sort_order) VALUES
  -- Full Bible sprints
  ('bible-in-30-days',          'readingPlans.bibleIn30Days.title',       'readingPlans.bibleIn30Days.description',       30,  'chronological', 10),
  ('bible-in-90-days',          'readingPlans.bibleIn90Days.title',       'readingPlans.bibleIn90Days.description',       90,  'chronological', 11),
  ('bible-in-6-months',         'readingPlans.bibleIn6Months.title',      'readingPlans.bibleIn6Months.description',      180, 'chronological', 12),

  -- New Testament sprints
  ('nt-in-7-days',              'readingPlans.ntIn7Days.title',           'readingPlans.ntIn7Days.description',           7,   'book-study',    13),
  ('nt-in-14-days',             'readingPlans.ntIn14Days.title',          'readingPlans.ntIn14Days.description',          14,  'book-study',    14),
  ('nt-in-30-days',             'readingPlans.ntIn30Days.title',          'readingPlans.ntIn30Days.description',          30,  'book-study',    15),
  ('nt-in-6-months',            'readingPlans.ntIn6Months.title',         'readingPlans.ntIn6Months.description',         180, 'book-study',    16),

  -- Gospels sprints
  ('gospels-7-days',            'readingPlans.gospels7Days.title',        'readingPlans.gospels7Days.description',        7,   'book-study',    17),
  ('gospels-14-days',           'readingPlans.gospels14Days.title',       'readingPlans.gospels14Days.description',       14,  'book-study',    18),
  ('gospels-30-days',           'readingPlans.gospels30Days.title',       'readingPlans.gospels30Days.description',       30,  'book-study',    19),

  -- Psalms sprints
  ('psalms-7-days',             'readingPlans.psalms7Days.title',         'readingPlans.psalms7Days.description',         7,   'book-study',    20),
  ('psalms-90-days',            'readingPlans.psalms90Days.title',        'readingPlans.psalms90Days.description',        90,  'book-study',    21),

  -- Old Testament plans
  ('ot-in-year',                'readingPlans.otInYear.title',            'readingPlans.otInYear.description',            365, 'chronological', 22),
  ('ot-in-90-days',             'readingPlans.otIn90Days.title',          'readingPlans.otIn90Days.description',          90,  'chronological', 23),

  -- Section-specific plans
  ('pentateuch-30-days',        'readingPlans.pentateuch30Days.title',    'readingPlans.pentateuch30Days.description',    30,  'book-study',    24),
  ('wisdom-30-days',            'readingPlans.wisdom30Days.title',        'readingPlans.wisdom30Days.description',        30,  'topical',       25),
  ('prophets-90-days',          'readingPlans.prophets90Days.title',      'readingPlans.prophets90Days.description',      90,  'book-study',    26),
  ('pauls-letters-30-days',     'readingPlans.paulsLetters30Days.title',  'readingPlans.paulsLetters30Days.description',  30,  'book-study',    27),
  ('acts-28-days',              'readingPlans.acts28Days.title',          'readingPlans.acts28Days.description',          28,  'book-study',    28),
  ('revelation-22-days',        'readingPlans.revelation22Days.title',    'readingPlans.revelation22Days.description',    22,  'book-study',    29)
ON CONFLICT (slug) DO NOTHING;

-- Seed cover images and completion counts for the 20 new plans
UPDATE reading_plans SET cover_image_url = 'https://picsum.photos/seed/bible30/800/400',     completion_count = 1240 WHERE slug = 'bible-in-30-days';
UPDATE reading_plans SET cover_image_url = 'https://picsum.photos/seed/bible90/800/400',     completion_count = 3870 WHERE slug = 'bible-in-90-days';
UPDATE reading_plans SET cover_image_url = 'https://picsum.photos/seed/bible6mo/800/400',    completion_count = 6120 WHERE slug = 'bible-in-6-months';
UPDATE reading_plans SET cover_image_url = 'https://picsum.photos/seed/nt7days/800/400',     completion_count = 890  WHERE slug = 'nt-in-7-days';
UPDATE reading_plans SET cover_image_url = 'https://picsum.photos/seed/nt14days/800/400',    completion_count = 2340 WHERE slug = 'nt-in-14-days';
UPDATE reading_plans SET cover_image_url = 'https://picsum.photos/seed/nt30days/800/400',    completion_count = 4510 WHERE slug = 'nt-in-30-days';
UPDATE reading_plans SET cover_image_url = 'https://picsum.photos/seed/nt6months/800/400',   completion_count = 7830 WHERE slug = 'nt-in-6-months';
UPDATE reading_plans SET cover_image_url = 'https://picsum.photos/seed/gosp7/800/400',       completion_count = 1650 WHERE slug = 'gospels-7-days';
UPDATE reading_plans SET cover_image_url = 'https://picsum.photos/seed/gosp14/800/400',      completion_count = 3290 WHERE slug = 'gospels-14-days';
UPDATE reading_plans SET cover_image_url = 'https://picsum.photos/seed/gosp30/800/400',      completion_count = 5740 WHERE slug = 'gospels-30-days';
UPDATE reading_plans SET cover_image_url = 'https://picsum.photos/seed/psa7/800/400',        completion_count = 720  WHERE slug = 'psalms-7-days';
UPDATE reading_plans SET cover_image_url = 'https://picsum.photos/seed/psa90/800/400',       completion_count = 4180 WHERE slug = 'psalms-90-days';
UPDATE reading_plans SET cover_image_url = 'https://picsum.photos/seed/ot365/800/400',       completion_count = 2960 WHERE slug = 'ot-in-year';
UPDATE reading_plans SET cover_image_url = 'https://picsum.photos/seed/ot90/800/400',        completion_count = 1870 WHERE slug = 'ot-in-90-days';
UPDATE reading_plans SET cover_image_url = 'https://picsum.photos/seed/pent30/800/400',      completion_count = 3140 WHERE slug = 'pentateuch-30-days';
UPDATE reading_plans SET cover_image_url = 'https://picsum.photos/seed/wisdom30/800/400',    completion_count = 2580 WHERE slug = 'wisdom-30-days';
UPDATE reading_plans SET cover_image_url = 'https://picsum.photos/seed/proph90/800/400',     completion_count = 1420 WHERE slug = 'prophets-90-days';
UPDATE reading_plans SET cover_image_url = 'https://picsum.photos/seed/paul30/800/400',      completion_count = 3850 WHERE slug = 'pauls-letters-30-days';
UPDATE reading_plans SET cover_image_url = 'https://picsum.photos/seed/acts28/800/400',      completion_count = 6230 WHERE slug = 'acts-28-days';
UPDATE reading_plans SET cover_image_url = 'https://picsum.photos/seed/rev22/800/400',       completion_count = 4910 WHERE slug = 'revelation-22-days';
