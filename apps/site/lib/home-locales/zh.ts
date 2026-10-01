import type { HomeCopy } from '../home-copy';

const copy: HomeCopy = {
  locale: 'zh-Hans',
  dir: 'ltr',
  meta: {
    title: '神的话语，用你心中的语言 | EveryBible',
    description:
      '用你自己的语言阅读和收听圣经。免费、可离线使用、没有广告。了解全世界各种语言的圣经译本情况。',
  },
  nav: {
    atlas: '语言地图',
    bible: '圣经',
    plans: '计划',
    app: '应用',
    mission: '使命',
    give: '奉献',
    getApp: '获取应用',
    menu: '菜单',
    closeMenu: '关闭菜单',
    skipToContent: '跳到正文',
  },
  hero: {
    eyebrow: 'Every Language 的项目',
    titleLine1: '神的话语。',
    titleLine2: '用你心中的语言。',
    lede: '用你自己的语言阅读和收听圣经。免费、可离线使用、没有广告。',
    primaryCta: '获取免费应用',
    exploreCta: '探索语言地图',
    scrollHint: '向下滚动，看看这份需要',
  },
  story: {
    languages: {
      eyebrow: '世界的语言',
      title: '每一个圆点都是一种语言。',
      body: '共 {{languages}} 种语言，每一种都标注在使用它的地方，并附有各地的方言和变体。',
    },
    noScripture: {
      eyebrow: '需要',
      title: '有 {{count}} 种语言没有已知的圣经。',
      body: '我们的资料来源中没有任何记录。每一个红点都是仍在等候神话语的语言。',
    },
    inTheApp: {
      eyebrow: 'EveryBible',
      title: 'EveryBible 已经能用 {{count}} 种语言与人对话。',
      body: '从非洲腹地到喜马拉雅高地，我们为他们而建，更多语言正在路上。',
      cta: '了解应用',
    },
    sources: '语言数据来自 Joshua Project、Global Recordings Network 和 Glottolog。',
    sourcesLink: '资料来源与致谢',
  },
  explore: {
    close: '返回故事',
    searchPlaceholder: '查找语言或方言…',
    searchLabel: '搜索语言和方言',
  },
  app: {
    eyebrow: '应用',
    title: '圣经随你同行。',
    lede: '用你的语言阅读或收听。下载一次，没有信号也能使用。',
    promises: ['永远免费', '没有广告，没有内购', '可离线使用'],
    shots: [
      { alt: '主屏幕以每日经文开场，下方显示阅读进度。' },
      { alt: '应用的浅色和深色主题并排展示。' },
      { alt: '适合各个时期的读经计划，从每日灵修到通读整本圣经。' },
      { alt: '阅读器中标出高亮经节的诗篇 23 篇。' },
      { alt: '聚集：可与朋友一起学习的门徒训练课程。' },
      { alt: '按语言选择圣经译本。' },
      { alt: '收听诗篇 23 篇，正在朗读的经节会被标出。' },
    ],
    rail: { label: '应用截图', previous: '上一张截图', next: '下一张截图' },
    download: {
      title: '获取 EveryBible',
      desktopHint: '用手机扫码，或选择你的应用商店。',
      iosHint: '在 App Store 免费下载。',
      androidHint: '在 Google Play 免费下载。',
      appStoreAlt: '在 App Store 下载',
      googlePlayAlt: '在 Google Play 获取',
      qrAlt: '扫码下载 EveryBible',
    },
  },
  mission: {
    eyebrow: 'Every Language 为何存在',
    quote: '神的道是活泼的，是有功效的，即使在孩子手中也是如此。',
    paragraphs: [
      '六年前，我们把圣经送进了喜马拉雅偏远山区的三万户人家，最后只剩下一个村子。他们曾把我们的团队赶走，并扬言如果我们再去，就要用棍棒和石头打我们。在县城的一所学校里，我们发放圣经，一个女孩把她的那本带回了家。她就来自那个村子，她的父亲是村里的主祭。她读到了登山宝训，读到天上的父顾念天上的飞鸟和野地里的百合花，就把自己的生命交给了他。后来，她带领弟弟、母亲和父亲信了主。村里把这一家人赶了出去，而在随后的日子里，她又带领另外十六个人信靠耶稣，还写下了几十首敬拜的诗歌。',
      '神的道是活泼的，是有功效的，即使在孩子手中也是如此。信道是从听道来的，圣灵使用这道，把一个又一个人带到基督面前，又藉着他们，把家庭、村庄和邦国带到祂面前。这正是 Every Language 存在的原因：让地上每一个民族都能用自己的语言听见圣经，也让来自各邦国、各支派、各民、各方言的人，都站在宝座前，被羔羊的血救赎。',
    ],
    giveCta: '为这项事工奉献',
    aboutCta: '我们的使命',
  },
  plans: {
    eyebrow: '读经计划',
    seasonTitle: '适合这个节期的计划',
    title: '开始一个读经计划',
    lede: '应用中的免费计划，从一周到整本圣经。',
    days: '{{count}} 天',
    allPlans: '查看全部计划',
  },
  footer: {
    languageLabel: '语言',
  },
};

export default copy;
