# "1 Field 1 Goal" Content Structure for EveryBible

## Overview

Based on research, "One Field One Goal" is the foundational approach for Harvest Multiplication Training (HMT) at multipliers.info. Since the website is CDN-protected, this document proposes an adaptation based on:

1. **Research findings:** HMT consists of 3 modules focused on making disciple-makers (not just disciples)
2. **Reference design:** Indonesian Muslim-focused Bible study app showing culturally adapted content
3. **Existing structure:** Current Four Fields implementation (5 fields)

## Proposed Adaptation: "1 Field 1 Goal" for Tibet

### Philosophy Shift

**Current (Four Fields):**
- 5 sequential fields: Entry → Gospel → Discipleship → Church → Multiplication
- Broad discipleship journey

**New (1 Field 1 Goal):**
- Focus on ONE field at a time with ONE clear goal
- Each field is a complete cycle of: Learn → Practice → Teach
- Simpler, more focused approach suitable for new believers

### Structure: 3 Core Fields

#### Field 1: **The Good News** (བསྟན་བཅོས་བཟང་པོ།)
**Goal:** Share God's story with one person

**Key Concept:** Every person needs to hear about God's love and plan for humanity.

**Lessons:**
1. **God's Story from Creation to Christ**
   - Scripture: Genesis 1-3, John 3:16, Romans 5:8
   - Practice: Share the creation-fall-redemption story with a friend
   - Cultural bridge: Use Tibetan creation stories as entry point

2. **The Cross and Empty Tomb**
   - Scripture: Luke 23-24, 1 Corinthians 15:3-8
   - Practice: Explain Jesus's death and resurrection in simple terms
   - Visual: Use prayer flags concept (sins carried away by wind)

3. **New Life in Christ**
   - Scripture: 2 Corinthians 5:17, Ephesians 2:8-10
   - Practice: Describe what changed in your life after following Jesus
   - Goal complete: Share your story with one person

**Completion Criteria:**
- [ ] Studied all 3 lessons
- [ ] Practiced sharing with a believer
- [ ] Shared with one non-believer
- [ ] Can explain the gospel in 5 minutes

---

#### Field 2: **Making Disciples** (སློབ་མ་བཟོ་བ།)
**Goal:** Help one person grow in their faith

**Key Concept:** Following Jesus means helping others follow Jesus.

**Lessons:**
1. **What Is a Disciple?**
   - Scripture: Matthew 28:18-20, Luke 14:25-33
   - Practice: List 5 characteristics of a disciple
   - Cultural bridge: Guru-disciple tradition in Tibetan Buddhism

2. **One-on-One Mentoring**
   - Scripture: 2 Timothy 2:2, Proverbs 27:17
   - Practice: Meet weekly with one newer believer
   - Structure: Look Back, Look Up, Look Forward (3/3 pattern)

3. **Teaching Obedience**
   - Scripture: John 14:15, James 1:22-25
   - Practice: Help someone apply Scripture to their life
   - Goal complete: Mentor one person for 8 weeks

**Completion Criteria:**
- [ ] Studied all 3 lessons
- [ ] Meeting weekly with one person
- [ ] Person is growing in their faith
- [ ] Person is starting to share with others

---

#### Field 3: **Multiplication** (མང་དུ་འཕེལ་བ།)
**Goal:** Help your disciple make another disciple

**Key Concept:** A disciple who doesn't make disciples isn't really a disciple.

**Lessons:**
1. **The Multiplication Vision**
   - Scripture: Acts 1:8, Luke 5:4-7
   - Practice: Draw your spiritual family tree (who led you? who will you lead?)
   - Cultural bridge: Family lineage importance in Tibetan culture

2. **Releasing Leaders**
   - Scripture: Acts 13:1-3, 2 Timothy 4:5
   - Practice: Commission your disciple to mentor someone new
   - Goal: Let go and trust God working through them

