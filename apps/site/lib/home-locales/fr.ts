import type { HomeCopy } from '../home-copy';

const copy: HomeCopy = {
  locale: 'fr',
  dir: 'ltr',
  meta: {
    title: 'La Parole de Dieu. Dans la langue de votre cœur. | EveryBible',
    description:
      'Lisez et écoutez la Bible dans votre propre langue. Gratuit, hors ligne, sans publicité. Explorez la disponibilité des Écritures dans les langues du monde.',
  },
  nav: {
    atlas: 'Atlas des langues',
    bible: 'Bible',
    plans: 'Plans',
    app: 'L’application',
    mission: 'Mission',
    give: 'Donner',
    getApp: 'Obtenir l’application',
    menu: 'Menu',
    closeMenu: 'Fermer le menu',
    skipToContent: 'Aller au contenu',
  },
  hero: {
    eyebrow: 'Un projet d’Every Language',
    titleLine1: 'La Parole de Dieu.',
    titleLine2: 'Dans la langue de votre cœur.',
    lede: 'Lisez et écoutez la Bible dans votre propre langue. Gratuit, hors ligne et sans publicité.',
    primaryCta: 'Obtenir l’application gratuite',
    exploreCta: 'Explorer l’atlas',
    scrollHint: 'Faites défiler pour voir le besoin',
  },
  story: {
    languages: {
      eyebrow: 'Les langues du monde',
      title: 'Chaque point est une langue.',
      body: '{{languages}} langues, chacune placée là où elle est parlée, avec ses dialectes et ses variantes.',
    },
    noScripture: {
      eyebrow: 'Le besoin',
      title: '{{count}} langues n’ont aucune Écriture connue.',
      body: 'Aucune n’est répertoriée dans nos sources. Chaque point rouge est une langue qui attend encore la Parole de Dieu.',
    },
    inTheApp: {
      eyebrow: 'EveryBible',
      title: 'EveryBible parle déjà {{count}} langues.',
      body: 'Conçue pour le cœur de l’Afrique et les hauteurs de l’Himalaya, et bien d’autres sont à venir.',
      cta: 'Découvrir l’application',
    },
    sources: 'Données linguistiques de Joshua Project, Global Recordings Network et Glottolog.',
    sourcesLink: 'Sources et crédits',
  },
  explore: {
    close: 'Retour au récit',
    searchPlaceholder: 'Trouver une langue ou un dialecte…',
    searchLabel: 'Rechercher des langues et des dialectes',
  },
  app: {
    eyebrow: 'L’application',
    title: 'Les Écritures vont où vous allez.',
    lede: 'Lisez ou écoutez dans votre langue. Téléchargez-la une fois et utilisez-la sans réseau.',
    promises: ['Gratuit pour toujours', 'Sans publicité ni achats', 'Fonctionne hors ligne'],
    shots: [
      {
        alt: 'L’écran d’accueil s’ouvre sur le verset du jour, avec la progression de lecture en dessous.',
      },
      { alt: 'L’application dans ses thèmes clair et sombre, côte à côte.' },
      {
        alt: 'Des plans de lecture pour chaque saison, des rythmes quotidiens à la Bible entière.',
      },
      { alt: 'Le Psaume 23 avec des versets surlignés dans le lecteur.' },
      { alt: 'Rassembler : des leçons de discipulat à étudier entre amis.' },
      { alt: 'Choisir une traduction de la Bible par langue.' },
      { alt: 'Écoute du Psaume 23, le verset lu étant signalé.' },
    ],
    rail: {
      label: 'Captures d’écran de l’application',
      previous: 'Capture précédente',
      next: 'Capture suivante',
    },
    download: {
      title: 'Obtenir EveryBible',
      desktopHint: 'Scannez avec votre téléphone, ou choisissez votre boutique.',
      iosHint: 'Gratuit sur l’App Store.',
      androidHint: 'Gratuit sur Google Play.',
      appStoreAlt: 'Télécharger sur l’App Store',
      googlePlayAlt: 'Disponible sur Google Play',
      qrAlt: 'Scannez pour télécharger EveryBible',
    },
  },
  mission: {
    eyebrow: 'Pourquoi Every Language existe',
    quote: 'La parole de Dieu est vivante et efficace, même dans les mains d’une enfant.',
    paragraphs: [
      'Il y a six ans, nous avons fini de placer la Bible dans trente mille foyers d’une région montagneuse isolée de l’Himalaya. Il restait un village. Ses habitants avaient chassé nos équipes et promis des coups et des pierres si nous revenions. Dans une école du chef-lieu du district, nous avons distribué des Bibles, et une fillette a rapporté la sienne chez elle. Elle venait de ce village, et son père en était le grand prêtre. Elle a lu le Sermon sur la montagne, qui parle d’un Père céleste qui prend soin des oiseaux du ciel et des lis des champs, et elle lui a donné sa vie. Puis elle a conduit son frère, sa mère et son père au Seigneur. Le village a chassé la famille, et dans les jours qui ont suivi elle a conduit seize autres personnes à Jésus et écrit des dizaines de chants de louange.',
      'La parole de Dieu est vivante et efficace, même dans les mains d’une enfant. La foi vient de ce qu’on entend, et l’Esprit se sert de cette Parole pour amener des personnes à Christ, et par elles des familles, des villages et des nations. Voilà pourquoi Every Language existe : pour que chaque peuple de la terre puisse entendre les Écritures dans sa propre langue, et pour que des gens de toute tribu et de toute langue se tiennent debout devant le trône, rachetés par le sang de l’Agneau.',
    ],
    giveCta: 'Soutenir l’œuvre',
    aboutCta: 'Notre mission',
  },
  plans: {
    eyebrow: 'Plans de lecture',
    seasonTitle: 'Des plans pour cette saison',
    title: 'Commencer un plan de lecture',
    lede: 'Des plans gratuits dans l’application, d’une semaine à la Bible entière.',
    days: '{{count}} jours',
    allPlans: 'Voir tous les plans',
  },
  footer: {
    languageLabel: 'Langue',
  },
};

export default copy;
