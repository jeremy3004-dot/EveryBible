import { ExtendedLesson, FourFieldsCourse, FieldInfo, FieldType } from '../types/course';

export const FIELD_ORDER: FieldType[] = ['entry', 'gospel', 'discipleship', 'church', 'multiplication'];

// Field Information - Updated with Tibetan color palette
export const fieldInfo: Record<FieldType, FieldInfo> = {
  entry: {
    id: 'entry',
    title: 'Entry',
    subtitle: 'Empty Field',
    description: 'Finding people of peace and preparing hearts through prayer',
    icon: 'compass',
    color: '#4A90E2', // Sky Blue - exploration/seeking, clear Himalayan sky
    order: 1,
  },
  gospel: {
    id: 'gospel',
    title: 'Gospel',
    subtitle: 'Seeded Field',
    description: 'Sharing the good news in simple, reproducible ways',
    icon: 'heart',
    color: '#D4A017', // Saffron Gold - love/good news, sacred temple color
    order: 2,
  },
  discipleship: {
    id: 'discipleship',
    title: 'Discipleship',
    subtitle: 'Growing Field',
    description: 'The 7 Commands of Christ for new believers',
    icon: 'footsteps',
    color: '#8B2635', // Tibetan Maroon - growth/following, monastic discipline
    order: 3,
  },
  church: {
    id: 'church',
    title: 'Church',
    subtitle: 'Harvest Field',
    description: 'Gathering as simple church together',
    icon: 'people-circle',
    color: '#D4A017', // Saffron Gold - community/warmth, gathering together
    order: 4,
  },
  multiplication: {
    id: 'multiplication',
    title: 'Multiply',
    subtitle: 'Reproduce',
    description: 'Developing and sending leaders (2 Tim 2:2)',
    icon: 'layers',
    color: '#8B2635', // Tibetan Maroon - multiplication/depth, spiritual leadership
    order: 5,
  },
};