3. **Movements Not Programs**
   - Scripture: Acts 19:10, Colossians 1:6
   - Practice: Celebrate when your "spiritual grandchild" makes a disciple
   - Goal complete: Your disciple has made a disciple (3 generations)

**Completion Criteria:**
- [ ] Studied all 3 lessons
- [ ] Your disciple is now mentoring someone
- [ ] You're coaching your disciple in mentoring
- [ ] 3 generations visible (you → disciple → their disciple)

---

## Implementation in EveryBible App

### Data Model

```typescript
export type OneFieldGoalFieldType = 'good-news' | 'making-disciples' | 'multiplication';

export interface OneFieldGoalLesson {
  id: string;
  field: OneFieldGoalFieldType;
  order: number;
  title: string;
  titleTibetan?: string; // Optional Tibetan translation
  goal: string; // Clear, measurable goal
  scripture: string[]; // Array of verse references
  content: {
    concept: string;
    practice: string;
    culturalBridge: string;
  };
  checklistItems: string[]; // Action steps to complete
}

export interface OneFieldGoalField {
  id: OneFieldGoalFieldType;
  name: string;
  nameTibetan?: string;
  emoji: string;
  color: string; // Tibetan palette color
  goal: string; // Single clear goal for the field
  completionCriteria: string[];
  lessons: OneFieldGoalLesson[];
  estimatedWeeks: number;
}
```

### Visual Design (Tibetan Adaptation)

