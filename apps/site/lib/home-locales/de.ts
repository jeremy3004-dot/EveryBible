import type { HomeCopy } from '../home-copy';

const copy: HomeCopy = {
  locale: 'de',
  dir: 'ltr',
  meta: {
    title: 'Gottes Wort. In deiner Herzenssprache. | EveryBible',
    description:
      'Lies und höre die Bibel in deiner eigenen Sprache. Kostenlos, offline und ohne Werbung. Entdecke, in welchen Sprachen der Welt die Bibel verfügbar ist.',
  },
  nav: {
    atlas: 'Sprachatlas',
    bible: 'Bibel',
    plans: 'Pläne',
    app: 'Die App',
    mission: 'Auftrag',
    give: 'Spenden',
    getApp: 'App laden',
    menu: 'Menü',
    closeMenu: 'Menü schließen',
    skipToContent: 'Zum Inhalt springen',
  },
  hero: {
    eyebrow: 'Ein Projekt von Every Language',
    titleLine1: 'Gottes Wort.',
    titleLine2: 'In deiner Herzenssprache.',
    lede: 'Lies und höre die Bibel in deiner eigenen Sprache. Kostenlos, offline und ohne Werbung.',
    primaryCta: 'Kostenlose App laden',
    exploreCta: 'Atlas erkunden',
    scrollHint: 'Scrolle, um die Not zu sehen',
  },
  story: {
    languages: {
      eyebrow: 'Die Sprachen der Welt',
      title: 'Jeder Punkt ist eine Sprache.',
      body: '{{languages}} Sprachen, jede dort verzeichnet, wo sie gesprochen wird, mit ihren Dialekten und Varietäten.',
    },
    noScripture: {
      eyebrow: 'Die Not',
      title: 'Für {{count}} Sprachen ist keine Bibel bekannt.',
      body: 'In unseren Quellen ist keine verzeichnet. Jeder rote Punkt ist eine Sprache, die noch auf Gottes Wort wartet.',
    },
    inTheApp: {
      eyebrow: 'EveryBible',
      title: 'EveryBible spricht schon {{count}} Sprachen.',
      body: 'Gemacht für das Herz Afrikas und die Höhen des Himalaja, weitere folgen.',
      cta: 'Die App ansehen',
    },
    sources: 'Sprachdaten von Joshua Project, Global Recordings Network und Glottolog.',
    sourcesLink: 'Quellen und Danksagung',
  },
  explore: {
    close: 'Zurück zur Geschichte',
    searchPlaceholder: 'Sprache oder Dialekt finden…',
    searchLabel: 'Sprachen und Dialekte durchsuchen',
  },
  app: {
    eyebrow: 'Die App',
    title: 'Gottes Wort geht mit dir.',
    lede: 'Lies oder höre in deiner Sprache. Einmal herunterladen und ohne Empfang nutzen.',
    promises: ['Für immer kostenlos', 'Keine Werbung, keine Käufe', 'Funktioniert offline'],
    shots: [
      { alt: 'Der Startbildschirm öffnet mit dem Vers des Tages, darunter der Lesefortschritt.' },
      { alt: 'Die App im hellen und im dunklen Design nebeneinander.' },
      { alt: 'Lesepläne für jede Jahreszeit, von täglichen Rhythmen bis zur ganzen Bibel.' },
      { alt: 'Psalm 23 mit markierten Versen im Leser.' },
      { alt: 'Treffen: Jüngerschaftslektionen, die du mit Freunden studieren kannst.' },
      { alt: 'Eine Bibelübersetzung nach Sprache auswählen.' },
      { alt: 'Psalm 23 hören, der gerade gelesene Vers ist markiert.' },
    ],
    rail: {
      label: 'App-Screenshots',
      previous: 'Vorheriger Screenshot',
      next: 'Nächster Screenshot',
    },
    download: {
      title: 'EveryBible laden',
      desktopHint: 'Scanne mit deinem Handy oder wähle deinen Store.',
      iosHint: 'Kostenlos im App Store.',
      androidHint: 'Kostenlos bei Google Play.',
      appStoreAlt: 'Laden im App Store',
      googlePlayAlt: 'Jetzt bei Google Play',
      qrAlt: 'Scannen, um EveryBible zu laden',
    },
  },
  mission: {
    eyebrow: 'Warum es Every Language gibt',
    quote: 'Das Wort Gottes ist lebendig und kräftig, sogar in den Händen eines Kindes.',
    paragraphs: [
      'Vor sechs Jahren haben wir in einer abgelegenen Bergregion des Himalaja die Bibel in dreißigtausend Haushalte gebracht. Ein Dorf blieb übrig. Die Menschen dort hatten unsere Teams vertrieben und uns Prügel und Steine versprochen, falls wir wiederkämen. In einer Schule in der Bezirkshauptstadt verteilten wir Bibeln, und ein Mädchen nahm ihre mit nach Hause. Sie stammte aus diesem Dorf, und ihr Vater war der Oberpriester. Sie las die Bergpredigt, von einem himmlischen Vater, der für die Vögel unter dem Himmel und die Lilien auf dem Feld sorgt, und gab ihm ihr Leben. Dann führte sie ihren Bruder, ihre Mutter und ihren Vater zum Herrn. Das Dorf vertrieb die Familie, und in den Tagen danach führte sie sechzehn weitere Menschen zu Jesus und schrieb Dutzende Lobpreislieder.',
      'Das Wort Gottes ist lebendig und kräftig, sogar in den Händen eines Kindes. Der Glaube kommt aus dem Hören der Predigt, und der Geist gebraucht dieses Wort, um einzelne Menschen zu Christus zu bringen und durch sie Familien, Dörfer und Nationen. Darum gibt es Every Language: Damit jedes Volk auf der Erde die Heilige Schrift in seiner eigenen Sprache hören kann und damit Menschen aus allen Stämmen und Sprachen vor dem Thron stehen, erlöst durch das Blut des Lammes.',
    ],
    giveCta: 'Für das Werk spenden',
    aboutCta: 'Unser Auftrag',
  },
  plans: {
    eyebrow: 'Lesepläne',
    seasonTitle: 'Pläne für diese Zeit',
    title: 'Einen Leseplan beginnen',
    lede: 'Kostenlose Pläne in der App, von einer Woche bis zur ganzen Bibel.',
    days: '{{count}} Tage',
    allPlans: 'Alle Pläne ansehen',
  },
  footer: {
    languageLabel: 'Sprache',
  },
};

export default copy;
