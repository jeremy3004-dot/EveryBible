/**
 * Copy for the Seasons of life plans and the church-year plans.
 * See plan-copy.ts; plan-copy.test.ts checks every highlight against the schedule.
 */
import type { PlanCopy } from './plan-copy';

export const PLAN_COPY_SEASONS: Readonly<Record<string, PlanCopy>> = {
  advent: {
    intro: [
      'Advent is the season of waiting before Christmas, and this plan makes it a daily habit: four weeks of readings that begin with the prophets’ promises and arrive at the angel’s visit to Mary. Each week has a theme, hope, peace, joy and love, and each day has a short reading, often with a psalm.',
      'The week of hope goes back to the beginning: Isaiah’s comfort, the promises to Abraham and David, and the cry of Lamentations 3 for God to act. In the week of peace, Isaiah 9 and Micah 5 name the child born in Bethlehem who will be called Prince of Peace, and Malachi and John the Baptist prepare his way. Joy turns to the wilderness that blossoms in Isaiah 35. Love begins with the Annunciation in Luke 1 and, in a year when Advent runs its full 28 days, ends on Christmas Eve with Isaiah 62 and Psalm 24.',
      'Because it follows the church year, it begins on the first Sunday of Advent. The Twelve Days of Christmas picks up on Christmas Day.',
    ],
    highlights: [
      {
        label: 'Hope: the promises',
        days: 'Days 1–7',
        refs: 'Isaiah 40, Genesis 12, 2 Samuel 7, Lamentations 3',
      },
      {
        label: 'Peace: the child and the way',
        days: 'Days 8–14',
        refs: 'Isaiah 9, Micah 5, Ephesians 2, Isaiah 32',
      },
      {
        label: 'Joy: the wilderness blooms',
        days: 'Days 15–21',
        refs: 'Zephaniah 3, Isaiah 35, Isaiah 61, Habakkuk 3',
      },
      {
        label: 'Love: the angel and Mary',
        days: 'Days 22–28',
        refs: 'Luke 1, John 3, 1 John 3–4, Isaiah 62',
      },
    ],
  },

  'twelve-days-of-christmas': {
    intro: [
      'Christmas does not end on 26 December. In the church’s calendar the Twelve Days run from Christmas Day to 5 January, the eve of Epiphany, and this plan gives each day its own short reading so the season lasts as long as the calendar says it should.',
      'On Christmas Day you read Luke 2, the birth in Bethlehem, and John 1, the Word who became flesh. The days that follow reflect on who the child is, in Hebrews 1, Colossians 1 and 1 John 1, and on what his coming means, in Titus, Galatians and Ephesians. The turn of the year brings Psalm 90 and Ecclesiastes 3. On 1 January, the eighth day, when Luke says he was named, you read the blessing of Numbers 6 and Philippians 2. On 5 January, the star and the wise men in Matthew 2 are paired with Isaiah 60, nations coming to the light.',
      'The plan follows the Western calendar. If your church keeps Christmas on 7 January, you can read the same twelve days from then.',
    ],
    highlights: [
      { label: 'The birth and the Word', days: '25 December', refs: 'Luke 2, John 1' },
      {
        label: 'The image of the invisible God',
        days: '29 December',
        refs: 'Colossians 1, 1 John 1',
      },
      { label: 'The turn of the year', days: '31 December', refs: 'Psalm 90, Ecclesiastes 3' },
      { label: 'The blessing and the Name', days: '1 January', refs: 'Numbers 6, Philippians 2' },
      { label: 'The star and the wise men', days: '5 January', refs: 'Isaiah 60, Matthew 2' },
    ],
  },

  'life-loss-7-days': {
    intro: [
      'Grief is not a problem to solve, and the Bible does not hurry it. This plan stays with loss for a week: with Job, who sits among the ruins of everything he had, with David lamenting his friend, with Naomi coming home empty, and with Jesus weeping at a grave.',
      'Day 1 opens with Job 1–2 and Psalm 39. Day 2 gives you laments by David, by Jerusalem and by a psalmist, and days 3 and 4 follow Ruth’s story from bitter loss, when Naomi asks to be called Mara, which means bitter, to a new family. Day 5 is John 11, where Jesus meets the sisters of Lazarus and weeps. The last two days turn to the promise of resurrection and to the end of tears in Revelation 21.',
      'Read as slowly as you need to. If your grief feels heavier than you can carry alone, tell someone close to you, or reach out to a grief counsellor, your doctor or your pastor. This plan sits beside that care and does not replace it.',
    ],
    highlights: [
      { label: 'Job loses everything', days: 'Day 1', refs: 'Job 1–2, Psalm 39' },
      { label: 'Naomi comes home empty', days: 'Day 3', refs: 'Ruth 1–2' },
      { label: 'Jesus weeps', days: 'Day 5', refs: 'John 11' },
      { label: 'The promise of resurrection', days: 'Day 6', refs: '1 Corinthians 15, Isaiah 25' },
      { label: 'No more tears', days: 'Day 7', refs: 'Revelation 21' },
    ],
  },

  'life-stress-7-days': {
    intro: [
      'Stress usually shows up as too much: too much to do, too many people depending on you, too little rest. This plan reads a week of Scripture about people under real pressure and what they were given, which was help, daily bread, rest, and a God who carries what they cannot.',
      'Day 1 is Moses, overwhelmed by the people’s complaints, and Psalm 55, which tells you to cast your burden on the Lord. On day 2 his father-in-law Jethro tells him he cannot do it alone. Day 3 is manna, enough for one day at a time, and Psalm 127 on the gift of sleep. Day 4 is Nehemiah rebuilding a wall with enemies at the gate, and day 5 asks what all the striving is for. The week ends with Isaiah 40, 2 Corinthians 4 and the invitation to rest in Hebrews 4.',
      'The readings are short, so they fit the busiest weeks. If stress has become something more, such as sleeplessness or panic, a doctor or counsellor is a good next step.',
    ],
    highlights: [
      { label: 'Too heavy to carry alone', days: 'Day 1', refs: 'Numbers 11, Psalm 55' },
      { label: 'Share the load', days: 'Day 2', refs: 'Exodus 18, Ecclesiastes 4' },
      { label: 'Daily bread and sleep', days: 'Day 3', refs: 'Exodus 16, Psalm 127' },
      { label: 'Strength renewed', days: 'Day 6', refs: 'Isaiah 40, 2 Corinthians 4' },
      { label: 'Rest', days: 'Day 7', refs: 'Hebrews 4, Psalm 62, Psalm 131' },
    ],
  },

  'life-fear-7-days': {
    intro: [
      'The Bible returns again and again to the words “do not be afraid.” This plan reads seven days with people who had good reason to be: a nation trapped at the sea, an army facing a battle it could not win, a shepherd boy facing a giant, and men facing a furnace and a pit of lions.',
      'Days 1 and 2 begin with courage, in God’s word to Joshua and to Israel in Isaiah 41, then Psalms 27, 56 and 91, written by people who were afraid and said so. Day 3 is the crossing of the Red Sea, King Jehoshaphat’s prayer before a battle he could not win, and Psalm 46. Day 4 shows the other side, Israel’s fear at the border of the promised land in Numbers 13–14. Then come David and Goliath, Daniel 3 and 6, and the closing words of Isaiah 43 and 2 Timothy 1.',
      'In these stories fear is never mocked. It is met with the presence of God.',
    ],
    highlights: [
      { label: 'Be strong, do not fear', days: 'Day 1', refs: 'Joshua 1, Isaiah 41' },
      { label: 'Psalms of the afraid', days: 'Day 2', refs: 'Psalm 27, Psalm 56, Psalm 91' },
      {
        label: 'The sea, the army and the psalm',
        days: 'Day 3',
        refs: 'Exodus 14, 2 Chronicles 20, Psalm 46',
      },
      { label: 'When fear wins', days: 'Day 4', refs: 'Numbers 13–14' },
      { label: 'The furnace and the lions', days: 'Day 6', refs: 'Daniel 3, Daniel 6' },
    ],
  },

  'life-peace-7-days': {
    intro: [
      'Peace in the Bible is bigger than a calm mood. It is shalom: wholeness, right relationships, things as they should be. This plan reads a week on the peace Jesus leaves with his disciples, and on how it reaches into your heart, your relationships and the world.',
      'Day 1 is Isaiah 26, promising perfect peace to a steadfast mind, and Psalm 4. Day 2 is Jesus’ own words in John 14 and 16, and day 3 reads about peace with God in Romans 5 and peace between people in Ephesians 2. Day 4 offers two stories of peacemaking from Genesis: Abraham and Lot parting without a quarrel, and Isaac and the wells. Colossians 3 on day 5 asks the peace of Christ to rule in your hearts, and day 6 looks ahead to a world at peace in Isaiah 11 and Micah 4. The week ends with Isaiah 55 and Psalm 23.',
      'It is a quiet week for anyone whose days feel noisy.',
    ],
    highlights: [
      { label: 'A steadfast mind', days: 'Day 1', refs: 'Isaiah 26, Psalm 4' },
      { label: 'Peace I leave with you', days: 'Day 2', refs: 'John 14, John 16' },
      { label: 'Peace with God and with each other', days: 'Day 3', refs: 'Romans 5, Ephesians 2' },
      { label: 'Peacemakers in Genesis', days: 'Day 4', refs: 'Genesis 13, Genesis 26' },
      { label: 'A world at peace', days: 'Day 6', refs: 'Isaiah 11, Micah 4' },
    ],
  },

  'life-depression-7-days': {
    intro: [
      'This plan is for dark seasons. It does not promise that reading will lift them, or pretend that faith makes sadness simple. It reads the parts of the Bible that sound most like depression: a downcast psalmist, Elijah asking to die and being fed and allowed to sleep, Job cursing the day he was born, and a psalm that ends in darkness.',
      'Day 1 asks, in Psalms 42 and 43, why the soul is downcast, and day 2 brings Jonah and Psalms 30 and 143. Day 3 is Elijah in 1 Kings 19. Day 4 is Lamentations 3 and Psalm 88, day 5 Job’s lament and God’s answer, and day 6 Psalms 22 and 69, cries the Gospels hear in Jesus’ suffering. Day 7 turns gently toward Isaiah 61, Habakkuk 3 and Psalm 126.',
      'Depression is an illness as well as a spiritual struggle, and it is treatable. Please talk to your doctor or a counsellor, and to someone who loves you. If you are thinking of harming yourself, contact your local emergency number or a crisis line now.',
    ],
    highlights: [
      { label: 'Why are you downcast, my soul?', days: 'Day 1', refs: 'Psalm 42–43, Psalm 77' },
      { label: 'Elijah, worn out', days: 'Day 3', refs: '1 Kings 19' },
      { label: 'A psalm that ends in darkness', days: 'Day 4', refs: 'Lamentations 3, Psalm 88' },
      { label: 'Job’s lament and God’s answer', days: 'Day 5', refs: 'Job 3, Job 38, Psalm 142' },
      { label: 'Tears and songs', days: 'Day 7', refs: 'Isaiah 61, Habakkuk 3, Psalm 126' },
    ],
  },

  'life-hope-7-days': {
    intro: [
      'Biblical hope is not optimism. It is confidence in what God has promised, held by people who often waited a long time with little to show for it. This plan spends a week with them: Abraham looking at the stars, Joseph in a prison, exiles in Babylon, and a valley of dry bones.',
      'Day 1 begins with a living hope in 1 Peter and Psalm 71, the prayer of someone grown old with God. Day 2 revisits Abraham, who believed against all the evidence. Days 3 and 4 follow Joseph from the pit to the prison to the palace, and to the moment he looks back at his brothers’ betrayal and sees God at work. Day 5 is God’s letter to the exiles in Jeremiah 29 and the promise of a new covenant in Jeremiah 31, day 6 is Ezekiel’s dry bones, and the week ends in Romans 8 and Psalm 146.',
      'It is a plan for a season of waiting. It does not say how long the wait will be.',
    ],
    highlights: [
      { label: 'A living hope', days: 'Day 1', refs: '1 Peter 1, Psalm 71' },
      { label: 'Abraham and the stars', days: 'Day 2', refs: 'Genesis 15, Romans 4' },
      {
        label: 'Joseph: pit, prison, palace',
        days: 'Days 3–4',
        refs: 'Genesis 37, Genesis 40, Genesis 41, Genesis 50',
      },
      { label: 'A letter to the exiles', days: 'Day 5', refs: 'Jeremiah 29, Jeremiah 31' },
      { label: 'Dry bones live', days: 'Day 6', refs: 'Ezekiel 37, Psalm 33' },
    ],
  },

  'life-healing-7-days': {
    intro: [
      'The Bible shows God as a healer and also shows faithful people who stayed ill, so this plan does not promise a particular outcome. It reads a week of passages about healing in its many forms, of body, of heart and of a broken relationship with God, and about a God who stays with the sick.',
      'Day 1 offers three psalms: Psalm 103 on the God who heals, and Psalms 41 and 6, prayed from a sickbed. Day 2 reads Matthew 8–9, where Jesus heals from a man with leprosy to a girl who had died, and day 3 reads Mark 5 and John 9. Day 4 tells of Naaman, healed in the Jordan, and King Hezekiah’s illness. Isaiah 53 and Psalm 107 fill day 5, the apostles heal in Acts 3–4 on day 6, and the week ends with Jeremiah 30 and Psalm 147, where God heals the brokenhearted.',
      'Healing and medicine are not rivals. If you are ill, let this plan keep you company alongside your doctor’s care, not instead of it.',
    ],
    highlights: [
      { label: 'Psalms from a sickbed', days: 'Day 1', refs: 'Psalm 103, Psalm 41, Psalm 6' },
      { label: 'Jesus heals', days: 'Day 2', refs: 'Matthew 8–9' },
      { label: 'A girl, a woman, a blind man', days: 'Day 3', refs: 'Mark 5, John 9' },
      { label: 'Naaman and Hezekiah', days: 'Day 4', refs: '2 Kings 5, Isaiah 38' },
      { label: 'The apostles heal', days: 'Day 6', refs: 'Acts 3–4' },
    ],
  },

  'life-anger-7-days': {
    intro: [
      'Anger is not a sin in itself. Scripture calls God slow to anger, and it also shows what anger does when it is left to grow. This plan reads a week of stories about anger, in Cain, Moses, Saul, David, Jonah and a jealous elder brother, to see what it costs and what mercy says in reply.',
      'Day 1 is Cain in Genesis 4 and Psalm 37, which says to refrain from anger. On day 2 Moses breaks the tablets at the golden calf, and the Lord describes himself as slow to anger in Exodus 34. Days 3 and 4 follow Saul’s jealous rage and David’s refusal to take revenge, helped by Abigail. Day 5 is Jonah, angry that God forgave Nineveh, and day 6 is the elder brother in Luke 15 and the servant who would not forgive in Matthew 18. The week ends with Paul’s practical advice in Ephesians 4 and Romans 12.',
      'It suits anyone who has said something they regret, or is carrying a grudge they would like to put down.',
    ],
    highlights: [
      { label: 'Cain and the warning', days: 'Day 1', refs: 'Genesis 4, Psalm 37' },
      { label: 'Slow to anger', days: 'Day 2', refs: 'Exodus 32, Exodus 34' },
      { label: 'Revenge refused', days: 'Day 4', refs: '1 Samuel 24–25' },
      { label: 'Jonah is angry at mercy', days: 'Day 5', refs: 'Jonah 3–4' },
      { label: 'In your anger', days: 'Day 7', refs: 'Ephesians 4, Romans 12' },
    ],
  },

  'life-anxiety-7-days': {
    intro: [
      'Anxiety is the sense that something terrible may happen and you must be ready for it. This plan reads a week of Scripture for that feeling, beginning with Jesus’ words about worry and going on to people who were worried too: Hannah praying through tears, Abraham on a mountain, a widow with a handful of flour, and Paul in a storm.',
      'Day 1 reads Matthew 6 and Philippians 4, which tell you to bring everything to God in prayer. Days 2 and 3 show what that looks like, with Hannah in 1 Samuel 1, David’s plea in Psalm 86, and God providing for Abraham and Elijah. Day 5 is two psalms of being known and kept, Psalms 121 and 139, and Acts 12 and 27 on day 6 are rescue stories. The week ends with Isaiah 12 and Psalm 16.',
      'A plan like this can steady you, but anxiety is also a common and treatable health condition. If it is affecting your sleep, work or relationships, seeing a doctor or counsellor is not a lack of faith.',
    ],
    highlights: [
      { label: 'Do not be anxious', days: 'Day 1', refs: 'Matthew 6, Philippians 4' },
      { label: 'Hannah pours out her heart', days: 'Day 2', refs: '1 Samuel 1, Psalm 86' },
      { label: 'Known and kept', days: 'Day 5', refs: 'Psalm 121, Psalm 139' },
      { label: 'Rescue in prison and at sea', days: 'Day 6', refs: 'Acts 12, Acts 27' },
      { label: 'I will trust and not be afraid', days: 'Day 7', refs: 'Isaiah 12, Psalm 16' },
    ],
  },

  'life-love-7-days': {
    intro: [
      'The Bible does not define love as a feeling. It points to what God has done, and asks that love be seen in what we do. This plan reads a week on love: the love of God that stays when it is not returned, and the love between people that grows from it.',
      'Day 1 begins at the centre, 1 John 3–4, where God is love. Day 2 opens with the command to love God with everything in Deuteronomy 6 and a God who loves the foreigner in Deuteronomy 10. Day 3 pairs the famous chapter on love in 1 Corinthians 13 with Jesus’ words on laying down your life for friends. Day 4 is Hosea, a prophet told to love a faithless wife as God loves Israel, ending in God’s anguish in Hosea 11. Day 5 reads the father in Luke 15 and Jesus restoring Peter on the beach, day 6 the friendship of David and Jonathan and Paul’s letter for Onesimus, and day 7 closes with Ephesians 3, Isaiah 54 and Psalm 136.',
    ],
    highlights: [
      { label: 'God is love', days: 'Day 1', refs: '1 John 3–4' },
      { label: 'Love is patient', days: 'Day 3', refs: '1 Corinthians 13, John 15' },
      { label: 'A faithless wife and a faithful God', days: 'Day 4', refs: 'Hosea 2–3, Hosea 11' },
      { label: 'The father and the fisherman', days: 'Day 5', refs: 'Luke 15, John 21' },
      { label: 'How wide and long', days: 'Day 7', refs: 'Ephesians 3, Isaiah 54, Psalm 136' },
    ],
  },

  'life-patience-7-days': {
    intro: [
      'Waiting is one of the commonest experiences in Scripture. Abraham waited for a son, Noah for dry ground, David for a throne, and the prophet Habakkuk for an answer. This plan reads a week of people who waited on God, some of them badly, and what they learned.',
      'Day 1 is Psalms 130 and 25, prayers of waiting. Day 2 follows Abraham and Sarah, whose impatience produced Ishmael, to the birth of Isaac. Day 3 has Noah sending out the dove and Psalm 40, which begins with waiting patiently. On day 4 David has the chance to kill the king who is hunting him and refuses, in 1 Samuel 26 and Psalm 57. Day 5 is Habakkuk asking how long, and day 6 reads God’s patience with his people in Nehemiah 9 and in 2 Peter 3. The week ends with the farmer waiting for the harvest in James 5 and the race of endurance in Hebrews 12.',
      'Nobody in these chapters waits well all the time, and the Bible does not hide that.',
    ],
    highlights: [
      { label: 'I wait for the Lord', days: 'Day 1', refs: 'Psalm 130, Psalm 25' },
      { label: 'Abraham and Sarah wait', days: 'Day 2', refs: 'Genesis 16, Genesis 21' },
      { label: 'David waits to be king', days: 'Day 4', refs: '1 Samuel 26, Psalm 57' },
      { label: 'How long, Lord?', days: 'Day 5', refs: 'Habakkuk 1–2' },
      { label: 'Endurance', days: 'Day 7', refs: 'Hebrews 12, James 5' },
    ],
  },

  'life-doubt-7-days': {
    intro: [
      'Doubt appears all over the Bible, and it is rarely treated as the end of faith. People questioned God, argued with him, asked for signs and laughed at his promises. This plan reads a week of those people, from Moses to Thomas, and the answers they were given.',
      'Day 1 is Easter evening: the disciples on the road to Emmaus in Luke 24, and Thomas in John 20. Day 2 reads Psalms 73 and 10, where the psalmist envies the wicked until he enters God’s presence. On day 3 Moses objects at the burning bush and Gideon asks for a sign, and on day 4 Sarah laughs while Zechariah and Mary ask how. Psalm 19 and Paul reasoning with the thinkers of Athens come on day 5, Hebrews 11 and 2 Peter 1 on day 6, and the week ends with John 6, where Peter asks, “To whom shall we go?”, and 1 John 5.',
      'If you are carrying questions, you are in company here.',
    ],
    highlights: [
      { label: 'Emmaus and Thomas', days: 'Day 1', refs: 'Luke 24, John 20' },
      { label: 'The psalmist envies the wicked', days: 'Day 2', refs: 'Psalm 73' },
      { label: 'Moses and Gideon ask for proof', days: 'Day 3', refs: 'Exodus 3–4, Judges 6' },
      { label: 'Sarah laughs, Mary asks', days: 'Day 4', refs: 'Genesis 18, Luke 1' },
      { label: 'To whom shall we go?', days: 'Day 7', refs: 'John 6, 1 John 5' },
    ],
  },

  'life-pride-7-days': {
    intro: [
      'Pride is the sin that is hardest to see in ourselves, and Scripture treats it as serious: God opposes the proud and gives grace to the humble. This plan reads a week of proud kings brought low and of the humility of Jesus, who washed his disciples’ feet.',
      'Day 1 is Obadiah’s warning to a proud nation and James 4. Day 2 follows two kings of Babylon, Nebuchadnezzar and Belshazzar, who learn who rules. Day 3 is Saul and King Uzziah, whose strength led to his downfall, and day 4 reads Jesus on seats of honour in Luke 14 and on religious show in Matthew 23. Day 5 is the foot-washing in John 13 and the hymn to Christ’s humility in Philippians 2. Day 6 is Paul on boasting in 1 Corinthians 1 and 4, and the week ends with Micah’s call to walk humbly with God.',
      'These readings treat humility as seeing yourself and God as you both are.',
    ],
    highlights: [
      { label: 'The pride of your heart', days: 'Day 1', refs: 'Obadiah, James 4' },
      { label: 'Kings brought low', days: 'Day 2', refs: 'Daniel 4–5' },
      { label: 'Strength that led to a fall', days: 'Day 3', refs: '1 Samuel 15, 2 Chronicles 26' },
      { label: 'Seats of honour', days: 'Day 4', refs: 'Luke 14, Matthew 23' },
      { label: 'The King who washed feet', days: 'Day 5', refs: 'John 13, Philippians 2' },
    ],
  },

  'life-temptation-7-days': {
    intro: [
      'Everyone is tempted, and so was Jesus. This plan reads a week of passages about temptation from every side: how people fell, how others stood, and what God provides for the person under pressure. It is frank about money, power and desire, and it keeps returning to grace.',
      'Day 1 sets the first temptation in Genesis 3 beside James 1. On day 2 Israel is tested in the wilderness in Deuteronomy 8, the passage Jesus quotes when he is tempted in Matthew 4. Day 3 is Joseph running from Potiphar’s wife and the warning of Proverbs 7, and day 4 Achan’s theft and Paul on the love of money. Day 5 is David and Bathsheba, with Psalm 51, a way back. Day 6 reads Proverbs 1 and 1 Corinthians 10, where God is faithful and provides a way out, and the week ends with Romans 6, Galatians 5 and Psalm 1.',
      'If you are caught in a pattern you cannot break, tell someone you trust. Temptation grows best in secret.',
    ],
    highlights: [
      { label: 'The first temptation', days: 'Day 1', refs: 'Genesis 3, James 1' },
      {
        label: 'Man shall not live on bread alone',
        days: 'Day 2',
        refs: 'Deuteronomy 8, Matthew 4',
      },
      { label: 'Joseph runs', days: 'Day 3', refs: 'Genesis 39, Proverbs 7' },
      { label: 'David falls, and comes back', days: 'Day 5', refs: '2 Samuel 11–12, Psalm 51' },
      { label: 'A way out', days: 'Day 6', refs: 'Proverbs 1, 1 Corinthians 10' },
    ],
  },

  'life-family-7-days': {
    intro: [
      'Families in Scripture are not tidy. They include brothers who cannot stand each other, parents who play favourites and children who wander. They also include promises: of faithfulness from one generation to the next, and of a household that serves God. This plan reads a week of family stories, and ends with the family God makes of his people.',
      'Day 1 begins in Genesis 2 with the first marriage and Psalm 128’s picture of a home. Day 2 is Joshua’s “as for me and my household” and Psalm 78 on telling the next generation. Day 3 reads Genesis 24 and Ephesians 5 on marriage, and day 4 a father’s teaching in Proverbs 4 and the portrait in Proverbs 31. Day 5 is Jacob and Esau, the stolen blessing and their meeting years later, and day 6 is Joseph and his brothers. The week ends with Galatians 4 on adoption into God’s family and Psalm 133.',
      'If a strained or broken relationship in your family is what weighs on you, days 5 and 6 are for you.',
    ],
    highlights: [
      { label: 'The first family', days: 'Day 1', refs: 'Genesis 2, Psalm 128' },
      { label: 'As for me and my household', days: 'Day 2', refs: 'Joshua 24, Psalm 78' },
      { label: 'A stolen blessing and a reunion', days: 'Day 5', refs: 'Genesis 27, Genesis 33' },
      { label: 'Joseph forgives his brothers', days: 'Day 6', refs: 'Genesis 44–45' },
      { label: 'God’s family', days: 'Day 7', refs: 'Galatians 4, Psalm 133' },
    ],
  },
};