**Field 1 - Good News:**
- Color: Saffron Gold (#D4A017)
- Emoji: 🌄 (sunrise over mountains)
- Image: Tibetan farmer sowing seeds (gospel planting)
- Gradient: Warm sunrise colors

**Field 2 - Making Disciples:**
- Color: Sky Blue (#4A90E2)
- Emoji: 🤝 (mentorship)
- Image: Two Tibetans walking mountain path together
- Gradient: Clear sky to deep blue

**Field 3 - Multiplication:**
- Color: Monastery Maroon (#8B2635)
- Emoji: 🌱➡️🌳 (growth/family tree)
- Image: Tibetan celebration with multiple generations
- Gradient: Maroon to gold

### UI Changes from Four Fields

**Current Journey Screen:**
- Shows 5 fields in vertical scroll
- All fields visible at once
- Complex progress tracking

**New "1 Field 1 Goal" Screen:**
- Shows only CURRENT field as hero card
- Completed fields shown as small cards below
- Locked fields grayed out with "Complete Field X first" message
- Simpler: Focus on ONE thing at a time

**Example:**
```
┌─────────────────────────────┐
│  CURRENT FIELD              │
│  ┌───────────────────────┐  │
│  │ [Field 2 Image]       │  │
│  │ Making Disciples      │  │
│  │ Goal: Help one person │  │
│  │       grow in faith   │  │
│  │                       │  │
│  │ ▓▓▓▓░░░ 4/9 lessons  │  │
│  │ [Continue Button]     │  │
│  └───────────────────────┘  │
└─────────────────────────────┘

Completed:
┌──────────────┐
│ ✓ Field 1    │  (small card)
│ Good News    │
└──────────────┘

Next:
┌──────────────┐
│ 🔒 Field 3   │  (locked, grayed)
│ Complete     │
│ Field 2 first│
└──────────────┘
```

### Content Adaptation Notes

**Tibetan Cultural Bridges:**
- **Prayer flags:** Use as metaphor for sins carried away (like wind carries prayers)
- **Guru-disciple tradition:** Natural entry point for mentoring concept
- **Family lineage:** Use for multiplication/spiritual family tree
- **Pilgrimage:** Journey metaphor for discipleship
- **Monastery community:** Model for church/fellowship
- **Butter lamps:** Light passing from one to another (multiplication)

**Avoid:**
- Buddhist religious terms (dharma, karma, samsara) - use Christian equivalents
- Reincarnation concepts - emphasize new life, not rebirth
- Idol/statue imagery - focus on people and relationships
- Temple worship - focus on personal relationship with God

**Emphasize:**
- Oral tradition (Tibetans love stories)
- Community and relationships (collectivist culture)
- Practical obedience (action-oriented)
- Passing on to others (family/lineage focus)

---

## Migration from Four Fields

### State Migration Strategy

Users who have progress in the current Four Fields system need smooth transition:

```typescript
interface MigrationMap {
  // Old Four Fields → New 1 Field 1 Goal
  'entry': 'good-news',        // Maps to Field 1
  'gospel': 'good-news',       // Combines with entry
  'discipleship': 'making-disciples', // Maps to Field 2
  'church': 'multiplication',   // Part of Field 3
  'multiplication': 'multiplication' // Maps to Field 3
}

function migrateProgress(oldProgress: FourFieldsProgress): OneFieldGoalProgress {
  // If user completed Entry OR Gospel → Field 1 complete
  // If user completed Discipleship → Field 2 in progress
  // If user completed Church OR Multiplication → Field 3 in progress

  // Preserve lesson completion data where applicable
  // Show migration notice to user explaining new structure
}
```

### User Communication

**In-app message after update:**
```
🎉 New Simplified Training!

We've updated the Harvest section with a clearer, more focused approach:

OLD: 5 Fields (Entry → Gospel → Discipleship → Church → Multiplication)
NEW: 3 Fields (Good News → Making Disciples → Multiplication)

Your progress has been preserved. Each field now has ONE clear goal to help you focus on what matters most: making disciples who make disciples.

[Start Field 1] [Learn More]
```

---

## Success Metrics

How to measure if "1 Field 1 Goal" is working better than Four Fields:

1. **Completion Rate:** % of users who complete all 3 fields vs old 5 fields
2. **Time to Complete:** Average weeks to finish the journey
3. **Engagement:** Daily/weekly active usage of Learn section
4. **Practical Application:** % who check off "practiced" and "taught" items
5. **Multiplication:** # of users reporting 3+ generations

**Expected Improvements:**
- Higher completion rate (3 fields easier than 5)
- Clearer goals (actionable vs theoretical)
- More focus (one thing at a time)
- Better cultural fit (adapted to Tibetan context)

---

## Next Steps for Implementation

1. ✅ Create this content document
2. ⏳ Wait for theme system update (maroon/gold colors)
3. ⏳ Wait for Tibetan images generation
4. 🔜 Implement new data model (`oneFieldGoalCourses.ts`)
5. 🔜 Update screens (CourseListScreen, FourFieldsJourneyScreen)
6. 🔜 Add migration logic to fourFieldsStore
7. 🔜 Update translation keys (en, es, ne, hi)
8. 🔜 Test on iPhone 17 Pro simulator
9. 🔜 Cultural review with Tibetan advisor
10. 🔜 Deploy to TestFlight for user testing

---

## Questions for User

1. **Content Accuracy:** Does this capture the "1 Field 1 Goal" spirit from multipliers.info?
2. **Cultural Adaptation:** Are the Tibetan cultural bridges appropriate and respectful?
3. **Theological Soundness:** Does the content align with your ministry's theology?
4. **Lesson Depth:** Are 3 lessons per field enough, or should we add more?
5. **Progress Migration:** Should we preserve old progress or start everyone fresh?
6. **Tibetan Language:** Should we add Tibetan script (བོད་ཡིག་) for field names and key terms?

---

## Resources Needed

- [ ] Final approval of content structure
- [ ] Tibetan language consultant for translations
- [ ] Cultural advisor for sensitivity review
- [ ] Scripture references verified against BSB translation
- [ ] Access to multipliers.info content (if possible) for accuracy
- [ ] Beta testers from Tibetan Christian community

---

*This document created as adaptation due to multipliers.info being CDN-protected. Content should be reviewed and approved before implementation.*
