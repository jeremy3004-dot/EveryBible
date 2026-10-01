import type { HomeCopy } from '../home-copy';

const copy: HomeCopy = {
  locale: 'es',
  dir: 'ltr',
  meta: {
    title: 'La Palabra de Dios. En el idioma de tu corazón. | EveryBible',
    description:
      'Lee y escucha la Biblia en tu propio idioma. Gratis, sin conexión y sin anuncios. Explora la disponibilidad de las Escrituras en los idiomas del mundo.',
  },
  nav: {
    atlas: 'Atlas de idiomas',
    bible: 'Biblia',
    plans: 'Planes',
    app: 'La aplicación',
    mission: 'Misión',
    give: 'Dar',
    getApp: 'Obtén la aplicación',
    menu: 'Menú',
    closeMenu: 'Cerrar menú',
    skipToContent: 'Saltar al contenido',
  },
  hero: {
    eyebrow: 'Un proyecto de Every Language',
    titleLine1: 'La Palabra de Dios.',
    titleLine2: 'En el idioma de tu corazón.',
    lede: 'Lee y escucha la Biblia en tu propio idioma. Gratis, sin conexión y sin anuncios.',
    primaryCta: 'Obtén la aplicación gratis',
    exploreCta: 'Explora el atlas',
    scrollHint: 'Desplázate para ver la necesidad',
  },
  story: {
    languages: {
      eyebrow: 'Los idiomas del mundo',
      title: 'Cada punto es un idioma.',
      body: '{{languages}} idiomas, cada uno ubicado donde se habla, con sus dialectos y variedades.',
    },
    noScripture: {
      eyebrow: 'La necesidad',
      title: '{{count}} idiomas no tienen Escrituras conocidas.',
      body: 'Ninguno aparece registrado en nuestras fuentes. Cada punto rojo es un idioma que todavía espera la Palabra de Dios.',
    },
    inTheApp: {
      eyebrow: 'EveryBible',
      title: 'EveryBible ya habla {{count}} idiomas.',
      body: 'Pensada para el corazón de África y las alturas del Himalaya, y con más en camino.',
      cta: 'Conoce la aplicación',
    },
    sources: 'Datos de idiomas de Joshua Project, Global Recordings Network y Glottolog.',
    sourcesLink: 'Fuentes y créditos',
  },
  explore: {
    close: 'Volver a la historia',
    searchPlaceholder: 'Busca un idioma o dialecto…',
    searchLabel: 'Buscar idiomas y dialectos',
  },
  app: {
    eyebrow: 'La aplicación',
    title: 'Las Escrituras van adonde tú vas.',
    lede: 'Lee o escucha en tu idioma. Descárgalo una vez y úsalo sin señal.',
    promises: ['Gratis para siempre', 'Sin anuncios ni compras', 'Funciona sin conexión'],
    shots: [
      {
        alt: 'La pantalla de inicio abre con el versículo del día y, debajo, el progreso de lectura.',
      },
      { alt: 'La aplicación en sus temas claro y oscuro, lado a lado.' },
      {
        alt: 'Planes de lectura para cada temporada, desde ritmos diarios hasta la Biblia completa.',
      },
      { alt: 'El Salmo 23 con versículos resaltados en el lector.' },
      { alt: 'Reunirse: lecciones de discipulado para estudiar con amigos.' },
      { alt: 'Elegir una traducción de la Biblia por idioma.' },
      { alt: 'Escuchando el Salmo 23 con el versículo que se lee marcado.' },
    ],
    rail: {
      label: 'Capturas de pantalla de la aplicación',
      previous: 'Captura anterior',
      next: 'Captura siguiente',
    },
    download: {
      title: 'Obtén EveryBible',
      desktopHint: 'Escanea el código con tu teléfono o elige tu tienda.',
      iosHint: 'Gratis en la App Store.',
      androidHint: 'Gratis en Google Play.',
      appStoreAlt: 'Descárgala en la App Store',
      googlePlayAlt: 'Disponible en Google Play',
      qrAlt: 'Escanea para descargar EveryBible',
    },
  },
  mission: {
    eyebrow: 'Por qué existe Every Language',
    quote: 'La palabra de Dios es viva y eficaz, incluso en las manos de una niña.',
    paragraphs: [
      'Hace seis años terminamos de poner la Biblia en treinta mil hogares de una región montañosa y remota del Himalaya. Quedaba una aldea. Habían echado a nuestros equipos y prometieron golpes y pedradas si volvíamos. En una escuela de la sede del distrito repartimos Biblias, y una niña llevó la suya a casa. Era de esa aldea, y su padre era el sacerdote principal. Leyó el Sermón del monte, sobre un Padre celestial que cuida de las aves del cielo y de los lirios del campo, y le entregó su vida. Luego llevó al Señor a su hermano, a su madre y a su padre. La aldea expulsó a la familia, y en los días siguientes ella guio a dieciséis personas más a Jesús y escribió decenas de canciones de adoración.',
      'La palabra de Dios es viva y eficaz, incluso en las manos de una niña. La fe es por el oír, y el Espíritu usa esa Palabra para traer personas a Cristo, y por medio de ellas a familias, aldeas y naciones. Por eso existe Every Language: para que todos los pueblos de la tierra puedan oír las Escrituras en su propio idioma, y para que gente de todas las tribus y lenguas esté de pie delante del trono, redimida por la sangre del Cordero.',
    ],
    giveCta: 'Da para la obra',
    aboutCta: 'Nuestra misión',
  },
  plans: {
    eyebrow: 'Planes de lectura',
    seasonTitle: 'Planes para esta temporada',
    title: 'Comienza un plan de lectura',
    lede: 'Planes gratuitos en la aplicación, desde una semana hasta la Biblia completa.',
    days: '{{count}} días',
    allPlans: 'Ver todos los planes',
  },
  footer: {
    languageLabel: 'Idioma',
  },
};

export default copy;
