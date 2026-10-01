/**
 * Copy for the whole-Bible, book-study, topical and devotional plans.
 * See plan-copy.ts; plan-copy.test.ts checks every highlight against the schedule.
 */
import type { PlanCopy } from './plan-copy';

export const PLAN_COPY_STUDY: Readonly<Record<string, PlanCopy>> = {
  'bible-in-1-year': {
    intro: [
      'This plan takes you through the whole Bible in a year, from the first line of Genesis to the last chapter of Revelation, in the order the books stand in your Bible. A typical day is about three chapters: enough to keep moving, not so much that you have to hurry.',
      'The pace follows the shape of the book. Genesis and the Law fill the first fifty-three days, the history books carry you to day 126, and the Psalms alone run for about six weeks in the middle of the year. The Gospels begin on day 277, and the last week is Revelation.',
      'Day 1 is whenever you start, so January is no more special than any other month. It suits first-time readers, and anyone who wants to see how the whole story holds together.',
    ],
    highlights: [
      { label: 'The Law', days: 'Days 1–53', refs: 'Genesis – Deuteronomy' },
      { label: 'The history books', days: 'Days 54–126', refs: 'Joshua – Esther' },
      { label: 'Wisdom and song', days: 'Days 127–195', refs: 'Job – Song of Songs' },
      { label: 'The Prophets', days: 'Days 196–276', refs: 'Isaiah – Malachi' },
      { label: 'The New Testament', days: 'Days 277–365', refs: 'Matthew – Revelation' },
    ],
  },

  'genesis-to-revelation-chronological': {
    intro: [
      'This plan reads all 66 books in 365 days, with the early and historical books of the Old Testament arranged to follow the story more closely than the printed order does. It begins with Genesis and Job, then reads Exodus through Deuteronomy, and goes on to the history books.',
      'Job is read straight after Genesis, where many readers place it, in the age of the patriarchs. Later, Kings and Chronicles are read in turn, so you meet the same reigns twice, told from two points of view. After Esther the plan joins the order of Bible in One Year: Psalms, Proverbs, the Prophets, the Gospels, the letters, and Revelation on day 365.',
      'Choose it if you have read straight through before and want a different arrangement, or if you like the history to unfold in sequence. It is about three chapters a day.',
    ],
    highlights: [
      { label: 'Genesis and Job', days: 'Days 1–26', refs: 'Genesis, Job' },
      {
        label: 'Kings and Chronicles in turn',
        days: 'Days 97–128',
        refs: '1 Kings, 1 Chronicles, 2 Kings, 2 Chronicles',
      },
      { label: 'Wisdom and song', days: 'Days 139–195', refs: 'Psalms – Song of Songs' },
      { label: 'The Prophets', days: 'Days 196–276', refs: 'Isaiah – Malachi' },
      { label: 'The New Testament', days: 'Days 277–365', refs: 'Matthew – Revelation' },
    ],
    metaDescription:
      'Read all 66 books in 365 days, with Job after Genesis and Chronicles alongside Kings. A free Bible reading plan in the EveryBible app.',
  },

  'new-testament-90-days': {
    intro: [
      'This plan reads all 27 books of the New Testament in 90 days, at about three chapters a day. It starts with Matthew and ends in Revelation 22, so you hear the life of Jesus, the beginning of the church and the letters written to its first congregations in one continuous run.',
      'The four Gospels take the first 27 days and Acts the next eight. Paul’s letters, from Romans to Philemon, run from day 36 to day 68. Hebrews and the shorter letters follow, and the last week is Revelation.',
      'Because the Gospels come first and take their time, it works well for anyone who wants to meet Jesus before tackling the harder letters: a new believer, a curious reader, or someone coming back to the Bible after a long gap.',
    ],
    highlights: [
      { label: 'The four Gospels', days: 'Days 1–27', refs: 'Matthew – John' },
      { label: 'The early church', days: 'Days 28–35', refs: 'Acts' },
      { label: 'Paul’s letters', days: 'Days 36–68', refs: 'Romans – Philemon' },
      { label: 'Hebrews and the general letters', days: 'Days 69–83', refs: 'Hebrews – Jude' },
      { label: 'Revelation', days: 'Days 84–90', refs: 'Revelation' },
    ],
    metaDescription:
      'Read the whole New Testament in 90 days, about three chapters a day, from Matthew to Revelation. A free plan in the EveryBible app.',
  },

  'psalms-30-days': {
    intro: [
      'The Psalms are the Bible’s prayer book: 150 poems and songs written over many centuries, some of them praise and many of them honest complaint. This plan reads all of them in a month, five psalms a day, so you move through the whole range instead of stopping at the favourites.',
      'Day 5 includes Psalm 23, the psalm of the shepherd. Day 11 reads Psalm 51, the great prayer of repentance, and days 24 to 27 take you through the Songs of Ascents, the psalms pilgrims sang on the way up to Jerusalem. The month ends with the five psalms of praise that close the book.',
      'Read a day’s psalms slowly, or aloud, and notice how often a psalm begins in distress and ends in trust. Jesus prayed the Psalms himself, including from the cross, which is one reason Christians have never stopped reading them.',
    ],
    highlights: [
      { label: 'Two ways to live', days: 'Day 1', refs: 'Psalm 1' },
      { label: 'The Lord is my shepherd', days: 'Day 5', refs: 'Psalm 23' },
      { label: 'A prayer of repentance', days: 'Day 11', refs: 'Psalm 51' },
      { label: 'Songs of Ascents', days: 'Days 24–27', refs: 'Psalm 120–134' },
      { label: 'Praise to close', days: 'Day 30', refs: 'Psalm 146–150' },
    ],
  },

  'gospels-60-days': {
    intro: [
      'This plan reads Matthew, Mark, Luke and John in sixty days, usually a chapter or two at a time. Sixty days gives each Gospel room, which makes it a good fit if you would rather stay with each scene than skim it.',
      'Matthew takes nineteen days, Mark eleven, Luke sixteen and John fourteen. The reading slows as each account reaches Jerusalem: Mark’s last six chapters and Luke’s last eight are one chapter a day, and so are the final seven chapters of John, with Jesus’ last teaching, the cross and the resurrection.',
      'Reading the four accounts one after another also shows what each writer stresses: Matthew’s long blocks of teaching, Mark’s speed, Luke’s attention to the poor and the outsider, John’s long conversations. It suits anyone who wants the whole life of Jesus without a rush.',
    ],
    highlights: [
      { label: 'Matthew', days: 'Days 1–19', refs: 'Matthew' },
      { label: 'The Sermon on the Mount', days: 'Days 3–4', refs: 'Matthew 5–7' },
      { label: 'Mark', days: 'Days 20–30', refs: 'Mark' },
      { label: 'Luke', days: 'Days 31–46', refs: 'Luke' },
      { label: 'John', days: 'Days 47–60', refs: 'John' },
    ],
  },

  'proverbs-31-days': {
    intro: [
      'Proverbs has 31 chapters, so it fits a month exactly. This plan gives you the chapter that matches the date: on the 9th you read Proverbs 9, and on the 1st you begin again. Read it a dozen times a year and different lines catch you each time.',
      'The first nine chapters are a father’s urgent advice to his son, with Wisdom herself calling out in the street. From chapter 10 the book turns to short, vivid sayings about work, money, speech, anger and friendship. Chapter 30 gathers the sayings of Agur, and chapter 31 ends with the words a king’s mother taught him and a portrait of a capable, generous woman.',
      'Each reading is short and complete, which makes it easy to tie to a morning routine. A few minutes is enough.',
    ],
    highlights: [
      { label: 'A father’s instruction', days: 'Days 1–9', refs: 'Proverbs 1–9' },
      {
        label: 'Short sayings on work, words and money',
        days: 'Days 10–29',
        refs: 'Proverbs 10–29',
      },
      { label: 'The sayings of Agur', days: 'Day 30', refs: 'Proverbs 30' },
      { label: 'A king’s mother and a capable woman', days: 'Day 31', refs: 'Proverbs 31' },
    ],
  },

  'kathisma-weekly': {
    intro: [
      'In Orthodox Christian worship the Psalter is divided into twenty sections called kathismata, from the Greek word for sitting, because worshippers have traditionally been allowed to sit while they are read. Across a week the cycle covers all 150 psalms, and this plan sets out that weekly rhythm of morning and evening readings for you to follow.',
      'Sunday’s morning reading is Psalms 9 to 24, including Psalm 23, and Saturday morning brings Psalm 119, the longest psalm. The Songs of Ascents, Psalms 120 to 134, are read on Friday evening, and the week closes on Saturday evening with Psalms 1 to 8, the beginning of the book, so the cycle starts again.',
      'Psalm numbers here are those of English Bibles; the Greek Psalter used in Orthodox worship numbers most psalms one lower. If you pray with a printed Psalter or a service book, follow it first. This plan is a companion to the church’s prayer, not a replacement for it.',
    ],
    highlights: [
      { label: 'The Lord is my shepherd', days: 'Sunday', refs: 'Psalm 23' },
      { label: 'A prayer of repentance', days: 'Tuesday', refs: 'Psalm 51' },
      { label: 'Songs of Ascents', days: 'Friday', refs: 'Psalm 120–134' },
      {
        label: 'The long psalm, and the beginning',
        days: 'Saturday',
        refs: 'Psalm 119, Psalms 1–8',
      },
    ],
    metaDescription:
      'The Orthodox weekly Psalter: the appointed morning and evening kathismata for each day, covering all 150 psalms. Free in the EveryBible app.',
  },

  'common-prayer-psalter': {
    intro: [
      'The Book of Common Prayer, the prayer book of the Church of England and the wider Anglican Communion, appoints the Psalms for Morning and Evening Prayer so that the whole Psalter is read once a month. This plan follows that pattern, with a morning and an evening portion for each day of the month.',
      'On day 1 you read Psalms 1 to 8, and on day 4 the evening brings Psalm 23. Psalm 119, the longest psalm, is divided across days 24 to 26, and the month ends with Psalms 144 to 150. Day 31 repeats day 30, so a long month still finishes with Psalm 150.',
      'The readings open in the app’s Bible reader, in whichever translation you have chosen, rather than in the Coverdale version the Prayer Book prints. If you already say Morning and Evening Prayer, this keeps the Psalter beside you wherever you are.',
    ],
    highlights: [
      { label: 'The Psalter begins', days: 'Day 1', refs: 'Psalms 1–8' },
      { label: 'The Lord is my shepherd', days: 'Day 4', refs: 'Psalm 22–23' },
      { label: 'Come, let us sing to the Lord', days: 'Day 19', refs: 'Psalm 95' },
      { label: 'The long psalm, in three days', days: 'Days 24–26', refs: 'Psalm 119' },
      { label: 'Praise to close', days: 'Day 30', refs: 'Psalm 144–150' },
    ],
    metaDescription:
      'Pray all 150 psalms in a month, morning and evening, as appointed in the Book of Common Prayer. A free plan in the EveryBible app.',
  },

  'week-of-christ': {
    intro: [
      'Each day of the week remembers a different part of the life of Jesus, a pattern many churches have kept for centuries: Sunday for the resurrection, Friday for the cross and, in several traditions, Wednesday for the betrayal. Every day is a single chapter, so the whole week is light.',
      'Sunday is John 20, the empty tomb and Thomas. Monday is Hebrews 1 on who the Son is, and Tuesday his baptism in Matthew 3. Wednesday’s Matthew 26 covers the plot against him, the last supper and Gethsemane. Thursday is the gift of the Spirit at Pentecost in Acts 2, Friday the crucifixion in John 19, and Saturday the promise in 1 Thessalonians 4 that he will return.',
      'It suits anyone who wants a small weekly habit that keeps Jesus at the centre. Because it follows the days of the week, it works in any week of the year.',
    ],
    highlights: [
      { label: 'The resurrection', days: 'Sunday', refs: 'John 20' },
      { label: 'The betrayal', days: 'Wednesday', refs: 'Matthew 26' },
      { label: 'The gift of the Spirit', days: 'Thursday', refs: 'Acts 2' },
      { label: 'The cross', days: 'Friday', refs: 'John 19' },
      { label: 'The promise of his return', days: 'Saturday', refs: '1 Thessalonians 4' },
    ],
    metaDescription:
      'A weekly Bible reading plan that gives each day a part of Jesus’ story: the resurrection on Sunday, the cross on Friday. Free in the EveryBible app.',
  },

  'lords-prayer-week': {
    intro: [
      'Christians of every tradition pray the Lord’s Prayer, and this plan spends a week with it. Each day begins with the prayer itself, Matthew 6:9–13, and adds a second reading that opens up one of its lines: your Father, his name, his kingdom, his will, daily bread, forgiveness, and deliverance from evil.',
      'Sunday’s Romans 8 is about being children who can call God Father, and Monday’s Isaiah 6 shows the holiness of the name we pray to have honoured. On Tuesday Matthew 13 gathers the parables of the kingdom. Wednesday is Jesus in Gethsemane, praying that his Father’s will be done, and Thursday is John 6, the bread of life. Friday’s Matthew 18 is about forgiveness, and on Saturday the temptation in the wilderness and the armour of God answer the last petitions.',
      'The readings are short, so the week suits anyone who wants to pray this prayer more slowly than they usually do.',
    ],
    highlights: [
      { label: 'Our Father', days: 'Sunday', refs: 'Romans 8' },
      { label: 'Hallowed be your name', days: 'Monday', refs: 'Isaiah 6' },
      { label: 'Your will be done', days: 'Wednesday', refs: 'Matthew 26:36–46' },
      { label: 'Give us today our daily bread', days: 'Thursday', refs: 'John 6' },
      {
        label: 'Deliver us from evil',
        days: 'Saturday',
        refs: 'Matthew 4:1–11, Ephesians 6:10–20',
      },
    ],
    metaDescription:
      'Pray the Lord’s Prayer each day for a week and read one passage that opens up each line. A free weekly plan in the EveryBible app.',
  },

  'gospels-monthly': {
    intro: [
      'Matthew, Mark, Luke and John make up 89 chapters, which divide into the 31 days of a month at about three chapters a day. This plan ties each reading to the date: on the 12th you read Day 12, in Mark, and on the 1st you begin Matthew again, so the life of Jesus becomes something you return to every month.',
      'Matthew takes the first ten days, Mark runs from day 10 to day 15, Luke from day 15 to day 23, and John from day 23 to the end of the month. Because the four books overlap, you meet some stories more than once, from different angles, and the Sermon on the Mount falls on days 2 and 3.',
      'Since it follows the calendar, there is no plan to fall behind on. If you miss a few days, you simply pick up with today’s date.',
    ],
    highlights: [
      { label: 'Matthew', days: 'Days 1–10', refs: 'Matthew' },
      { label: 'Mark', days: 'Days 10–15', refs: 'Mark' },
      { label: 'Luke', days: 'Days 15–23', refs: 'Luke' },
      { label: 'John', days: 'Days 23–31', refs: 'John' },
    ],
  },

  'epistles-30-days': {
    intro: [
      'A large part of the New Testament is letters, written to real congregations and people about real questions. This plan reads twenty-one of them in thirty days, from Romans to Jude, in the order they stand in the New Testament.',
      'Romans takes the first two days, followed by 1 and 2 Corinthians and then Galatians, Ephesians, Philippians and Colossians. The shorter letters to the Thessalonians, to Timothy and to Titus come next, the one-chapter letter to Philemon falls on day 20, and Hebrews, James, Peter, John and Jude close the month.',
      'The days are uneven by design: day 1 is eight chapters of Romans, while day 29 is a single short chapter of 3 John. Read each as a letter, in one sitting, aware of the people who first received it. Hebrews does not name its author, and this plan reads it alongside the others without settling the question.',
    ],
    highlights: [
      { label: 'Romans', days: 'Days 1–2', refs: 'Romans' },
      { label: 'The Corinthian letters', days: 'Days 3–6', refs: '1 Corinthians – 2 Corinthians' },
      { label: 'Galatians to Colossians', days: 'Days 7–12', refs: 'Galatians – Colossians' },
      {
        label: 'Letters to churches and coworkers',
        days: 'Days 13–20',
        refs: '1 Thessalonians – Philemon',
      },
      { label: 'Hebrews to Jude', days: 'Days 21–30', refs: 'Hebrews – Jude' },
    ],
  },

  'sermon-on-the-mount-7-days': {
    intro: [
      'The Sermon on the Mount, Matthew 5 to 7, is the best-known collection of Jesus’ teaching, and many Christians read it as a portrait of life in his kingdom. This plan reads it in seven passages, one a day, so each part has room to be heard.',
      'You begin with the Beatitudes on day 1 and the call to be salt and light on day 2. Day 3 is Jesus on anger, desire and faithfulness in marriage, and day 4 takes up promises, revenge and love for enemies. Day 5 covers giving, prayer, including the Lord’s Prayer, and fasting, and day 6 is treasure and worry. Day 7 closes with judging others, asking and seeking, and the two builders.',
      'Luke records some of the same teaching in the shorter Sermon on the Plain, in Luke 6. This is a week for anyone who wants to read one thing well.',
    ],
    highlights: [
      { label: 'The Beatitudes', days: 'Day 1', refs: 'Matthew 5:1–12' },
      { label: 'Love for enemies', days: 'Day 4', refs: 'Matthew 5:33–48' },
      { label: 'Giving, prayer and fasting', days: 'Day 5', refs: 'Matthew 6:1–18' },
      { label: 'Treasure and worry', days: 'Day 6', refs: 'Matthew 6:19–34' },
      { label: 'Two builders', days: 'Day 7', refs: 'Matthew 7:1–29' },
    ],
    metaDescription:
      'Read the Sermon on the Mount (Matthew 5–7) in seven days, from the Beatitudes to the two builders. A free reading plan in the EveryBible app.',
  },

  'bible-in-30-days': {
    intro: [
      'This is the sprint: the whole Bible, 1,189 chapters, in 30 days, at about forty chapters a day. It is not a pace for every month or every reader, but it offers something the slower plans cannot. You see the entire story in a few weeks, with creation, covenant, exile, Christ and the church fresh in your mind when you reach the end.',
      'Expect several hours of reading a day. Day 1 covers Genesis 1–40, the Law is finished by day 5, and the history books end with Esther on day 11. The Psalms fill days 13 to 16, the prophets run from day 17 to day 24, and the New Testament begins on day 24 and ends with Revelation on day 30.',
      'Choose it for a season when you can set aside real time. If it proves too much, Full Bible in 90 Days and Bible in One Year cover the same ground more gently.',
    ],
    highlights: [
      { label: 'The Law', days: 'Days 1–5', refs: 'Genesis – Deuteronomy' },
      { label: 'The history books', days: 'Days 5–11', refs: 'Joshua – Esther' },
      { label: 'Wisdom and song', days: 'Days 11–17', refs: 'Job – Song of Songs' },
      { label: 'The Prophets', days: 'Days 17–24', refs: 'Isaiah – Malachi' },
      { label: 'The New Testament', days: 'Days 24–30', refs: 'Matthew – Revelation' },
    ],
    metaDescription:
      'Read the whole Bible in 30 days: about 40 chapters a day, Genesis to Revelation. A demanding free reading plan in the EveryBible app.',
  },

  'bible-in-90-days': {
    intro: [
      'This plan reads all 1,189 chapters of the Bible in 90 days, about thirteen chapters a day. That is a serious commitment, probably the better part of an hour each day, but it is within reach for anyone who sets a regular time, and it gives you the whole story in a single season.',
      'Genesis to Deuteronomy are done by day 14, and Joshua through Esther take you to day 33. The poetry and wisdom books run to day 51, the prophets from day 51 to day 70, and the last twenty days are the New Testament, ending in Revelation 22.',
      'It suits someone who has read the Bible in pieces and wants it in one piece. If thirteen chapters a day is more than you want to carry, Bible in One Year covers the same ground at about three.',
    ],
    highlights: [
      { label: 'The Law', days: 'Days 1–14', refs: 'Genesis – Deuteronomy' },
      { label: 'The history books', days: 'Days 14–33', refs: 'Joshua – Esther' },
      { label: 'Wisdom and song', days: 'Days 33–51', refs: 'Job – Song of Songs' },
      { label: 'The Prophets', days: 'Days 51–70', refs: 'Isaiah – Malachi' },
      { label: 'The New Testament', days: 'Days 71–90', refs: 'Matthew – Revelation' },
    ],
    metaDescription:
      'Read all 1,189 chapters of the Bible in 90 days, about 13 a day, Genesis to Revelation. A free reading plan in the EveryBible app.',
  },

  'nt-in-30-days': {
    intro: [
      'The whole New Testament, 260 chapters, in a month: about nine chapters a day. At that pace you read several chapters of a Gospel or a letter in one sitting, which is closer to how these books were first heard, read aloud to a gathered congregation.',
      'The Gospels fill days 1 to 10, with John ending on the day Acts begins. Acts runs through day 13, Paul’s letters go from Romans on day 14 to Philemon on day 23, and Hebrews and the general letters fill days 24 to 28. Revelation begins on day 28 and ends on day 30.',
      'It suits someone who wants to read the New Testament as a whole while it is fresh. When thirty days is too fast, New Testament in 90 Days covers the same books at about three chapters a day.',
    ],
    highlights: [
      { label: 'The four Gospels', days: 'Days 1–10', refs: 'Matthew – John' },
      { label: 'The early church', days: 'Days 10–13', refs: 'Acts' },
      { label: 'Paul’s letters', days: 'Days 14–23', refs: 'Romans – Philemon' },
      { label: 'Hebrews and the general letters', days: 'Days 24–28', refs: 'Hebrews – Jude' },
      { label: 'Revelation', days: 'Days 28–30', refs: 'Revelation' },
    ],
    metaDescription:
      'Read the whole New Testament in 30 days, about nine chapters a day, from Matthew to Revelation. A free reading plan in the EveryBible app.',
  },

  'gospels-30-days': {
    intro: [
      'Four accounts of one life: Matthew, Mark, Luke and John in thirty days, at about three chapters a day. The pace is comfortable enough for a daily habit and quick enough that the story stays in your head from one day to the next.',
      'Matthew runs through day 10, Mark from day 10 to day 15, Luke from day 15 to day 23, and John from day 23 to day 30. Along the way you read the Sermon on the Mount on days 2 and 3, the parables of the lost sheep, coin and son in Luke 15 on day 20, and the last days of Jesus’ life, death and resurrection in John on days 29 and 30.',
      'It starts the day you do, so there is no need to wait for the first of the month.',
    ],
    highlights: [
      { label: 'Matthew', days: 'Days 1–10', refs: 'Matthew' },
      { label: 'The Sermon on the Mount', days: 'Days 2–3', refs: 'Matthew 5–7' },
      { label: 'Mark', days: 'Days 10–15', refs: 'Mark' },
      { label: 'Luke', days: 'Days 15–23', refs: 'Luke' },
      { label: 'John', days: 'Days 23–30', refs: 'John' },
    ],
    metaDescription:
      'Read Matthew, Mark, Luke and John in 30 days, about three chapters a day, with every day’s readings. A free plan in the EveryBible app.',
  },

  'acts-28-days': {
    intro: [
      'Acts tells what happened after Jesus’ resurrection: the first believers waiting in Jerusalem, the coming of the Spirit, and a message that travels from city to city until it reaches Rome. It has 28 chapters, so this plan reads one a day for 28 days.',
      'Chapter 2 is Pentecost, and chapter 9 is the meeting on the road that turns Saul the persecutor into Paul. In chapters 10 and 11 the good news reaches people who are not Jewish, and chapter 15 records the council in Jerusalem that decides how the church should respond. The last two chapters are a storm at sea, a shipwreck and the arrival in Rome.',
      'Acts is traditionally read as the second volume of Luke’s work, so it follows naturally after his Gospel. Its own outline is in 1:8: Jerusalem, Judea and Samaria, and the ends of the earth.',
    ],
    highlights: [
      { label: 'Pentecost', days: 'Day 2', refs: 'Acts 2' },
      { label: 'Saul meets Jesus', days: 'Day 9', refs: 'Acts 9' },
      { label: 'The good news reaches the Gentiles', days: 'Days 10–11', refs: 'Acts 10–11' },
      { label: 'The council in Jerusalem', days: 'Day 15', refs: 'Acts 15' },
      { label: 'Shipwreck and Rome', days: 'Days 27–28', refs: 'Acts 27–28' },
    ],
    metaDescription:
      'Read the book of Acts in 28 days, one chapter a day, from Pentecost to Paul in Rome. A free reading plan in the EveryBible app.',
  },

  'foundations-of-the-gospel': {
    intro: [
      'This plan tells the gospel as one story in fourteen days: how the world was made good, how it went wrong, how God promised and then acted, and where it is all going. The readings come from the Old Testament, the Gospels, Acts and the letters, so you see how the pieces fit instead of reading a single book.',
      'It begins in Genesis 1–3 with creation and the fall, and reads Romans 1–4 for Paul’s account of sin and of being put right with God. Isaiah 52–53 and Psalm 22 on day 4 describe a suffering servant. The next days follow Jesus from Luke 1 through John and Mark to the cross and the empty tomb on days 9 and 10, and then Acts, Romans 5–8 and Ephesians describe what the resurrection began. It ends in Revelation 19–22 with the new creation.',
      'It is a good starting place for someone curious about Christianity, new to the Bible, or preparing to explain their faith to a friend.',
    ],
    highlights: [
      { label: 'Creation and the fall', days: 'Day 1', refs: 'Genesis 1–3' },
      { label: 'The suffering servant', days: 'Day 4', refs: 'Isaiah 52–53, Psalm 22' },
      {
        label: 'The cross and the empty tomb',
        days: 'Days 9–10',
        refs: 'Matthew 26–28, Luke 23–24, John 20',
      },
      { label: 'Life in the Spirit', days: 'Day 12', refs: 'Romans 5–8' },
      { label: 'New creation', days: 'Day 14', refs: 'Revelation 19–22' },
    ],
  },

  'prayer-intimacy-with-god': {
    intro: [
      'Prayer in the Bible is rarely tidy. This plan spends a week with people who pray honestly in the Psalms, with Jesus’ teaching on prayer, and with the prayers he prayed himself. It is for anyone who wants prayer to feel less like a task and more like time with someone they know.',
      'Days 1 to 3 are Psalms, ending with Psalms 23 to 27, where the Lord is a shepherd and a light. Day 4 reads three psalms of very different moods: Psalm 32 on forgiveness, Psalm 51 on a clean heart and Psalm 63 on thirst for God. Day 5 is the Sermon on the Mount, and day 6 reads Luke 11, Luke 18 and John 15 on asking, persistence and staying close to Christ.',
      'The week ends with Jesus’ prayer for his followers in John 17 and Romans 8, where the Spirit prays with us when we cannot find the words.',
    ],
    highlights: [
      { label: 'A shepherd and a light', days: 'Day 3', refs: 'Psalm 23–27' },
      {
        label: 'Forgiveness, a clean heart, thirst for God',
        days: 'Day 4',
        refs: 'Psalm 32, Psalm 51, Psalm 63',
      },
      { label: 'Jesus on prayer', days: 'Day 5', refs: 'Matthew 5–7' },
      { label: 'Ask, persist, remain', days: 'Day 6', refs: 'Luke 11, Luke 18, John 15' },
      { label: 'Jesus prays for us', days: 'Day 7', refs: 'John 17, Romans 8' },
    ],
    metaDescription:
      'A seven-day Bible reading plan on prayer: the Psalms, the Sermon on the Mount and Jesus’ own prayers. Free in the EveryBible app.',
  },

  'identity-in-christ': {
    intro: [
      'Many of us carry labels: what we do, what we have done, what other people say about us. This plan reads the New Testament letters that describe a different foundation. Ephesians, Colossians, Romans, 2 Corinthians and Galatians each say, in their own way, who a person is in Christ: chosen, forgiven, adopted, made new.',
      'Days 1 to 3 read Ephesians and Colossians through, beginning with Paul’s long sentence about the blessings given in Christ and moving on to how a new identity shows up in ordinary life. Romans 5 to 10 fills days 4 and 5, with Romans 8 on there being no condemnation for those in Christ. Day 6 is 2 Corinthians on new creation, and day 7 is Galatians, where Paul says he has been crucified with Christ.',
      'In these letters, identity is received rather than achieved. The week suits anyone who feels defined by their failures or their achievements.',
    ],
    highlights: [
      { label: 'Chosen and made alive', days: 'Day 1', refs: 'Ephesians 1–4' },
      { label: 'Raised with Christ', days: 'Day 3', refs: 'Colossians 3' },
      { label: 'No condemnation', days: 'Day 5', refs: 'Romans 8' },
      { label: 'A new creation', days: 'Day 6', refs: '2 Corinthians 5' },
      { label: 'Crucified with Christ', days: 'Day 7', refs: 'Galatians 2' },
    ],
  },

  'the-kingdom-of-god': {
    intro: [
      'The kingdom of God is the heart of Jesus’ preaching: God’s rule coming near, in his words and works and in the lives of those who follow him. This plan reads fourteen days of Matthew, Luke, John, Acts and Romans to see what Jesus says the kingdom is like, who belongs to it and what it asks of us.',
      'It begins in Matthew 3–5, with John’s call to repent and Jesus’ announcement that the kingdom has come near. Then come the Sermon on the Mount, the miracles, and the parables of Matthew 13 on day 4. Luke takes the next five days, including the mustard seed, the great banquet and the parables of the lost in chapters 13 to 15. John 3 on day 11 speaks of being born again to see the kingdom, and the plan closes with Acts 1 and Romans 14.',
      'Christians differ about how far the kingdom is already here and how far it is still to come. These readings keep both in view.',
    ],
    highlights: [
      { label: 'The kingdom comes near', days: 'Day 1', refs: 'Matthew 3–5' },
      { label: 'Parables of the kingdom', days: 'Day 4', refs: 'Matthew 13' },
      { label: 'Mustard seed, banquet and the lost', days: 'Day 9', refs: 'Luke 13–15' },
      { label: 'Born again', days: 'Day 11', refs: 'John 3' },
      { label: 'Righteousness, peace and joy', days: 'Day 14', refs: 'Romans 14' },
    ],
  },

  'spiritual-warfare': {
    intro: [
      'The Bible takes unseen opposition seriously without making it the centre of the story. This plan reads a week of passages about spiritual conflict: where it begins, how Jesus met it, and what the apostles tell those who follow him. The emphasis is steady throughout: Christ has already won, and his people are told to stand firm, not to go looking for a fight.',
      'Day 1 sets the serpent of Genesis 3 beside Satan’s accusations against Job. On day 2 Jesus is tested in the wilderness and drives out an unclean spirit, and Daniel 10 on day 3 draws back the curtain on a conflict in the heavens. Day 5 gathers practical counsel: the armour of God in Ephesians 6, resisting the devil in James 4, and Peter’s call to stay alert. The last days follow the apostles in Acts and end with Revelation 12–14.',
      'These passages are about resisting through truth, prayer, humility and fellowship, not formulas. If fear is what you feel most, the Fear plan may be a gentler start.',
    ],
    highlights: [
      { label: 'The serpent and the accuser', days: 'Day 1', refs: 'Genesis 3, Job 1–2' },
      { label: 'Jesus is tested', days: 'Day 2', refs: 'Matthew 4, Luke 4, Mark 1' },
      { label: 'A conflict behind the scenes', days: 'Day 3', refs: 'Daniel 10–12' },
      {
        label: 'Armour and alertness',
        days: 'Day 5',
        refs: 'Ephesians 6, James 4, 1 Peter 5',
      },
      { label: 'The dragon cast down', days: 'Day 7', refs: 'Revelation 12–14' },
    ],
  },

  'holiness-and-sanctification': {
    intro: [
      'To be holy is to be set apart for God. The Bible speaks of it as something God gives and something his people grow into, and this plan follows that thread across fourteen days, from the laws of Leviticus to the letters of the New Testament.',
      'It opens with Leviticus 19–20, which calls Israel to be holy because God is holy, and Psalm 24. Then it reads Isaiah’s vision of a holy God in chapter 6 together with his warnings about empty religion. The Sermon on the Mount and Jesus’ words in John 15–17 follow, then Paul on living by the Spirit in Romans, Galatians, Ephesians and Colossians. The plan returns to Leviticus’s command in 1 Peter and ends in Hebrews 10–12.',
      'Christians describe this growth in different words, but these readings present it both as God’s gift and as our daily response.',
    ],
    highlights: [
      { label: 'Be holy', days: 'Day 1', refs: 'Leviticus 19–20, Psalm 24' },
      { label: 'Holy, holy, holy', days: 'Day 3', refs: 'Isaiah 5–6' },
      { label: 'Freed from sin', days: 'Day 6', refs: 'Romans 6–8' },
      { label: 'The fruit of the Spirit', days: 'Day 8', refs: 'Galatians 5–6' },
      { label: 'A holy people', days: 'Day 13', refs: '1 Peter 1–4' },
    ],
  },

  'great-commission-and-mission': {
    intro: [
      'God’s mission begins long before the Great Commission. This plan traces it across a week: the promise to Abraham that all the families of the earth would be blessed, the psalms and prophets that picture the nations praising God, Jesus sending out his disciples, and the vision of a great multitude from every nation in Revelation.',
      'Day 1 is God’s call to Abram in Genesis 12–15, and day 2 the psalms that call the nations to praise. On day 3 Isaiah speaks of a light for the nations. Matthew 9–11 shows Jesus’ compassion for the crowds and his sending of the twelve, and Matthew 24–28 ends with the command to make disciples of all nations. Day 6 reads Luke 10 and the first chapters of Acts, and the week ends with Romans 10, asking how people will hear, and Revelation 5 and 7.',
      'It is not a manual of methods but a reminder of why, and it suits anyone who wonders what the Bible says about sharing the good news.',
    ],
    highlights: [
      { label: 'Blessing for all nations', days: 'Day 1', refs: 'Genesis 12–15' },
      { label: 'A light for the nations', days: 'Day 3', refs: 'Isaiah 49, Isaiah 60–61' },
      { label: 'Go and make disciples', days: 'Day 5', refs: 'Matthew 24–28' },
      { label: 'Witnesses to the ends of the earth', days: 'Day 6', refs: 'Luke 10, Acts 1–3' },
      {
        label: 'Every nation before the throne',
        days: 'Day 7',
        refs: 'Revelation 5, Revelation 7',
      },
    ],
  },

  'faith-and-obedience': {
    intro: [
      'Faith and obedience belong together in the Bible: people trust God and then do what he says, often before they can see why. This plan follows that pattern through seven days of stories and teaching, from Abraham leaving home to the disciples leaving their nets.',
      'Day 1 is Abram’s call and the promise he believed in Genesis 12–15, and day 2 is Israel crossing the Jordan in Joshua 1–4. Day 3 shows what disobedience costs King Saul in 1 Samuel 13–15, and day 4 reads psalms of trust and patience. Hebrews 11, the chapter of faithful people, and James 2, which insists that faith shows itself in action, come on days 5 and 6, so you see the full picture. The week ends with Jesus calling people to follow him in Luke.',
      'The plan suits anyone facing a decision that asks for trust without a clear map.',
    ],
    highlights: [
      { label: 'Abram believes', days: 'Day 1', refs: 'Genesis 12–15' },
      { label: 'Crossing the Jordan', days: 'Day 2', refs: 'Joshua 1–4' },
      { label: 'Obedience over sacrifice', days: 'Day 3', refs: '1 Samuel 15' },
      { label: 'The chapter of faith', days: 'Day 5', refs: 'Hebrews 11' },
      { label: 'Faith that acts', days: 'Day 6', refs: 'James 2' },
    ],
  },

  'hearing-gods-voice': {
    intro: [
      'The Bible is full of people to whom God spoke: a boy in the night, prophets with a message, disciples who followed a shepherd’s voice. This plan reads seven days of those stories and teachings to see how God speaks, and how his people learn to recognise him.',
      'Day 1 is the young Samuel hearing his name called in the night and answering that he is listening (1 Samuel 3), with two psalms of prayer. Jeremiah and Ezekiel, called to speak for God, follow on days 2 and 3. On day 4 Jesus says his sheep know his voice and promises the Spirit, and day 5 shows the Spirit directing the early church in Acts 8 to 10. Hebrews on day 6 urges readers who hear his voice today not to harden their hearts, and the week ends with walking by the Spirit in Galatians and the letters to the seven churches in Revelation.',
      'Scripture is the plain anchor throughout. Test anything you think you have heard against it and against the counsel of wise believers.',
    ],
    highlights: [
      { label: 'Speak, Lord', days: 'Day 1', refs: '1 Samuel 3' },
      { label: 'Called to speak for God', days: 'Day 2', refs: 'Jeremiah 1' },
      { label: 'My sheep hear my voice', days: 'Day 4', refs: 'John 10' },
      { label: 'The Spirit guides the church', days: 'Day 5', refs: 'Acts 10' },
      { label: 'Whoever has ears', days: 'Day 7', refs: 'Revelation 2–3' },
    ],
  },
};
