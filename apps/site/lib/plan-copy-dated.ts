/**
 * Copy for the dated plans beyond Advent and the Twelve Days of Christmas: the
 * rest of the church year and a few other weeks. See plan-copy.ts;
 * plan-copy.test.ts checks every highlight against the schedule.
 */
import type { PlanCopy } from './plan-copy';

export const PLAN_COPY_DATED: Readonly<Record<string, PlanCopy>> = {
  'when-christmas-is-hard': {
    intro: [
      'Christmas is meant to be glad, and for many people it is the hardest week of the year. A death, a divorce, an empty chair, a strained family or plain loneliness can make the carols hard to bear. This plan does not ask you to feel cheerful. It stays with you for the seven days before Christmas and reads Scripture that is honest about pain.',
      'It begins on 18 December with Naomi coming home empty in Ruth 1 and Psalm 13, which asks “How long, Lord?” On 21 December Elijah, worn out, is fed and allowed to rest in 1 Kings 19. On 22 December Jesus weeps at the grave of his friend in John 11, and on 23 December Romans 8 says that nothing can separate you from God’s love. Christmas Eve ends with Isaiah 57 and Psalm 27, for those who wait.',
      'If the season is heavier than you can carry alone, tell someone you trust, such as a friend, your pastor or a counsellor. This plan sits beside that care and does not replace it.',
    ],
    highlights: [
      { label: 'Naomi comes home empty', days: '18 December', refs: 'Ruth 1, Psalm 13' },
      { label: 'The God of all comfort', days: '19 December', refs: '2 Corinthians 1, Psalm 34' },
      { label: 'Elijah, worn out', days: '21 December', refs: '1 Kings 19' },
      { label: 'Jesus weeps', days: '22 December', refs: 'John 11, Psalm 56' },
      { label: 'Nothing can separate us', days: '23 December', refs: 'Romans 8, Psalm 46' },
    ],
    metaDescription:
      'Seven days of Scripture for when Christmas is heavy with loss or loneliness, from 18 to 24 December. A free reading plan in the EveryBible app.',
  },

  'new-year': {
    intro: [
      'A new year invites resolutions, and this plan offers something steadier: a week of beginnings from Scripture, from 1 to 7 January. It starts where the Bible starts, with the first day of creation in Genesis 1, and ends where it ends, with the new heaven and the new earth in Revelation 21.',
      'In between, Joshua is told to be strong and courageous as he takes up Moses’ work, and God promises in Isaiah 43 to do a new thing and make a way in the wilderness. In 2 Corinthians 5 anyone in Christ is a new creation, and in Philippians 3 Paul forgets what is behind and presses on. Matthew 6 and Romans 12 close the week with how to live: seek first God’s kingdom and offer your whole life to him. Each chapter is paired with a psalm for setting out, such as Psalm 121 and Psalm 23.',
    ],
    highlights: [
      { label: 'In the beginning', days: '1 January', refs: 'Genesis 1, Psalm 1' },
      { label: 'A new thing', days: '3 January', refs: 'Isaiah 43, Psalm 40' },
      { label: 'A new creation', days: '4 January', refs: '2 Corinthians 5, Psalm 65' },
      { label: 'Forgetting what is behind', days: '5 January', refs: 'Philippians 3, Psalm 37' },
      { label: 'All things new', days: '7 January', refs: 'Revelation 21, Psalm 23' },
    ],
    metaDescription:
      'A week of beginnings for 1 to 7 January, from Genesis 1 to the new creation in Revelation 21. A free Bible reading plan in the EveryBible app.',
  },

  epiphany: {
    intro: [
      'Epiphany means a showing, and on 6 January the church remembers Christ shown to the world. This plan reads the seven days from the feast, each with a short reading and, usually, a psalm.',
      'It opens with Jesus, the light of the world, in John 8. Mark 1 is his baptism, when the Spirit comes down and a voice calls him the beloved Son, and John 2 is the wedding at Cana, where he turns water into wine. From there the light spreads outward. Jonah is sent to Nineveh, a foreign city, and is angry that God shows mercy. In Acts 10 Peter learns that God shows no favouritism, and Romans 10 asks how anyone can hear without someone to tell them. The week ends with Revelation 7, a great crowd from every nation, tribe and language.',
    ],
    highlights: [
      { label: 'The light of the world', days: '6 January', refs: 'John 8, Psalm 36' },
      { label: 'The baptism of Jesus', days: '7 January', refs: 'Mark 1, Psalm 29' },
      { label: 'Jonah and the foreign city', days: '9 January', refs: 'Jonah 3–4' },
      { label: 'God shows no favouritism', days: '10 January', refs: 'Acts 10, Psalm 87' },
      { label: 'Every nation, tribe and language', days: '12 January', refs: 'Revelation 7' },
    ],
    metaDescription:
      'Seven days from 6 January, the feast of the Epiphany: Jesus the light of the world, and the good news for every nation. Free in the EveryBible app.',
  },

  lent: {
    intro: [
      'Lent is the church’s season of turning back to God before Easter, and this plan gives its weeks a daily shape. It runs from Ash Wednesday to the eve of Palm Sunday, 39 days, with a short reading and usually a psalm each day, so that Holy Week can begin where Lent ends.',
      'The first four days are about return, beginning with Isaiah 58 and Psalm 51, the prayer of someone who has done wrong. Then come five themed weeks: the wilderness, where Jesus is tempted in Matthew 4 and Israel is fed with manna; mercy, from David’s repentance in 2 Samuel 12 to Ezekiel 18; following Jesus through Mark 8 to 10, where he tells his disciples to take up their cross; the Lamb, from Abraham and Isaac in Genesis 22 to Isaiah 50 and Hebrews 9; and the road to Jerusalem, which ends with the raising of Lazarus in John 11.',
      'Lent moves with Easter, so it begins on a different date every year.',
    ],
    highlights: [
      { label: 'Return to the Lord', days: 'Day 1', refs: 'Isaiah 58, Psalm 51' },
      { label: 'Tested in the wilderness', days: 'Day 5', refs: 'Matthew 4, Deuteronomy 8' },
      { label: 'David confesses', days: 'Day 12', refs: '2 Samuel 12, Psalm 32' },
      { label: 'Abraham and Isaac', days: 'Day 26', refs: 'Genesis 22' },
      { label: 'Lazarus is raised', days: 'Day 39', refs: 'John 11, Psalm 30' },
    ],
    metaDescription:
      'A daily Lent reading plan from Ash Wednesday to the eve of Palm Sunday: the wilderness, mercy and the road to Jerusalem. Free in the EveryBible app.',
  },

  'holy-week': {
    intro: [
      'Holy Week is the church’s slowest week, and this plan reads it a day at a time, from Palm Sunday to Easter Day. Each day has its own chapters, so you move with the events instead of reading about them all at once.',
      'Palm Sunday brings the king into Jerusalem on a donkey in Matthew 21. Monday and Tuesday are the clearing of the temple and Jesus’ teaching there, with Mark’s account of the end of the age. On Maundy Thursday you read the Passover in Exodus 12, Jesus washing his disciples’ feet in John 13 and the Last Supper and Gethsemane in Luke 22. Good Friday pairs John 19 with Isaiah 53, the servant pierced for our transgressions, and Psalm 22. Holy Saturday is the burial and the sealed tomb in Matthew 27, and Easter Day ends the week with the empty tomb in Matthew 28 and John 20.',
      'Holy Week moves with Easter. A separate plan reads the same chapters on the Orthodox calendar.',
    ],
    highlights: [
      { label: 'The king on a donkey', days: 'Palm Sunday', refs: 'Matthew 21, Psalm 118' },
      {
        label: 'The Passover and the Last Supper',
        days: 'Maundy Thursday',
        refs: 'Exodus 12, John 13, Luke 22',
      },
      {
        label: 'The servant pierced',
        days: 'Good Friday',
        refs: 'Isaiah 53, Psalm 22, John 19',
      },
      { label: 'The sealed tomb', days: 'Holy Saturday', refs: 'Matthew 27, Job 14' },
      { label: 'He is risen', days: 'Easter Day', refs: 'Matthew 28, John 20' },
    ],
    metaDescription:
      'Read Holy Week a day at a time, from Palm Sunday to Easter Day: the supper, the cross and the empty tomb. Free in the EveryBible app.',
  },

  'orthodox-holy-week': {
    intro: [
      'This is Holy Week as the Orthodox Church keeps it, from Palm Sunday to Pascha on the Orthodox calendar. Pascha is often later than Western Easter, and the two fall on the same day only in some years. The readings are the same as in the Holy Week plan, one day at a time, so people who keep different dates can still read the same chapters.',
      'Palm Sunday begins with Jesus entering Jerusalem in Matthew 21 and Psalm 118. The next days follow his teaching in the temple, in Mark 11 to 13 and Jeremiah 7. On Holy Thursday you read the Passover in Exodus 12, the washing of the disciples’ feet in John 13 and Gethsemane in Luke 22. Holy Friday gathers Isaiah 53, Psalm 22 and John 19 at the cross, and Holy Saturday reads of the tomb in Matthew 27 and of Job’s question whether the dead will live again. The week ends on Pascha with the resurrection in Matthew 28 and John 20.',
    ],
    highlights: [
      { label: 'The king enters Jerusalem', days: 'Palm Sunday', refs: 'Matthew 21, Psalm 118' },
      {
        label: 'The Passover and the washing of feet',
        days: 'Holy Thursday',
        refs: 'Exodus 12, John 13',
      },
      { label: 'The cross', days: 'Holy Friday', refs: 'Isaiah 53, Psalm 22, John 19' },
      { label: 'Shall the dead live again?', days: 'Holy Saturday', refs: 'Job 14, Matthew 27' },
      { label: 'Christ is risen', days: 'Pascha', refs: 'Matthew 28, John 20' },
    ],
    metaDescription:
      'Holy Week on the Orthodox calendar, from Palm Sunday to Pascha, read a day at a time. A free Bible reading plan in the EveryBible app.',
  },

  easter: {
    intro: [
      'Easter is a season, not a single day, and this plan reads through it, from Easter Monday to the eve of Ascension Day, with a chapter and usually a psalm each day.',
      'The first days follow the risen Lord in Luke 24, Mark 16 and John 21, with Paul’s account of the resurrection in 1 Corinthians 15. Then come the letters that grew from Easter, one at a time: 1 Peter and its living hope, 1 John on walking in the light, and Hebrews on the high priest who lives for ever. Revelation shows the Lamb who was slain. The last weeks read the God who raises the dead through the whole Bible, from Elijah and Elisha in 1 and 2 Kings and Jonah in the fish to Daniel 7 and the Son of Man.',
      'Easter moves every year, so the dates move with it. Ascension to Pentecost picks up where this plan ends.',
    ],
    highlights: [
      {
        label: 'The risen Lord appears',
        days: 'Days 1–3',
        refs: 'Luke 24, Mark 16, John 21',
      },
      { label: 'A living hope', days: 'Days 7–10', refs: '1 Peter 1, 1 Peter 3–5' },
      { label: 'Walking in the light', days: 'Days 11–15', refs: '1 John 1–5' },
      {
        label: 'The Lamb who was slain',
        days: 'Days 20–22',
        refs: 'Revelation 5, Revelation 19, Revelation 22',
      },
      { label: 'The Son of Man', days: 'Day 38', refs: 'Daniel 7, Psalm 24' },
    ],
    metaDescription:
      'Read through Eastertide from Easter Monday to the eve of Ascension Day: the risen Lord, 1 Peter, 1 John and Hebrews. Free in the EveryBible app.',
  },

  'ascension-to-pentecost': {
    intro: [
      'Between Ascension Day and Pentecost the first disciples did what Jesus told them: they waited in Jerusalem and prayed. This plan reads those eleven days with them, from the day Jesus is taken up in Acts 1 to the day the Spirit comes in Acts 2.',
      'Days 2 to 4 are Jesus’ words about the Spirit in John 14, 16 and 17, including his prayer that his people be one. Then the story of the Spirit unfolds through the Bible. Day 5 sets the scattered languages of Babel in Genesis 11 beside Isaiah 66, where God gathers people of every language. After Moses wishes in Numbers 11 that all God’s people were prophets, Joel 2 promises the Spirit poured out on everyone. Ezekiel 36 and 37 promise a new heart and breath for dry bones, and Romans 8, Galatians 5 and 1 Corinthians 12 show the Spirit at work in a life. Acts 2 closes the plan, when each one hears in their own language.',
    ],
    highlights: [
      { label: 'Taken up, and waiting', days: 'Day 1', refs: 'Acts 1, Psalm 47' },
      { label: 'The Spirit promised', days: 'Days 2–4', refs: 'John 14, John 16, John 17' },
      { label: 'Babel and the gathered nations', days: 'Day 5', refs: 'Genesis 11, Isaiah 66' },
      { label: 'The Spirit poured out', days: 'Day 6', refs: 'Numbers 11, Joel 2' },
      { label: 'Each in their own language', days: 'Day 11', refs: 'Acts 2, Psalm 104' },
    ],
    metaDescription:
      'Eleven days from Ascension Day to Pentecost: wait and pray with the first disciples for the Holy Spirit. A free Bible reading plan in the EveryBible app.',
  },

  'word-in-every-language': {
    intro: [
      'Bible translators work for years so that one more people can hear Scripture in the language of their hearts. This plan is a week of reading and prayer for that work, from 24 to 30 September, ending on International Translation Day, St Jerome’s day.',
      'It begins with a scroll that a king burned and Jeremiah wrote again in Jeremiah 36, with Psalm 19. In Nehemiah 8 the Law is read aloud and explained so that the people understand. In Acts 8 an official from Ethiopia is asked, “Do you understand what you are reading?”, and in Acts 2 each person hears the good news in their own language. Romans 10 asks how anyone can believe without someone to tell them, and Revelation 5 ends the week with people from every tribe and language before the throne.',
      'As you read, pray for translators and for the communities waiting for Scripture they can understand.',
    ],
    highlights: [
      { label: 'The scroll written again', days: '24 September', refs: 'Jeremiah 36, Psalm 19' },
      { label: 'The Law read and explained', days: '25 September', refs: 'Nehemiah 8, Psalm 119' },
      { label: 'Do you understand?', days: '27 September', refs: 'Acts 8' },
      { label: 'Each in their own language', days: '28 September', refs: 'Acts 2, Psalm 96' },
      { label: 'Every tribe and language', days: '30 September', refs: 'Revelation 5, Psalm 117' },
    ],
    metaDescription:
      'A week of reading and prayer for Bible translators, ending on International Translation Day, 30 September. Free in the EveryBible app.',
  },

  'all-saints': {
    intro: [
      'On 1 November the church keeps All Saints’ Day, remembering those who have gone before. This plan spends the week from that day with the saints of Scripture: the great cloud of witnesses in Hebrews 11 and 12, and the ordinary people God used, many of them known only by a name.',
      'Day 1 reads Hebrews 11, the chapter of faith, and the call to run the race that follows it. Day 2 is Revelation 7, the great multitude in white, and day 3 the Beatitudes in Matthew 5. Day 4 returns to Abraham, who believed God’s promise of countless descendants, and day 5 to Hannah, who prayed for a son and gave him to the Lord. On day 6 Paul, once a persecutor, is called in Acts 9, and Romans 16 greets by name the friends and fellow workers of the early church. The week ends with Paul’s last letter in 2 Timothy 4.',
    ],
    highlights: [
      { label: 'A cloud of witnesses', days: '1 November', refs: 'Hebrews 11–12' },
      { label: 'The great multitude', days: '2 November', refs: 'Revelation 7, Psalm 34' },
      { label: 'The Beatitudes', days: '3 November', refs: 'Matthew 5, Psalm 112' },
      { label: 'Hannah prays', days: '5 November', refs: '1 Samuel 1–2' },
      { label: 'Friends greeted by name', days: '6 November', refs: 'Acts 9, Romans 16' },
    ],
    metaDescription:
      'Seven days from All Saints’ Day, 1 November, with the great cloud of witnesses and the faithful people the Bible names. Free in the EveryBible app.',
  },

  'persecuted-church': {
    intro: [
      'Many churches pray for believers who suffer for their faith on the second Sunday of November, and this plan gives the week from that day a shape in Scripture. It reads about people who were threatened, jailed and killed for following God, and what they prayed, said and were given.',
      'On Sunday the apostles are threatened in Acts 4 and pray for boldness. On Monday Stephen is stoned in Acts 7, forgiving those who kill him, and Tuesday’s Daniel 3 and 6 are the furnace and the lions, where faithful exiles refuse to bow. Wednesday is Peter freed from prison in Acts 12 while the church prays. On Thursday, in 2 Corinthians 11 and 12, Paul lists his beatings and shipwrecks and hears that grace is enough. Friday’s Matthew 10 holds Jesus’ warning and his promise, and the week ends with Paul in prison in Philippians 1.',
      'As you read, pray for Christians who are suffering today, and for those who persecute them.',
    ],
    highlights: [
      { label: 'Boldness under threat', days: 'Sunday', refs: 'Acts 4, Psalm 2' },
      { label: 'Stephen forgives', days: 'Monday', refs: 'Acts 7' },
      { label: 'The furnace and the lions', days: 'Tuesday', refs: 'Daniel 3, Daniel 6' },
      {
        label: 'Peter freed while the church prays',
        days: 'Wednesday',
        refs: 'Acts 12, Psalm 142',
      },
      { label: 'My grace is enough', days: 'Thursday', refs: '2 Corinthians 11–12' },
    ],
    metaDescription:
      'A week of Scripture and prayer for believers who suffer for their faith, from the second Sunday of November. Free in the EveryBible app.',
  },
};
