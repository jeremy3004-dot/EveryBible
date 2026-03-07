import type { LessonSection } from '../types/course';

// New "1 Field 1 Goal" Types
export type OneFieldGoalFieldType = 'good-news' | 'making-disciples' | 'multiplication';

export interface OneFieldGoalLesson {
  id: string;
  field: OneFieldGoalFieldType;
  order: number;
  title: string;
  titleTibetan?: string;
  goal: string;
  scripture: string[];
  content: {
    concept: string;
    practice: string;
    culturalBridge: string;
  };
  checklistItems: string[];
  sections: LessonSection[];
}

export interface OneFieldGoalField {
  id: OneFieldGoalFieldType;
  name: string;
  nameTibetan?: string;
  emoji: string;
  color: string;
  goal: string;
  completionCriteria: string[];
  lessons: OneFieldGoalLesson[];
  estimatedWeeks: number;
}

export const oneFieldOneGoalFields: OneFieldGoalField[] = [
  // ============================================
  // FIELD 1: GOOD NEWS - Share with One Person
  // ============================================
  {
    id: 'good-news',
    name: 'The Good News',
    nameTibetan: 'བསྟན་བཅོས་བཟང་པོ།',
    emoji: '🌄',
    color: '#D4A017', // Saffron Gold
    goal: 'Share God\'s story with one person',
    estimatedWeeks: 2,
    completionCriteria: [
      'Studied all 3 lessons',
      'Practiced sharing with a believer',
      'Shared with one non-believer',
      'Can explain the gospel in 5 minutes',
    ],
    lessons: [
      {
        id: '1f1g-goodnews-1',
        field: 'good-news',
        order: 1,
        title: 'God\'s Story from Creation to Christ',
        goal: 'Understand the big story of God\'s love',
        scripture: ['Genesis 1-3', 'John 3:16', 'Romans 5:8'],
        content: {
          concept: 'Every person needs to hear about God\'s love and plan for humanity. The gospel follows a simple pattern: Creation → Fall → Redemption.',
          practice: 'Share the creation-fall-redemption story with a friend using your own words.',
          culturalBridge: 'Tibetan creation stories speak of the world emerging from primordial light. Similarly, God created the world good, but sin brought darkness. Jesus is the light that restores us.',
        },
        checklistItems: [
          'Read Genesis 1-3 and identify: Creation (what was good), Fall (what went wrong)',
          'Read John 3:16 and Romans 5:8 - understand God\'s solution',
          'Practice explaining the story to another believer',
          'Share this story with one person who doesn\'t know Jesus',
        ],
        sections: [
          {
            type: 'text',
            content: 'God created humanity to know Him and reflect His image. We were designed for connection with our Creator. But sin entered the world and broke that relationship.',
          },
          {
            type: 'scripture',
            content: 'For God so loved the world that he gave his one and only Son, that whoever believes in him shall not perish but have eternal life.',
            reference: 'John 3:16',
          },
          {
            type: 'scripture',
            content: 'But God demonstrates his own love for us in this: While we were still sinners, Christ died for us.',
            reference: 'Romans 5:8',
          },
          {
            type: 'bullets',
            content: 'The Simple Story:',
            items: [
              'CREATION: God made us for relationship with Him',
              'FALL: Sin broke that relationship and brought death',
              'REDEMPTION: Jesus died and rose to restore us to God',
              'RESPONSE: We must turn from sin and trust in Jesus',
            ],
          },
          {
            type: 'activity',
            content: 'Practice telling this story in 3-5 minutes. Use simple language. Start with "God created us..." and end with "Will you trust Jesus today?"',
          },
        ],
      },
      {
        id: '1f1g-goodnews-2',
        field: 'good-news',
        order: 2,
        title: 'The Cross and Empty Tomb',
        goal: 'Explain Jesus\'s death and resurrection simply',
        scripture: ['Luke 23-24', '1 Corinthians 15:3-8'],
        content: {
          concept: 'Jesus\'s death paid for our sins. His resurrection proved He defeated death. This is the heart of the good news.',
          practice: 'Explain why the cross and resurrection matter to someone who asks, "Why did Jesus have to die?"',
          culturalBridge: 'Like prayer flags carrying prayers away on the wind, Jesus carried our sins away on the cross. The empty tomb shows death has no power over Him or us.',
        },
        checklistItems: [
          'Read Luke 23-24 (the crucifixion and resurrection)',
          'Memorize 1 Corinthians 15:3-4',
          'Explain to a believer: Why did Jesus die? Why does the resurrection matter?',
          'Be ready to share this when someone asks about your faith',
        ],
        sections: [
          {
            type: 'text',
            content: 'The death of Jesus was not a tragic accident. It was God\'s plan to rescue us. The cross shows the cost of sin and the depth of God\'s love.',
          },
          {
            type: 'scripture',
            content: 'For what I received I passed on to you as of first importance: that Christ died for our sins according to the Scriptures, that he was buried, that he was raised on the third day according to the Scriptures.',
            reference: '1 Corinthians 15:3-4',
          },
          {
            type: 'bullets',
            content: 'Why the Cross and Resurrection Matter:',
            items: [
              'The CROSS paid the penalty for our sins',
              'The BURIAL confirmed Jesus truly died',
              'The RESURRECTION proved Jesus is God and has power over death',
              'The EMPTY TOMB means we will also rise with Him',
            ],
          },
          {
            type: 'activity',
            content: 'Draw a simple cross and tomb. As you draw, explain what each represents. Practice until you can do this naturally in conversation.',
          },
        ],
      },
      {
        id: '1f1g-goodnews-3',
        field: 'good-news',
        order: 3,
        title: 'New Life in Christ',
        goal: 'Describe what changed after following Jesus',
        scripture: ['2 Corinthians 5:17', 'Ephesians 2:8-10'],
        content: {
          concept: 'When we trust Jesus, we become new creations. Old patterns lose their power. We receive new purpose, peace, and power from the Holy Spirit.',
          practice: 'Write out your testimony (before Jesus, how you met Jesus, life after Jesus) and share it with someone.',
          culturalBridge: 'In Tibetan culture, pilgrimage transforms the traveler. Following Jesus is a journey that transforms us from the inside out - not by our effort, but by His grace.',
        },
        checklistItems: [
          'Read 2 Corinthians 5:17 and Ephesians 2:8-10',
          'Write your 3-minute testimony: Before → How → After',
          'Share your testimony with one believer for feedback',
          'Share your story with one non-believer this week',
        ],
        sections: [
          {
            type: 'text',
            content: 'Following Jesus is not just about going to heaven someday. It is about a transformed life starting now. You become a new creation.',
          },
          {
            type: 'scripture',
            content: 'Therefore, if anyone is in Christ, the new creation has come: The old has gone, the new is here!',
            reference: '2 Corinthians 5:17',
          },
          {
            type: 'scripture',
            content: 'For it is by grace you have been saved, through faith—and this is not from yourselves, it is the gift of God— not by works, so that no one can boast. For we are God\'s handiwork, created in Christ Jesus to do good works.',
            reference: 'Ephesians 2:8-10',
          },
          {
            type: 'bullets',
            content: 'What Changes:',
            items: [
              'Your IDENTITY - you are God\'s child, not defined by your past',
              'Your PURPOSE - created for good works God prepared',
              'Your POWER - the Holy Spirit lives in you',
              'Your RELATIONSHIPS - part of God\'s family',
            ],
          },
          {
            type: 'activity',
            content: 'Write your testimony: Before Jesus (what was your life like?), How you met Jesus (what happened?), After Jesus (how has your life changed?). Keep it to 3-5 minutes.',
          },
        ],
      },
    ],
  },

  // ============================================
  // FIELD 2: MAKING DISCIPLES - Help One Grow
  // ============================================
  {
    id: 'making-disciples',
    name: 'Making Disciples',
    nameTibetan: 'སློབ་མ་བཟོ་བ།',
    emoji: '🤝',
    color: '#4A90E2', // Sky Blue
    goal: 'Help one person grow in their faith',
    estimatedWeeks: 8,
    completionCriteria: [
      'Studied all 3 lessons',
      'Meeting weekly with one person',
      'Person is growing in their faith',
      'Person is starting to share with others',
    ],
    lessons: [
      {
        id: '1f1g-disciples-1',
        field: 'making-disciples',
        order: 1,
        title: 'What Is a Disciple?',
        goal: 'Understand what it means to follow Jesus',
        scripture: ['Matthew 28:18-20', 'Luke 14:25-33'],
        content: {
          concept: 'A disciple is a learner and follower of Jesus who obeys His commands and makes other disciples. Following Jesus means helping others follow Jesus.',
          practice: 'List 5 characteristics of a disciple based on Scripture. Share this with someone you\'re mentoring.',
          culturalBridge: 'The guru-disciple tradition in Tibetan Buddhism shows deep commitment and transmission of teaching. Jesus calls us into an even deeper relationship - not just learning facts, but becoming like Him.',
        },
        checklistItems: [
          'Read Matthew 28:18-20 and Luke 14:25-33',
          'List 5 characteristics of a disciple',
          'Identify one person you can begin meeting with weekly',
          'Schedule your first meeting',
        ],
        sections: [
          {
            type: 'text',
            content: 'Jesus didn\'t call people to just believe in Him - He called them to follow Him. A disciple is someone who learns from Jesus and becomes like Him.',
          },
          {
            type: 'scripture',
            content: 'Then Jesus came to them and said, "All authority in heaven and on earth has been given to me. Therefore go and make disciples of all nations, baptizing them in the name of the Father and of the Son and of the Holy Spirit, and teaching them to obey everything I have commanded you."',
            reference: 'Matthew 28:18-20',
          },
          {
            type: 'bullets',
            content: 'Characteristics of a Disciple:',
            items: [
              'LEARNS - sits at Jesus\' feet through Scripture and prayer',
              'OBEYS - does what Jesus commands, not just hears it',
              'LOVES - demonstrates love for God and others',
              'MULTIPLIES - makes other disciples who make disciples',
              'ENDURES - follows Jesus even when it costs something',
            ],
          },
          {
            type: 'activity',
            content: 'Think of someone who is a newer believer than you. Invite them to meet weekly for 8 weeks to study Scripture and grow together.',
          },
        ],
      },
      {
        id: '1f1g-disciples-2',
        field: 'making-disciples',
        order: 2,
        title: 'One-on-One Mentoring',
        goal: 'Learn the 3/3 pattern for discipleship meetings',
        scripture: ['2 Timothy 2:2', 'Proverbs 27:17'],
        content: {
          concept: 'Discipleship happens best in intentional relationships. The 3/3 pattern provides structure: Look Back (review), Look Up (Bible study), Look Forward (application).',
          practice: 'Meet weekly with one newer believer using the 3/3 pattern for at least 8 weeks.',
          culturalBridge: 'Like walking a mountain path together, discipleship is a shared journey. You walk alongside someone, showing them the way, encouraging them when the path is steep.',
        },
        checklistItems: [
          'Read 2 Timothy 2:2 - see the multiplication chain',
          'Learn the 3/3 pattern (Look Back, Look Up, Look Forward)',
          'Practice the 3/3 pattern with your mentoring partner',
          'Commit to meeting weekly for 8 weeks minimum',
        ],
        sections: [
          {
            type: 'text',
            content: 'Paul discipled Timothy. Timothy would disciple reliable people. Those reliable people would teach others. This is the multiplication pattern.',
          },
          {
            type: 'scripture',
            content: 'And the things you have heard me say in the presence of many witnesses entrust to reliable people who will also be qualified to teach others.',
            reference: '2 Timothy 2:2',
          },
          {
            type: 'bullets',
            content: 'The 3/3 Pattern:',
            items: [
              'LOOK BACK (1/3): How did you obey last week\'s application? Who did you share with?',
              'LOOK UP (1/3): Read Scripture together. What does it say? What does it mean? What will you obey?',
              'LOOK FORWARD (1/3): How will you obey this week? Who will you teach? Pray together.',
            ],
          },
          {
            type: 'activity',
            content: 'At your next meeting, use the 3/3 pattern. Spend equal time on each section. Focus on obedience and application, not just information.',
          },
        ],
      },
      {
        id: '1f1g-disciples-3',
        field: 'making-disciples',
        order: 3,
        title: 'Teaching Obedience',
        goal: 'Help someone apply Scripture to their life',
        scripture: ['John 14:15', 'James 1:22-25'],
        content: {
          concept: 'Jesus said, "If you love me, keep my commands." Real discipleship focuses on obedience, not just knowledge. We help people DO what Scripture says, not just learn about it.',
          practice: 'Help someone identify one area where God is calling them to obey. Walk with them through the process of obedience.',
          culturalBridge: 'Actions speak louder than words in Tibetan culture. Discipleship is not about accumulating religious knowledge, but about living out what Jesus taught.',
        },
        checklistItems: [
          'Read John 14:15 and James 1:22-25',
          'In your next meeting, ask: "What is God calling you to obey?"',
          'Help them make a specific, measurable obedience plan',
          'Follow up next week: "How did it go? What did you learn?"',
        ],
        sections: [
          {
            type: 'text',
            content: 'Jesus didn\'t command us to accumulate knowledge about Him. He commanded us to obey Him. Love is proven through obedience.',
          },
          {
            type: 'scripture',
            content: 'If you love me, keep my commands.',
            reference: 'John 14:15',
          },
          {
            type: 'scripture',
            content: 'Do not merely listen to the word, and so deceive yourselves. Do what it says.',
            reference: 'James 1:22',
          },
          {
            type: 'bullets',
            content: 'How to Teach Obedience:',
            items: [
              'Ask: "What is God saying to you in this passage?"',
              'Ask: "What will you do about it this week?"',
              'Help them make it specific: "I will ___ by ___ on ___"',
              'Follow up: "Did you do it? What happened? What did you learn?"',
              'Celebrate obedience, learn from failures',
            ],
          },
          {
            type: 'activity',
            content: 'This week, focus your discipleship meeting on one command from Scripture. Help your partner identify a specific way to obey it. Check in with them mid-week.',
          },
        ],
      },
    ],
  },

  // ============================================
  // FIELD 3: MULTIPLICATION - Your Disciple Makes a Disciple
  // ============================================
  {
    id: 'multiplication',
    name: 'Multiplication',
    nameTibetan: 'མང་དུ་འཕེལ་བ།',
    emoji: '🌱',
    color: '#8B2635', // Tibetan Maroon
    goal: 'Help your disciple make another disciple',
    estimatedWeeks: 12,
    completionCriteria: [
      'Studied all 3 lessons',
      'Your disciple is now mentoring someone',
      'You\'re coaching your disciple in mentoring',
      '3 generations visible (you → disciple → their disciple)',
    ],
    lessons: [
      {
        id: '1f1g-mult-1',
        field: 'multiplication',
        order: 1,
        title: 'The Multiplication Vision',
        goal: 'See your spiritual family tree',
        scripture: ['Acts 1:8', 'Luke 5:4-7'],
        content: {
          concept: 'A disciple who doesn\'t make disciples isn\'t really a disciple. The vision is not addition (you making many disciples) but multiplication (your disciples making disciples).',
          practice: 'Draw your spiritual family tree: who led you? who are you leading? who are they leading?',
          culturalBridge: 'Family lineage is deeply important in Tibetan culture. Your spiritual family tree matters just as much. You are part of a chain that goes back to Jesus and forward to future generations.',
        },
        checklistItems: [
          'Read Acts 1:8 and Luke 5:4-7',
          'Draw your spiritual family tree',
          'Identify where the multiplication chain is breaking',
          'Talk with your disciple about who they will disciple',
        ],
        sections: [
          {
            type: 'text',
            content: 'Jesus gave His disciples a vision that spanned the world: "You will be my witnesses in Jerusalem, and in all Judea and Samaria, and to the ends of the earth." This happens through multiplication.',
          },
          {
            type: 'scripture',
            content: 'But you will receive power when the Holy Spirit comes on you; and you will be my witnesses in Jerusalem, and in all Judea and Samaria, and to the ends of the earth.',
            reference: 'Acts 1:8',
          },
          {
            type: 'bullets',
            content: 'Multiplication Mindset:',
            items: [
              'You → Your Disciple → Their Disciple → Others (4 generations)',
              'Success is not how many you reach, but how many generations deep',
              'Empower others to do ministry, don\'t do it all yourself',
              'Celebrate when your disciples make disciples',
            ],
          },
          {
            type: 'activity',
            content: 'Draw your spiritual family tree on paper. Put yourself in the middle. Above you: who discipled you? Below you: who are you discipling? Below them: who are they discipling? Pray for each person by name.',
          },
        ],
      },
      {
        id: '1f1g-mult-2',
        field: 'multiplication',
        order: 2,
        title: 'Releasing Leaders',
        goal: 'Let go and trust God working through them',
        scripture: ['Acts 13:1-3', '2 Timothy 4:5'],
        content: {
          concept: 'The church in Antioch released their best leaders - Barnabas and Paul - to go start new work. Multiplication requires letting go. Trust that God will work through those you\'ve discipled.',
          practice: 'Commission your disciple to start mentoring someone new. Pray for them, bless them, release them.',
          culturalBridge: 'Like a butter lamp lighting another lamp, the first lamp loses nothing but multiplies light. When you release leaders, God\'s work multiplies.',
        },
        checklistItems: [
          'Read Acts 13:1-3',
          'Talk with your disciple: "Who do you feel called to invest in?"',
          'Help them identify and reach out to that person',
          'Commission them in prayer to begin mentoring',
        ],
        sections: [
          {
            type: 'text',
            content: 'Releasing leaders is hard. The Antioch church let their best people go. But this is how movements grow - not by accumulating, but by releasing.',
          },
          {
            type: 'scripture',
            content: 'While they were worshiping the Lord and fasting, the Holy Spirit said, "Set apart for me Barnabas and Saul for the work to which I have called them." So after they had fasted and prayed, they placed their hands on them and sent them off.',
            reference: 'Acts 13:2-3',
          },
          {
            type: 'bullets',
            content: 'How to Release:',
            items: [
              'Recognize the call of God on their life',
              'Commission them publicly (lay hands, pray)',
              'Release them with blessing, not control',
              'Stay connected as coach, not as supervisor',
              'Celebrate what God does through them',
            ],
          },
          {
            type: 'activity',
            content: 'Meet with your disciple. Ask them: "Who do you sense God calling you to invest in?" Help them identify that person. Then pray together, lay hands on them, and commission them to begin.',
          },
        ],
      },
      {
        id: '1f1g-mult-3',
        field: 'multiplication',
        order: 3,
        title: 'Movements Not Programs',
        goal: 'Celebrate 3 generations',
        scripture: ['Acts 19:10', 'Colossians 1:6'],
        content: {
          concept: 'In Acts 19, Paul stayed in Ephesus for 2 years. The result? "All the Jews and Greeks who lived in the province of Asia heard the word of the Lord." This happened through multiplication, not programs.',
          practice: 'When your "spiritual grandchild" makes a disciple, celebrate! Four generations means a movement has begun.',
          culturalBridge: 'Movements flow like mountain rivers - starting small but gathering strength. You don\'t control the river, you release it. God\'s Kingdom spreads the same way.',
        },
        checklistItems: [
          'Read Acts 19:10 and Colossians 1:6',
          'Meet with your disciple: how is their mentoring going?',
          'Offer coaching, not control',
          'When you see 3+ generations, celebrate and give thanks',
        ],
        sections: [
          {
            type: 'text',
            content: 'Paul stayed in one place, but the gospel spread everywhere. How? He trained people who trained people. Multiplication creates movements, not just ministries.',
          },
          {
            type: 'scripture',
            content: 'This went on for two years, so that all the Jews and Greeks who lived in the province of Asia heard the word of the Lord.',
            reference: 'Acts 19:10',
          },
          {
            type: 'scripture',
            content: 'In the same way, the gospel is bearing fruit and growing throughout the whole world—just as it has been doing among you since the day you heard it and truly understood God\'s grace.',
            reference: 'Colossians 1:6',
          },
          {
            type: 'bullets',
            content: 'Signs of a Movement:',
            items: [
              '3+ generations: You → them → theirs → others',
              'Rapid reproduction: new disciples quickly make disciples',
              'Local leadership: leaders from the harvest, not imported',
              'Simple patterns: reproducible by ordinary people',
              'God\'s power: beyond what human effort could produce',
            ],
          },
          {
            type: 'activity',
            content: 'Draw your updated spiritual family tree. How many generations do you see? Where is multiplication happening? Where is it stuck? Pray for each person and each generation by name.',
          },
        ],
      },
    ],
  },
];

// Helper Functions
export const getOneFieldGoalField = (id: OneFieldGoalFieldType): OneFieldGoalField | undefined => {
  return oneFieldOneGoalFields.find((field) => field.id === id);
};

export const getAllOneFieldGoalLessons = (): OneFieldGoalLesson[] => {
  return oneFieldOneGoalFields.flatMap((field) => field.lessons);
};

export const getTotalOneFieldGoalLessons = (): number => {
  return oneFieldOneGoalFields.reduce((sum, field) => sum + field.lessons.length, 0);
};

export const getOneFieldGoalLessonById = (lessonId: string): OneFieldGoalLesson | undefined => {
  return getAllOneFieldGoalLessons().find((lesson) => lesson.id === lessonId);
};