export const fourFieldsCourses: FourFieldsCourse[] = [
  // ============================================
  // FIELD 1: ENTRY - Finding Open Hearts
  // ============================================
  {
    id: 'entry-course',
    title: 'Finding Open Hearts',
    description: 'Learn to find people God has prepared to hear the gospel',
    field: 'entry',
    fieldOrder: 1,
    estimatedMinutes: 60,
    featured: false,
    keyVerse: {
      text: 'The harvest is plentiful but the workers are few. Ask the Lord of the harvest, therefore, to send out workers into his harvest field.',
      reference: 'Matthew 9:37-38',
    },
    practiceActivity: 'Prayer walk your neighborhood this week',
    lessons: [
      {
        id: 'entry-1',
        title: 'Prayer for the Harvest',
        content: '',
        order: 1,
        takeaway: 'The harvest starts with prayer. Ask God to show you who He is preparing.',
        keyVerse: {
          text: 'When he saw the crowds, he had compassion on them, because they were harassed and helpless, like sheep without a shepherd.',
          reference: 'Matthew 9:36',
        },
        practiceActivity: 'Prayer walk your neighborhood or workplace this week. Ask God to show you who needs Him.',
        discussionQuestions: [
          'Who around you seems spiritually searching or open?',
          'What prevents us from praying for the lost regularly?',
          'How can we develop compassion like Jesus had?',
        ],
        sections: [
          {
            type: 'text',
            content: 'Before we share the gospel, we must see people the way Jesus sees them. He looked at the crowds and felt deep compassion because they were like sheep without a shepherd.',
          },
          {
            type: 'scripture',
            content: 'When he saw the crowds, he had compassion on them, because they were harassed and helpless, like sheep without a shepherd. Then he said to his disciples, "The harvest is plentiful but the workers are few. Ask the Lord of the harvest, therefore, to send out workers into his harvest field."',
            reference: 'Matthew 9:36-38',
          },
          {
            type: 'text',
            content: 'Jesus commands us to pray for workers. But notice - He says this to the disciples who ARE the workers. When we pray for the harvest, we position ourselves to be sent into it.',
          },
          {
            type: 'bullets',
            content: 'How to pray for the harvest:',
            items: [
              'Pray for open eyes to see people as Jesus sees them',
              'Pray by name for 5 people who don\'t know Jesus',
              'Pray for opportunities to share',
              'Pray for boldness when opportunities come',
            ],
          },
          {
            type: 'discussion',
            content: 'Who are 5 people in your life who don\'t yet know Jesus? Take a moment to write their names and pray for them.',
          },
          {
            type: 'activity',
            content: 'This week, do a prayer walk. Walk through your neighborhood or around your workplace and pray for the people who live and work there. Ask God to prepare hearts and open doors.',
          },
          {
            type: 'prayer',
            content: 'Lord of the harvest, give me Your eyes to see people who are hurting and lost. Prepare hearts around me to receive the good news. Send me to those You have prepared. Amen.',
          },
        ],
      },
      {
        id: 'entry-2',
        title: 'Your Oikos Map',
        content: '',
        order: 2,
        takeaway: 'God has already placed you among people who need Him. Start with your oikos.',
        keyVerse: {
          text: 'Andrew, Simon Peter\'s brother, was one of the two who heard what John had said and who had followed Jesus. The first thing Andrew did was to find his brother Simon.',
          reference: 'John 1:40-41',
        },
        practiceActivity: 'Create your oikos map with at least 5 non-believers and begin praying for them daily.',
        discussionQuestions: [
          'Who was the first person Andrew told about Jesus?',
          'Why do you think God placed you where you live and work?',
          'Which of your oikos relationships is most open to spiritual conversations?',
        ],
        sections: [
          {
            type: 'text',
            content: '"Oikos" is the Greek word for household. In the New Testament, it includes everyone in your sphere of influence - family, friends, neighbors, coworkers, and acquaintances.',
          },
          {
            type: 'scripture',
            content: 'Andrew, Simon Peter\'s brother, was one of the two who heard what John had said and who had followed Jesus. The first thing Andrew did was to find his brother Simon and tell him, "We have found the Messiah."',
            reference: 'John 1:40-41',
          },
          {
            type: 'text',
            content: 'The first thing Andrew did was go to someone he already knew - his brother. The gospel often spreads fastest through existing relationships. God has strategically placed you among people who need Him.',
          },
          {
            type: 'bullets',
            content: 'Your oikos includes:',
            items: [
              'Family members (immediate and extended)',
              'Friends and social connections',
              'Neighbors',
              'Coworkers and business contacts',
              'Regular acquaintances (gym, coffee shop, etc.)',
            ],
          },
          {
            type: 'activity',
            content: 'Create your Oikos Map: Draw a circle with your name in the center. Around it, write the names of at least 5 people who don\'t know Jesus. These are your mission field.',
          },
          {
            type: 'discussion',
            content: 'Look at your oikos map. Who seems most open to spiritual conversations? Who might God be preparing?',
          },
          {
            type: 'prayer',
            content: 'Father, thank You for placing me where I am. Open my eyes to see my oikos as my mission field. Give me courage to share with those closest to me. Amen.',
          },
        ],
      },
      {
        id: 'entry-3',
        title: 'Finding People of Peace',
        content: '',
        order: 3,
        takeaway: 'Look for open doors, not locked ones. A person of peace welcomes you and your message.',
        keyVerse: {
          text: 'When you enter a house, first say, "Peace to this house." If someone who promotes peace is there, your peace will rest on them.',
          reference: 'Luke 10:5-6',
        },
        practiceActivity: 'Identify one person of peace in your life and initiate a spiritual conversation with them.',
        discussionQuestions: [
          'Why did Jesus say to move on if people weren\'t receptive?',
          'What are signs that someone might be a person of peace?',
          'How is this different from how we often think about evangelism?',
        ],
        sections: [
          {
            type: 'text',
            content: 'Jesus gave specific instructions when He sent out disciples: look for people who are receptive. Don\'t waste time arguing with resistant people when others are waiting to hear.',
          },
          {
            type: 'scripture',
            content: 'When you enter a house, first say, "Peace to this house." If someone who promotes peace is there, your peace will rest on them; if not, it will return to you. Stay there, eating and drinking whatever they give you... But when you enter a town and are not welcomed, go into its streets and say, "Even the dust of your town we wipe from our feet."',
            reference: 'Luke 10:5-7, 10-11',
          },
          {
            type: 'text',
            content: 'A "person of peace" is someone God has prepared to receive you and your message. They are open, welcoming, and often influential in their community. Your job is to find them, not to force open locked doors.',
          },
          {
            type: 'bullets',
            content: 'Signs of a person of peace:',
            items: [
              'They welcome you and make time for you',
              'They ask questions about spiritual things',
              'They are going through life changes (new job, baby, loss, etc.)',
              'They seem hungry for meaning or purpose',
              'They have influence with others who might also listen',
            ],
          },
          {
            type: 'discussion',
            content: 'Think about people in your oikos. Who has been open to talking about deeper things? Who is going through transitions?',
          },
          {
            type: 'activity',
            content: 'Identify one potential person of peace in your life. Plan to have coffee or a meal with them this week. Ask questions about their life and be ready to share yours.',
          },
          {
            type: 'prayer',
            content: 'Lord, lead me to the people of peace You have prepared. Help me recognize open doors and not waste energy on locked ones. Amen.',
          },
        ],
      },
      {
        id: 'entry-4',
        title: 'Your Story Matters',
        content: '',
        order: 4,
        takeaway: 'Your personal testimony is your most powerful and unquestionable tool.',
        keyVerse: {
          text: 'They triumphed over him by the blood of the Lamb and by the word of their testimony.',
          reference: 'Revelation 12:11',
        },
        practiceActivity: 'Write out your 3-minute testimony using the before/how/after format and practice sharing it.',
        discussionQuestions: [
          'What made Paul\'s testimony effective?',
          'Why can no one argue with your personal story?',
          'What parts of your story might connect with others?',
        ],
        sections: [
          {
            type: 'text',
            content: 'No one can argue with your personal experience. When you share your story of how you met Jesus, you give others hope that they can experience the same transformation.',
          },
          {
            type: 'scripture',
            content: 'Then Paul said: "I am a Jew, born in Tarsus of Cilicia... I persecuted the followers of this Way to their death... About noon as I came near Damascus, suddenly a bright light from heaven flashed around me..."',
            reference: 'Acts 26:4-18 (summary)',
          },
          {
            type: 'text',
            content: 'Paul shared his testimony whenever he had opportunity. His story followed a simple pattern: what his life was like before Jesus, how he encountered Jesus, and what changed after.',
          },
          {
            type: 'bullets',
            content: 'The 3-Minute Testimony Format:',
            items: [
              'BEFORE: What was your life like before Jesus? What were you searching for?',
              'HOW: How did you come to know Jesus? What happened?',
              'AFTER: How has your life changed since then? What difference has He made?',
            ],
          },
          {
            type: 'text',
            content: 'Keep it focused on Jesus, not on how bad your sin was. The point is not your story but how Jesus entered your story.',
          },
          {
            type: 'activity',
            content: 'Write out your testimony using the before/how/after format. Keep it to 3 minutes. Practice sharing it out loud until it feels natural.',
          },
          {
            type: 'discussion',
            content: 'Share your testimony with someone in your group. Get feedback on what was compelling and clear.',
          },
          {
            type: 'prayer',
            content: 'Thank You, Lord, for my story. Help me share it boldly and clearly. Use my testimony to draw others to You. Amen.',
          },
        ],
      },
    ],
  },

  // ============================================
  // FIELD 2: GOSPEL - Sharing Good News
  // ============================================
  {
    id: 'gospel-course',
    title: 'Sharing Good News',
    description: 'Learn to share the gospel simply and invite response',
    field: 'gospel',
    fieldOrder: 2,
    estimatedMinutes: 75,
    featured: false,
    keyVerse: {
      text: 'For I am not ashamed of the gospel, because it is the power of God that brings salvation to everyone who believes.',
      reference: 'Romans 1:16',
    },
    practiceActivity: 'Share the gospel with at least one person this week',
    lessons: [
      {
        id: 'gospel-1',
        title: 'The Simple Gospel',
        content: '',
        order: 1,
        takeaway: 'The gospel is simple: Creation, Fall, Rescue, Response.',
        keyVerse: {
          text: 'For what I received I passed on to you as of first importance: that Christ died for our sins according to the Scriptures, that he was buried, that he was raised on the third day.',
          reference: '1 Corinthians 15:3-4',
        },
        practiceActivity: 'Explain the gospel to another believer using the Creation-Fall-Rescue-Response framework.',
        discussionQuestions: [
          'Why do we sometimes make the gospel more complicated than it needs to be?',
          'Which part of this framework is hardest for you to explain?',
          'How would you explain "response" to someone?',
        ],
        sections: [
          {
            type: 'text',
            content: 'The gospel is the most important message in the universe, yet it is simple enough for anyone to understand and share. Paul summarized it in just a few sentences.',
          },
          {
            type: 'scripture',
            content: 'For what I received I passed on to you as of first importance: that Christ died for our sins according to the Scriptures, that he was buried, that he was raised on the third day according to the Scriptures.',
            reference: '1 Corinthians 15:3-4',
          },
          {
            type: 'text',
            content: 'A helpful framework to share the gospel is: Creation → Fall → Rescue → Response.',
          },
          {
            type: 'bullets',
            content: 'The Gospel in Four Parts:',
            items: [
              'CREATION: God made us to be in relationship with Him. We were designed for connection with our Creator.',
              'FALL: We all rebelled against God through sin. This broke our relationship and separated us from Him.',
              'RESCUE: Jesus died on the cross to pay for our sins and rose again. He made a way back to God.',
              'RESPONSE: We must respond by repenting (turning from sin) and believing (trusting in Jesus alone).',
            ],
          },
          {
            type: 'discussion',
            content: 'Practice explaining each of these four parts in your own words. Which part is hardest to explain?',
          },
          {
            type: 'activity',
            content: 'This week, practice sharing this simple gospel framework with another believer. Get comfortable with it before sharing with non-believers.',
          },
          {
            type: 'prayer',
            content: 'Lord, help me to clearly and simply share the good news about Jesus. Remove fear and give me boldness. Amen.',
          },
        ],
      },
      {
        id: 'gospel-2',
        title: 'Three Circles',
        content: '',
        order: 2,
        takeaway: 'A simple diagram helps people understand and remember the gospel.',
        keyVerse: {
          text: 'For all have sinned and fall short of the glory of God.',
          reference: 'Romans 3:23',
        },
        practiceActivity: 'Draw the Three Circles and explain it to someone.',
        discussionQuestions: [
          'Why do visual tools help in sharing the gospel?',
          'How does this relate to what people experience in real life?',
          'Where would you draw the Three Circles with someone?',
        ],
        sections: [
          {
            type: 'text',
            content: 'The Three Circles is a simple visual tool that helps explain the gospel. You can draw it on a napkin, in the dirt, or on a piece of paper anywhere.',
          },
          {
            type: 'scripture',
            content: 'For all have sinned and fall short of the glory of God... For the wages of sin is death, but the gift of God is eternal life in Christ Jesus our Lord.',
            reference: 'Romans 3:23, 6:23',
          },
          {
            type: 'bullets',
            content: 'The Three Circles Explained:',
            items: [
              'Circle 1 - GOD\'S DESIGN: Draw a circle and write "God\'s Design." God created us for a purpose - to know Him and live in His design.',
              'Arrow out - BROKENNESS: Draw an arrow leaving the circle. We rebelled and left God\'s design. This leads to brokenness.',
              'Circle 2 - BROKENNESS: Draw a second circle. Write common struggles: addiction, anxiety, broken relationships, emptiness.',
              'Our attempts: Draw arrows going around the brokenness circle. We try to fix ourselves but keep cycling back.',
              'Circle 3 - GOSPEL: Draw a third circle. Jesus died and rose again. He is the only way out of brokenness.',
              'Arrow back: From brokenness, through the gospel, back to God\'s design. REPENT and BELIEVE.',
            ],
          },
          {
            type: 'activity',
            content: 'Practice drawing the Three Circles right now. Draw it at least 3 times until you can do it smoothly while explaining each part.',
          },
          {
            type: 'discussion',
            content: 'Where in everyday life might you have opportunity to draw this for someone? Coffee shop? At work?',
          },
          {
            type: 'prayer',
            content: 'Father, help me remember this simple tool. Bring people across my path who need to see and hear this. Amen.',
          },
        ],
      },
      {
        id: 'gospel-3',
        title: 'Answering Questions',
        content: '',
        order: 3,
        takeaway: 'Listen first, answer second. Always be prepared with gentleness and respect.',
        keyVerse: {
          text: 'Always be prepared to give an answer to everyone who asks you to give the reason for the hope that you have. But do this with gentleness and respect.',
          reference: '1 Peter 3:15',
        },
        practiceActivity: 'Prepare answers to 2-3 common questions people ask about faith.',
        discussionQuestions: [
          'What questions have people asked you about your faith?',
          'Why does Peter emphasize gentleness and respect?',
          'Is it okay to say "I don\'t know" to a question?',
        ],
        sections: [
          {
            type: 'text',
            content: 'When we share the gospel, people will have questions. That\'s good! Questions show they\'re thinking. Peter tells us to be prepared, but also to answer with gentleness and respect.',
          },
          {
            type: 'scripture',
            content: 'But in your hearts revere Christ as Lord. Always be prepared to give an answer to everyone who asks you to give the reason for the hope that you have. But do this with gentleness and respect.',
            reference: '1 Peter 3:15',
          },
          {
            type: 'text',
            content: 'The key is to listen first. Often people\'s real question is beneath the surface question. Ask clarifying questions before you answer.',
          },
          {
            type: 'bullets',
            content: 'Common Questions and Starting Points:',
            items: [
              '"Why do bad things happen?" - God gave us free will; He is working to restore what sin broke.',
              '"How do you know God exists?" - Creation points to a Creator; share your personal experience.',
              '"What about other religions?" - Jesus is unique - He claimed to be God and rose from death.',
              '"Isn\'t the Bible unreliable?" - More manuscript evidence than any ancient text; eyewitness accounts.',
              '"I\'ve been hurt by the church" - Listen with empathy; acknowledge hurt; distinguish Jesus from His followers.',
            ],
          },
          {
            type: 'text',
            content: 'It\'s okay to say "I don\'t know, but I\'ll find out." Honesty builds trust more than pretending to have all the answers.',
          },
          {
            type: 'activity',
            content: 'Write down 2-3 questions you\'ve been asked or expect to be asked. Prepare brief, honest answers for each.',
          },
          {
            type: 'prayer',
            content: 'Lord, give me wisdom when I face hard questions. Help me listen well and respond with gentleness. Amen.',
          },
        ],
      },
      {
        id: 'gospel-4',
        title: 'Inviting a Response',
        content: '',
        order: 4,
        takeaway: 'Always invite, never pressure. The Spirit draws hearts.',
        keyVerse: {
          text: 'When the people heard this, they were cut to the heart and said to Peter and the other apostles, "Brothers, what shall we do?"',
          reference: 'Acts 2:37',
        },
        practiceActivity: 'Role-play inviting someone to respond to the gospel.',
        discussionQuestions: [
          'What happened after Peter preached that people asked "What shall we do?"',
          'What\'s the difference between inviting and pressuring?',
          'How do you respond if someone says "not yet"?',
        ],
        sections: [
          {
            type: 'text',
            content: 'After sharing the gospel, we must invite a response. We don\'t manipulate or pressure - that\'s the Spirit\'s job to convict. But we do clearly invite people to respond.',
          },
          {
            type: 'scripture',
            content: 'When the people heard this, they were cut to the heart and said to Peter and the other apostles, "Brothers, what shall we do?" Peter replied, "Repent and be baptized, every one of you, in the name of Jesus Christ for the forgiveness of your sins."',
            reference: 'Acts 2:37-38',
          },
          {
            type: 'text',
            content: 'Notice that the people asked what to do. Peter\'s message created a response. When we clearly share the gospel, the Holy Spirit works in hearts.',
          },
          {
            type: 'bullets',
            content: 'Ways to Invite Response:',
            items: [
              '"Does this make sense to you? Do you have questions?"',
              '"Is there anything holding you back from trusting Jesus?"',
              '"Would you like to receive God\'s gift of forgiveness right now?"',
              '"Can I pray with you to begin a relationship with Jesus?"',
            ],
          },
          {
            type: 'text',
            content: 'If someone says no or "not yet," respond with grace: "I understand. I\'m always here if you want to talk more." Keep the door open.',
          },
          {
            type: 'activity',
            content: 'Practice inviting a response with a partner. Role-play finishing a gospel presentation and inviting them to respond.',
          },
          {
            type: 'prayer',
            content: 'Holy Spirit, prepare hearts to hear and respond. Give me courage to invite response and grace to accept whatever their answer is. Amen.',
          },
        ],
      },
      {
        id: 'gospel-5',
        title: 'Immediate Baptism',
        content: '',
        order: 5,
        takeaway: 'Baptism is the first act of obedience. Don\'t delay it.',
        keyVerse: {
          text: 'As they traveled along the road, they came to some water and the eunuch said, "Look, here is water. What can stand in the way of my being baptized?"',
          reference: 'Acts 8:36',
        },
        practiceActivity: 'If you\'ve led someone to faith, discuss baptism with them. If not, be ready for when you do.',
        discussionQuestions: [
          'How soon after believing were people baptized in Acts?',
          'What does baptism symbolize?',
          'What stands in the way of immediate baptism today?',
        ],
        sections: [
          {
            type: 'text',
            content: 'In the New Testament, baptism happened immediately after belief - sometimes within minutes or hours. It was not delayed for classes, membership, or special occasions.',
          },
          {
            type: 'scripture',
            content: 'As they traveled along the road, they came to some water and the eunuch said, "Look, here is water. What can stand in the way of my being baptized?" And he gave orders to stop the chariot. Then both Philip and the eunuch went down into the water and Philip baptized him.',
            reference: 'Acts 8:36-38',
          },
          {
            type: 'text',
            content: 'The Ethiopian eunuch was baptized on the road, the Philippian jailer was baptized at midnight, and 3,000 were baptized on the day of Pentecost. Obedience starts immediately.',
          },
          {
            type: 'bullets',
            content: 'What Baptism Is:',
            items: [
              'A public declaration of faith in Jesus',
              'Identification with Christ\'s death, burial, and resurrection',
              'The first act of obedience for a new believer',
              'A symbol, not the source, of salvation',
              'Something any believer can do for another believer',
            ],
          },
          {
            type: 'discussion',
            content: 'What obstacles do we sometimes put in the way of immediate baptism? Are they biblical?',
          },
          {
            type: 'activity',
            content: 'If you know a new believer who hasn\'t been baptized, talk with them about it this week. Be prepared to baptize them in a pool, lake, bathtub - whatever is available.',
          },
          {
            type: 'prayer',
            content: 'Lord, help me understand that obedience starts immediately. Remove unbiblical barriers to baptism and discipleship. Amen.',
          },
        ],
      },
    ],
  },

  // ============================================
  // FIELD 3: DISCIPLESHIP - The 7 Commands
  // ============================================
  {
    id: 'discipleship-course',
    title: 'The 7 Commands of Christ',
    description: 'Foundations for new believers based on obedience to Jesus',
    field: 'discipleship',
    fieldOrder: 3,
    estimatedMinutes: 105,
    featured: true,
    keyVerse: {
      text: 'Teaching them to obey everything I have commanded you.',
      reference: 'Matthew 28:20',
    },
    practiceActivity: 'Obey one command this week and teach it to someone else',
    lessons: [
      {
        id: 'disc-1',
        title: 'Repent & Believe',
        content: '',
        order: 1,
        takeaway: 'Following Jesus begins with daily turning from sin and trusting in Him.',
        keyVerse: {
          text: 'The time has come. The kingdom of God has come near. Repent and believe the good news!',
          reference: 'Mark 1:15',
        },
        practiceActivity: 'Identify one area where you need to repent. Turn from it and trust Jesus with it.',
        discussionQuestions: [
          'What is the difference between feeling sorry and truly repenting?',
          'Why must repentance and belief go together?',
          'How do we practice this daily, not just once?',
        ],
        sections: [
          {
            type: 'text',
            content: 'Jesus\' first command was "Repent and believe." This is not just how we begin our faith - it\'s how we continue to live. We daily turn from sin and trust in Jesus.',
          },
          {
            type: 'scripture',
            content: 'The time has come. The kingdom of God has come near. Repent and believe the good news!',
            reference: 'Mark 1:15',
          },
          {
            type: 'bullets',
            content: 'What Repentance Means:',
            items: [
              'A change of mind that leads to a change of direction',
              'Not just feeling sorry, but actually turning away from sin',
              'Agreeing with God about what is wrong',
              'Choosing to go God\'s way instead of our own',
            ],
          },
          {
            type: 'bullets',
            content: 'What Belief Means:',
            items: [
              'Not just mental agreement but active trust',
              'Putting our full weight on Jesus',
              'Trusting that His death paid for our sins',
              'Relying on His power, not our own effort',
            ],
          },
          {
            type: 'discussion',
            content: 'What area of your life do you find hardest to turn over to Jesus? What would it look like to repent in that area?',
          },
          {
            type: 'activity',
            content: 'Identify one specific sin or struggle you need to repent of. Confess it to God and to a trusted believer. Make a plan for what to do differently.',
          },
          {
            type: 'prayer',
            content: 'Lord Jesus, I turn from my sin and turn to You. I believe You are who You say You are. Help my unbelief. I trust You. Amen.',
          },
        ],
      },
      {
        id: 'disc-2',
        title: 'Be Baptized',
        content: '',
        order: 2,
        takeaway: 'Baptism is your public declaration: "I belong to Jesus now."',
        keyVerse: {
          text: 'He commanded them to be baptized in the name of Jesus Christ.',
          reference: 'Acts 10:48',
        },
        practiceActivity: 'If you haven\'t been baptized as a believer, make a plan to be baptized this week.',
        discussionQuestions: [
          'Why did Jesus command baptism?',
          'What does going under the water represent?',
          'What does coming up out of the water represent?',
        ],
        sections: [
          {
            type: 'text',
            content: 'Baptism is not optional for believers - it is a command. Jesus Himself was baptized to show us the way. Baptism is how we publicly identify with Jesus\' death and resurrection.',
          },
          {
            type: 'scripture',
            content: 'Then he ordered them to be baptized in the name of Jesus Christ.',
            reference: 'Acts 10:48',
          },
          {
            type: 'scripture',
            content: 'Or don\'t you know that all of us who were baptized into Christ Jesus were baptized into his death? We were therefore buried with him through baptism into death in order that, just as Christ was raised from the dead through the glory of the Father, we too may live a new life.',
            reference: 'Romans 6:3-4',
          },
          {
            type: 'bullets',
            content: 'What Baptism Pictures:',
            items: [
              'Going under water = dying with Christ to our old life',
              'Coming up = rising with Christ to new life',
              'Public declaration = "I am His and He is mine"',
              'First act of obedience = shows we mean to follow Jesus',
            ],
          },
          {
            type: 'text',
            content: 'Any believer can baptize another believer. You don\'t need a special building or ordained minister. The early church baptized in rivers, pools, and homes.',
          },
          {
            type: 'activity',
            content: 'Have you been baptized as a believer? If not, talk to someone about being baptized this week. If you have, be ready to baptize others.',
          },
          {
            type: 'prayer',
            content: 'Lord, I want to publicly identify with You. Give me courage to follow You in baptism and in all things. Amen.',
          },
        ],
      },
      {
        id: 'disc-3',
        title: 'Pray',
        content: '',
        order: 3,
        takeaway: 'Prayer is conversation with your Father, not performance for an audience.',
        keyVerse: {
          text: 'But when you pray, go into your room, close the door and pray to your Father, who is unseen. Then your Father, who sees what is done in secret, will reward you.',
          reference: 'Matthew 6:6',
        },
        practiceActivity: 'Pray through the Lord\'s Prayer pattern each day this week.',
        discussionQuestions: [
          'Why does Jesus tell us to pray in secret?',
          'What does it mean that God is our "Father"?',
          'Which part of the Lord\'s Prayer is hardest for you?',
        ],
        sections: [
          {
            type: 'text',
            content: 'Prayer is simply talking with God. It\'s not about using the right words or praying long enough. Jesus taught us to pray to our Father who loves us and wants to hear from us.',
          },
          {
            type: 'scripture',
            content: 'But when you pray, go into your room, close the door and pray to your Father, who is unseen. Then your Father, who sees what is done in secret, will reward you.',
            reference: 'Matthew 6:6',
          },
          {
            type: 'text',
            content: 'Jesus gave us a pattern for prayer, often called "The Lord\'s Prayer." It\'s not just words to repeat, but a model to follow.',
          },
          {
            type: 'scripture',
            content: 'Our Father in heaven, hallowed be your name, your kingdom come, your will be done, on earth as it is in heaven. Give us today our daily bread. And forgive us our debts, as we also have forgiven our debtors. And lead us not into temptation, but deliver us from the evil one.',
            reference: 'Matthew 6:9-13',
          },
          {
            type: 'bullets',
            content: 'The Lord\'s Prayer Pattern:',
            items: [
              '"Our Father" - Come to God as your loving Father',
              '"Hallowed be your name" - Worship and praise Him',
              '"Your kingdom come" - Pray for His will, not just your wants',
              '"Give us daily bread" - Ask for your needs',
              '"Forgive us...as we forgive" - Confess sin, extend forgiveness',
              '"Lead us not into temptation" - Ask for protection and guidance',
            ],
          },
          {
            type: 'activity',
            content: 'Use the Lord\'s Prayer as a guide this week. Spend time on each phrase, making it personal. Pray it with your own words.',
          },
          {
            type: 'prayer',
            content: 'Father, teach me to pray. Help me see You as my loving Father who wants to hear from me. I want to talk with You, not perform for You. Amen.',
          },
        ],
      },
      {
        id: 'disc-4',
        title: 'Love One Another',
        content: '',
        order: 4,
        takeaway: 'The world knows we are His disciples by how we love one another.',
        keyVerse: {
          text: 'A new command I give you: Love one another. As I have loved you, so you must love one another. By this everyone will know that you are my disciples, if you love one another.',
          reference: 'John 13:34-35',
        },
        practiceActivity: 'Do one specific, sacrificial act of love for another believer this week.',
        discussionQuestions: [
          'How did Jesus love His disciples?',
          'What makes Christian love different from the world\'s love?',
          'Who is hardest for you to love? How can you show them love?',
        ],
        sections: [
          {
            type: 'text',
            content: 'Jesus gave a "new command" - love one another AS HE LOVED US. This is different from natural human love. His love is sacrificial, unconditional, and serves even when it costs.',
          },
          {
            type: 'scripture',
            content: 'A new command I give you: Love one another. As I have loved you, so you must love one another. By this everyone will know that you are my disciples, if you love one another.',
            reference: 'John 13:34-35',
          },
          {
            type: 'text',
            content: 'Jesus spoke these words right after washing His disciples\' feet - including Judas, who would betray Him. His love is not based on whether people deserve it.',
          },
          {
            type: 'bullets',
            content: 'How Jesus Loved:',
            items: [
              'He served even the lowest tasks (washing feet)',
              'He loved those who would betray and deny Him',
              'He gave up His own comfort for others',
              'He laid down His life for us',
            ],
          },
          {
            type: 'bullets',
            content: 'Practical Ways to Love:',
            items: [
              'Give your time and attention',
              'Serve without expecting anything in return',
              'Forgive quickly and completely',
              'Speak encouragement and truth',
              'Share what you have',
              'Be present in hard times',
            ],
          },
          {
            type: 'activity',
            content: 'Choose one specific person this week. Do something sacrificial for them - give time, money, or service that costs you something.',
          },
          {
            type: 'prayer',
            content: 'Lord, Your love is so different from mine. Fill me with Your love for others. Help me love like You do. Amen.',
          },
        ],
      },
      {
        id: 'disc-5',
        title: 'Break Bread Together',
        content: '',
        order: 5,
        takeaway: 'When we share the Lord\'s Supper, we remember what He did and proclaim it until He returns.',
        keyVerse: {
          text: 'And he took bread, gave thanks and broke it, and gave it to them, saying, "This is my body given for you; do this in remembrance of me."',
          reference: 'Luke 22:19',
        },
        practiceActivity: 'Share communion with your family or small group this week.',
        discussionQuestions: [
          'Why did Jesus tell us to "do this in remembrance"?',
          'What are we remembering when we take communion?',
          'Can you share communion outside of a church building?',
        ],
        sections: [
          {
            type: 'text',
            content: 'The Lord\'s Supper is not just a ritual - it\'s a remembrance. Every time we share bread and cup together, we remember Jesus\' death and proclaim it until He returns.',
          },
          {
            type: 'scripture',
            content: 'And he took bread, gave thanks and broke it, and gave it to them, saying, "This is my body given for you; do this in remembrance of me." In the same way, after the supper he took the cup, saying, "This cup is the new covenant in my blood, which is poured out for you."',
            reference: 'Luke 22:19-20',
          },
          {
            type: 'text',
            content: 'The early church broke bread together in homes, not just in temple gatherings. This can be done anywhere believers gather.',
          },
          {
            type: 'bullets',
            content: 'What Communion Represents:',
            items: [
              'The bread = Jesus\' body broken for us',
              'The cup = Jesus\' blood poured out for forgiveness',
              'Eating together = we are one body, united in Him',
              'Remembrance = we look back at what He did',
              'Proclamation = we look forward until He comes',
            ],
          },
          {
            type: 'scripture',
            content: 'For whenever you eat this bread and drink this cup, you proclaim the Lord\'s death until he comes.',
            reference: '1 Corinthians 11:26',
          },
          {
            type: 'activity',
            content: 'This week, share communion with your family, roommates, or small group. Use whatever bread and drink you have. Read the Scripture, pray, and remember Him together.',
          },
          {
            type: 'prayer',
            content: 'Lord Jesus, thank You for Your body broken and blood poured out for me. Help me never forget what You did. Amen.',
          },
        ],
      },
      {
        id: 'disc-6',
        title: 'Give Generously',
        content: '',
        order: 6,
        takeaway: 'Everything we have is God\'s. Generosity reflects His heart.',
        keyVerse: {
          text: 'Give, and it will be given to you. A good measure, pressed down, shaken together and running over, will be poured into your lap.',
          reference: 'Luke 6:38',
        },
        practiceActivity: 'Give something sacrificially this week - time, money, or possessions.',
        discussionQuestions: [
          'Why is giving often difficult?',
          'What does generous giving say about what we believe about God?',
          'How can we give when we feel like we don\'t have enough?',
        ],
        sections: [
          {
            type: 'text',
            content: 'Jesus talked about money more than almost any other topic. Why? Because where our treasure is, there our heart is also. Generosity reveals what we truly believe about God.',
          },
          {
            type: 'scripture',
            content: 'Give, and it will be given to you. A good measure, pressed down, shaken together and running over, will be poured into your lap. For with the measure you use, it will be measured to you.',
            reference: 'Luke 6:38',
          },
          {
            type: 'text',
            content: 'Generosity is not about how much we have, but about trusting that God will provide. The widow\'s two coins were worth more than the rich man\'s large offering.',
          },
          {
            type: 'bullets',
            content: 'Principles of Generous Giving:',
            items: [
              'Everything belongs to God - we are stewards',
              'Give first, not from what\'s left over',
              'Give proportionally as God has blessed',
              'Give cheerfully, not under compulsion',
              'Give expecting God to provide, not people to repay',
            ],
          },
          {
            type: 'scripture',
            content: 'Each of you should give what you have decided in your heart to give, not reluctantly or under compulsion, for God loves a cheerful giver.',
            reference: '2 Corinthians 9:7',
          },
          {
            type: 'activity',
            content: 'This week, give something that costs you something. It could be money to someone in need, time to serve, or possessions you\'ve been holding onto.',
          },
          {
            type: 'prayer',
            content: 'Father, everything I have is Yours. Help me hold it loosely and give it freely. Make me generous like You. Amen.',
          },
        ],
      },
      {
        id: 'disc-7',
        title: 'Make Disciples',
        content: '',
        order: 7,
        takeaway: 'You teach what you\'re learning. Disciple-making starts now.',
        keyVerse: {
          text: 'Therefore go and make disciples of all nations, baptizing them in the name of the Father and of the Son and of the Holy Spirit, and teaching them to obey everything I have commanded you.',
          reference: 'Matthew 28:19-20',
        },
        practiceActivity: 'Share one thing you\'ve learned from this course with someone else this week.',
        discussionQuestions: [
          'Who discipled you? How did they do it?',
          'Why does Jesus command ALL believers to make disciples?',
          'Who could you begin to disciple?',
        ],
        sections: [
          {
            type: 'text',
            content: 'Jesus\' final command was to make disciples. Not just converts. Not just church attenders. Disciples who obey everything He commanded. This is every believer\'s job.',
          },
          {
            type: 'scripture',
            content: 'Therefore go and make disciples of all nations, baptizing them in the name of the Father and of the Son and of the Holy Spirit, and teaching them to obey everything I have commanded you. And surely I am with you always, to the very end of the age.',
            reference: 'Matthew 28:19-20',
          },
          {
            type: 'text',
            content: 'You don\'t need to be a mature believer to disciple others. You simply need to be one step ahead. Teach what you\'re learning as you learn it.',
          },
          {
            type: 'bullets',
            content: 'What Making Disciples Looks Like:',
            items: [
              'Share what Jesus is teaching you',
              'Walk with someone through these lessons',
              'Model the Christian life, not just teach about it',
              'Hold each other accountable to obey',
              'Send them out to teach others',
            ],
          },
          {
            type: 'text',
            content: 'The goal is not to accumulate knowledge but to multiply obedience. When you learn something, immediately look for someone to teach it to.',
          },
          {
            type: 'activity',
            content: 'Identify one person you can begin to disciple. Set up a time to meet with them. Start by sharing what you\'ve learned in this course.',
          },
          {
            type: 'prayer',
            content: 'Lord, You commanded me to make disciples. Show me who You want me to invest in. Give me courage to start. Amen.',
          },
        ],
      },
    ],
  },

  // ============================================
  // FIELD 4: CHURCH - Gathering Together
  // ============================================
  {
    id: 'church-course',
    title: 'Gathering as Church',
    description: 'Learn what simple church looks like and how to gather',
    field: 'church',
    fieldOrder: 4,
    estimatedMinutes: 60,
    featured: false,
    keyVerse: {
      text: 'For where two or three gather in my name, there am I with them.',
      reference: 'Matthew 18:20',
    },
    practiceActivity: 'Facilitate or participate in a simple church gathering',
    lessons: [
      {
        id: 'church-1',
        title: 'What is Church?',
        content: '',
        order: 1,
        takeaway: 'Church is not a building or program - it\'s believers gathered in Jesus\' name.',
        keyVerse: {
          text: 'For where two or three gather in my name, there am I with them.',
          reference: 'Matthew 18:20',
        },
        practiceActivity: 'Read Acts 2:42-47 with your group and discuss what you observe about the early church.',
        discussionQuestions: [
          'What comes to mind when you hear the word "church"?',
          'What did the early church do when they met?',
          'What\'s the minimum requirement for "church"?',
        ],
        sections: [
          {
            type: 'text',
            content: 'The word "church" (ekklesia) simply means "called-out assembly." It\'s people, not a place. The early church met in homes and public spaces before church buildings existed.',
          },
          {
            type: 'scripture',
            content: 'For where two or three gather in my name, there am I with them.',
            reference: 'Matthew 18:20',
          },
          {
            type: 'scripture',
            content: 'They devoted themselves to the apostles\' teaching and to fellowship, to the breaking of bread and to prayer. Everyone was filled with awe at the many wonders and signs performed by the apostles. All the believers were together and had everything in common.',
            reference: 'Acts 2:42-44',
          },
          {
            type: 'bullets',
            content: 'What the Early Church Did:',
            items: [
              'Devoted to apostles\' teaching (Scripture)',
              'Fellowship (deep community)',
              'Breaking of bread (meals + communion)',
              'Prayer together',
              'Sharing with those in need',
              'Meeting in homes and the temple courts',
            ],
          },
          {
            type: 'text',
            content: 'You don\'t need a building, professional pastor, or formal program to be the church. When believers gather around Jesus and His Word, that IS church.',
          },
          {
            type: 'activity',
            content: 'Read Acts 2:42-47 together. Make a list of everything the early church did. How many of these can your small group do?',
          },
          {
            type: 'prayer',
            content: 'Lord, help us be the church, not just attend church. Show us what it means to gather in Your name. Amen.',
          },
        ],
      },
      {
        id: 'church-2',
        title: 'Simple Gathering Elements',
        content: '',
        order: 2,
        takeaway: 'Worship, Word, and One-Another are the essential elements of gathering.',
        keyVerse: {
          text: 'Let the message of Christ dwell among you richly as you teach and admonish one another with all wisdom through psalms, hymns, and songs from the Spirit.',
          reference: 'Colossians 3:16',
        },
        practiceActivity: 'Plan and lead a simple gathering with your group using the elements discussed.',
        discussionQuestions: [
          'What are the essential elements of a Christian gathering?',
          'How is this different from just hanging out as friends?',
          'What does "one another" ministry look like?',
        ],
        sections: [
          {
            type: 'text',
            content: 'A simple church gathering doesn\'t need to be complicated. It needs three things: Worship (looking up), Word (looking in), and One-Another (looking around).',
          },
          {
            type: 'scripture',
            content: 'Let the message of Christ dwell among you richly as you teach and admonish one another with all wisdom through psalms, hymns, and songs from the Spirit, singing to God with gratitude in your hearts.',
            reference: 'Colossians 3:16',
          },
          {
            type: 'bullets',
            content: 'Simple Gathering Elements:',
            items: [
              'WORSHIP - Sing together, pray together, give thanks',
              'WORD - Read Scripture, discuss what it means, apply it',
              'ONE-ANOTHER - Encourage, confess, bear burdens, pray for needs',
            ],
          },
          {
            type: 'scripture',
            content: 'And let us consider how we may spur one another on toward love and good deeds, not giving up meeting together, as some are in the habit of doing, but encouraging one another.',
            reference: 'Hebrews 10:24-25',
          },
          {
            type: 'text',
            content: 'A simple gathering might last 1-2 hours in a home, coffee shop, or park. It doesn\'t require special music or professional teaching - just believers devoted to Jesus and each other.',
          },
          {
            type: 'activity',
            content: 'Plan a simple gathering for your group this week. Include worship (sing a song or read a psalm), Word (read and discuss Scripture), and One-Another (pray for each other).',
          },
          {
            type: 'prayer',
            content: 'Father, when we gather, be present with us. Help us worship You, learn from Your Word, and care for one another. Amen.',
          },
        ],
      },
      {
        id: 'church-3',
        title: 'Everyone Participates',
        content: '',
        order: 3,
        takeaway: 'Every believer has something to contribute when the church gathers.',
        keyVerse: {
          text: 'What then shall we say, brothers and sisters? When you come together, each of you has a hymn, or a word of instruction, a revelation, a tongue or an interpretation. Everything must be done so that the church may be built up.',
          reference: '1 Corinthians 14:26',
        },
        practiceActivity: 'In your next gathering, make sure everyone contributes something.',
        discussionQuestions: [
          'Why did Paul say "each of you has"?',
          'What happens when only one person does all the ministry?',
          'What gift or contribution might you bring to the gathering?',
        ],
        sections: [
          {
            type: 'text',
            content: 'In the New Testament, church gatherings were participatory. Everyone had something to contribute. This is very different from watching a performance.',
          },
          {
            type: 'scripture',
            content: 'What then shall we say, brothers and sisters? When you come together, each of you has a hymn, or a word of instruction, a revelation, a tongue or an interpretation. Everything must be done so that the church may be built up.',
            reference: '1 Corinthians 14:26',
          },
          {
            type: 'text',
            content: '"Each of you has" - Paul expected EVERYONE to come prepared to give, not just receive. This builds up the whole body and develops every member.',
          },
          {
            type: 'bullets',
            content: 'How Everyone Can Participate:',
            items: [
              'Share a Scripture that encouraged you',
              'Lead the group in prayer',
              'Share what God is teaching you',
              'Encourage someone else',
              'Ask a question to spark discussion',
              'Serve the group in practical ways',
            ],
          },
          {
            type: 'text',
            content: 'The goal is not that one person teaches and everyone listens, but that everyone contributes to everyone\'s growth.',
          },
          {
            type: 'activity',
            content: 'At your next gathering, go around and have each person share one thing: a verse, a testimony, a prayer request, or an encouragement. No one watches - everyone participates.',
          },
          {
            type: 'prayer',
            content: 'Lord, show me what I can contribute when we gather. Help our group be built up as everyone participates. Amen.',
          },
        ],
      },
      {
        id: 'church-4',
        title: 'Appointing Leaders',
        content: '',
        order: 4,
        takeaway: 'Leaders emerge from the harvest. Look for faithful character, not just ability.',
        keyVerse: {
          text: 'The reason I left you in Crete was that you might put in order what was left unfinished and appoint elders in every town, as I directed you.',
          reference: 'Titus 1:5',
        },
        practiceActivity: 'Identify potential leaders in your group and begin investing in them.',
        discussionQuestions: [
          'What qualifications did Paul list for leaders?',
          'Why is character more important than skill?',
          'Who in your group might be emerging as a leader?',
        ],
        sections: [
          {
            type: 'text',
            content: 'Paul instructed Titus to appoint elders in every town. Leaders were not imported from elsewhere - they emerged from the new believers who proved faithful.',
          },
          {
            type: 'scripture',
            content: 'The reason I left you in Crete was that you might put in order what was left unfinished and appoint elders in every town, as I directed you.',
            reference: 'Titus 1:5',
          },
          {
            type: 'scripture',
            content: 'An elder must be blameless, faithful to his wife, a man whose children believe and are not open to the charge of being wild and disobedient. He must not be overbearing, not quick-tempered, not given to drunkenness, not violent, not pursuing dishonest gain. Rather, he must be hospitable, one who loves what is good, who is self-controlled, upright, holy and disciplined.',
            reference: 'Titus 1:6-8',
          },
          {
            type: 'bullets',
            content: 'Key Leadership Qualifications:',
            items: [
              'CHARACTER - Self-controlled, upright, faithful',
              'FAMILY - Manages household well',
              'REPUTATION - Blameless, hospitable',
              'DOCTRINE - Holds firmly to trustworthy message',
              'ABILITY - Able to teach and encourage others',
            ],
          },
          {
            type: 'text',
            content: 'Notice that most qualifications are about character, not ability. Look for people who are faithful in small things before giving them bigger responsibilities.',
          },
          {
            type: 'activity',
            content: 'Look at your group. Who is faithful? Who cares for others? Who holds to sound teaching? Begin investing in these emerging leaders.',
          },
          {
            type: 'prayer',
            content: 'Lord, raise up faithful leaders from among us. Help me develop the character needed to lead. Amen.',
          },
        ],
      },
    ],
  },

  // ============================================
  // FIELD 5: MULTIPLICATION - The 222 Principle
  // ============================================
  {
    id: 'multiplication-course',
    title: 'The 222 Principle',
    description: 'Creating 4th generation disciples through multiplication',
    field: 'multiplication',
    fieldOrder: 5,
    estimatedMinutes: 60,
    featured: false,
    keyVerse: {
      text: 'And the things you have heard me say in the presence of many witnesses entrust to reliable people who will also be qualified to teach others.',
      reference: '2 Timothy 2:2',
    },
    practiceActivity: 'Identify who you are investing in and who they will teach',
    lessons: [
      {
        id: 'mult-1',
        title: 'Multiplication Mindset',
        content: '',
        order: 1,
        takeaway: 'Four generations are mentioned in 2 Tim 2:2: Paul → Timothy → Faithful people → Others. This is the pattern.',
        keyVerse: {
          text: 'And the things you have heard me say in the presence of many witnesses entrust to reliable people who will also be qualified to teach others.',
          reference: '2 Timothy 2:2',
        },
        practiceActivity: 'Identify who you are investing in (your "Timothy") and talk with them about who they will teach.',
        discussionQuestions: [
          'What four generations do you see in 2 Timothy 2:2?',
          'Why did Paul emphasize "reliable people who will teach others"?',
          'Who are you investing in? Who are they investing in?',
        ],
        sections: [
          {
            type: 'text',
            content: 'In 2 Timothy 2:2, Paul reveals the pattern for multiplying disciples. Four generations are mentioned in one verse: Paul → Timothy → Reliable people → Others.',
          },
          {
            type: 'scripture',
            content: 'And the things you have heard me say in the presence of many witnesses entrust to reliable people who will also be qualified to teach others.',
            reference: '2 Timothy 2:2',
          },
          {
            type: 'bullets',
            content: 'The Four Generations:',
            items: [
              'Generation 1: PAUL - the one who taught',
              'Generation 2: TIMOTHY - the one being taught',
              'Generation 3: RELIABLE PEOPLE - those Timothy would teach',
              'Generation 4: OTHERS - those the reliable people would teach',
            ],
          },
          {
            type: 'text',
            content: 'This is the difference between addition and multiplication. If I only make disciples myself, growth is limited by my capacity. But if I train people to train people, there\'s no limit.',
          },
          {
            type: 'bullets',
            content: 'Multiplication vs. Addition:',
            items: [
              'Addition: I disciple 3 people per year = 30 in 10 years',
              'Multiplication: I disciple 3 who each disciple 3... exponential growth',
              'Jesus spent 3 years with 12 who reached the world',
            ],
          },
          {
            type: 'activity',
            content: 'Draw your "spiritual family tree." Who discipled you? Who are you discipling? Who are they discipling? Where is the chain breaking?',
          },
          {
            type: 'prayer',
            content: 'Lord, give me a multiplication mindset. Help me invest in faithful people who will teach others. Amen.',
          },
        ],
      },
      {
        id: 'mult-2',
        title: 'Coaching vs Teaching',
        content: '',
        order: 2,
        takeaway: 'Good disciple-makers ask more than they tell. They develop others to lead.',
        keyVerse: {
          text: 'What you are doing is not good. You and these people who come to you will only wear yourselves out. The work is too heavy for you; you cannot handle it alone.',
          reference: 'Exodus 18:17-18',
        },
        practiceActivity: 'Instead of giving answers this week, practice asking questions that help people discover answers.',
        discussionQuestions: [
          'What was Jethro\'s advice to Moses?',
          'Why is coaching often more effective than just teaching?',
          'What happens when leaders do everything themselves?',
        ],
        sections: [
          {
            type: 'text',
            content: 'Moses tried to do all the ministry himself until his father-in-law Jethro gave him crucial advice: develop others to share the load. This shifts from doing ministry to equipping others.',
          },
          {
            type: 'scripture',
            content: 'What you are doing is not good. You and these people who come to you will only wear yourselves out. The work is too heavy for you; you cannot handle it alone... Select capable men from all the people... and appoint them as officials... They can help carry your load.',
            reference: 'Exodus 18:17-18, 21-22',
          },
          {
            type: 'text',
            content: 'Coaching is different from teaching. Teaching gives information. Coaching asks questions that help people discover and apply truth themselves.',
          },
          {
            type: 'bullets',
            content: 'Coaching Questions to Ask:',
            items: [
              '"What do you think this passage is saying?"',
              '"How will you obey this?"',
              '"What obstacles might you face?"',
              '"Who can you share this with?"',
              '"How did it go? What did you learn?"',
            ],
          },
          {
            type: 'text',
            content: 'When you tell people answers, they depend on you. When you coach them to discover answers, they can function without you and help others do the same.',
          },
          {
            type: 'activity',
            content: 'This week, when someone comes to you with a problem or question, practice asking questions before giving answers. Help them discover what to do.',
          },
          {
            type: 'prayer',
            content: 'Lord, help me develop others instead of doing everything myself. Give me wisdom to ask good questions. Amen.',
          },
        ],
      },
      {
        id: 'mult-3',
        title: 'Sending & Supporting',
        content: '',
        order: 3,
        takeaway: 'The church in Antioch sent their best. Every church should be a sending church.',
        keyVerse: {
          text: 'While they were worshiping the Lord and fasting, the Holy Spirit said, "Set apart for me Barnabas and Saul for the work to which I have called them."',
          reference: 'Acts 13:2',
        },
        practiceActivity: 'Identify someone in your group who could be sent out and discuss how to support them.',
        discussionQuestions: [
          'Who did the Antioch church send?',
          'What does it mean to be a "sending church"?',
          'How can we support those we send?',
        ],
        sections: [
          {
            type: 'text',
            content: 'The church in Antioch became a model sending church. When the Spirit called, they were willing to send their best leaders - Barnabas and Saul (Paul).',
          },
          {
            type: 'scripture',
            content: 'While they were worshiping the Lord and fasting, the Holy Spirit said, "Set apart for me Barnabas and Saul for the work to which I have called them." So after they had fasted and prayed, they placed their hands on them and sent them off.',
            reference: 'Acts 13:2-3',
          },
          {
            type: 'text',
            content: 'They didn\'t hold onto their best people. They prayed, fasted, laid hands on them, and released them. Every church should be a sending church, not a hoarding church.',
          },
          {
            type: 'bullets',
            content: 'How to Send Well:',
            items: [
              'COMMISSION - Publicly recognize and bless those being sent',
              'SUPPORT - Commit to prayer, finances, and encouragement',
              'RELEASE - Let go of good leaders for greater purposes',
              'CONNECT - Stay in relationship, celebrate what God does',
            ],
          },
          {
            type: 'text',
            content: 'Those who are sent need senders. Mission is a team effort. Some go, some send, but everyone participates.',
          },
          {
            type: 'activity',
            content: 'Is there someone in your group who should be sent out to start something new? Discuss this together. How will you commission and support them?',
          },
          {
            type: 'prayer',
            content: 'Lord, we release our best for Your purposes. Show us who to send and help us support them well. Amen.',
          },
        ],
      },
      {
        id: 'mult-4',
        title: 'Vision to the 4th Generation',
        content: '',
        order: 4,
        takeaway: 'Don\'t just make disciples. Make disciples who make disciples who make disciples.',
        keyVerse: {
          text: 'All authority in heaven and on earth has been given to me. Therefore go and make disciples of all nations.',
          reference: 'Matthew 28:18-19',
        },
        practiceActivity: 'Share the vision for multiplication with someone you are discipling. Help them see past themselves to those they will reach.',
        discussionQuestions: [
          'What is the scope of the Great Commission?',
          'Why did Jesus emphasize "all authority"?',
          'What would it look like for your disciples to have disciples?',
        ],
        sections: [
          {
            type: 'text',
            content: 'Jesus gave us a vision that spans all nations and all generations. He didn\'t just tell us to make converts but to make disciples who make disciples. This is multiplication.',
          },
          {
            type: 'scripture',
            content: 'Then Jesus came to them and said, "All authority in heaven and on earth has been given to me. Therefore go and make disciples of all nations, baptizing them in the name of the Father and of the Son and of the Holy Spirit, and teaching them to obey everything I have commanded you. And surely I am with you always, to the very end of the age."',
            reference: 'Matthew 28:18-20',
          },
          {
            type: 'text',
            content: 'Notice: "teaching them to obey everything I have commanded you" - including THIS command. So making disciples means making disciples who make disciples. It\'s built into the DNA.',
          },
          {
            type: 'bullets',
            content: 'Casting Vision for Multiplication:',
            items: [
              'Help people see beyond themselves',
              'Celebrate when your disciples make disciples',
              'Keep the 4th generation in view: you → them → theirs → others',
              'Tell stories of multiplication to inspire faith',
              'Measure success by sending, not by keeping',
            ],
          },
          {
            type: 'text',
            content: 'The goal is not how many YOU disciple but how many generations deep your fruit goes. Are your disciples making disciples? Are their disciples making disciples?',
          },
          {
            type: 'activity',
            content: 'Meet with someone you\'re discipling. Share the 2 Tim 2:2 vision with them. Ask them: "Who are you investing in? Who will they invest in?" Help them see the multiplication chain.',
          },
          {
            type: 'prayer',
            content: 'Lord Jesus, all authority is Yours. Use us to make disciples of all nations - disciples who make disciples to the 4th generation and beyond. We trust Your promise to be with us. Amen.',
          },
        ],
      },
    ],
  },
];

// Helper function to get courses by field
export const getCoursesByField = (field: FieldType): FourFieldsCourse[] => {
  return fourFieldsCourses.filter((course) => course.field === field);
};

// Helper function to get all lessons in order
export const getAllLessonsInOrder = (): { course: FourFieldsCourse; lesson: ExtendedLesson }[] => {
  const result: { course: FourFieldsCourse; lesson: ExtendedLesson }[] = [];

  FIELD_ORDER.forEach((field) => {
    const courses = getCoursesByField(field);
    courses.forEach((course) => {
      course.lessons.forEach((lesson) => {
        result.push({ course, lesson });
      });
    });
  });

  return result;
};

// Get total lessons count
export const getTotalLessonsCount = (): number => {
  return fourFieldsCourses.reduce((total, course) => total + course.lessons.length, 0);
};

// Get lessons for a specific field
export const getLessonsForField = (field: FieldType): number => {
  return fourFieldsCourses
    .filter((course) => course.field === field)
    .reduce((total, course) => total + course.lessons.length, 0);
};
