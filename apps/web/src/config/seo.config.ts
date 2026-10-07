/**
 * Single source of truth for SEO metadata.
 *
 * Consumed by three places, which is exactly why the values live here and
 * nowhere else:
 *   - `vite.config.ts` (`writeBundle`) bakes a per-route `<head>` into
 *     dist/<route>/index.html, so every public URL ships its own metadata.
 *   - `vite.config.ts` (`transformIndexHtml`) keeps `vite dev` consistent.
 *   - `PublicLayout` syncs the same tags on client-side navigation, so a link
 *     shared after navigating inside the SPA is not mislabelled.
 *
 * Values must stay build-time safe: no browser globals, no side effects.
 */

/** Canonical origin. Every other host 301s here (see scripts/nginx/domains). */
export const SITE_URL = 'https://lavozverdad.com';

export const SITE_NAME = 'La Voz de la Verdad';

/** Content locale. Colombia is the only market the station broadcasts to. */
export const LOCALE = 'es_CO';

export const LOCALE_NAME = 'es_La_Voz_de_la_Verdad';

export const DEFAULT_OG_IMAGE_PATH = '/og-image.png';

export const OG_IMAGE_WIDTH = 1200;

export const OG_IMAGE_HEIGHT = 630;

/** Public stream mount point, proxied to AzuraCast by nginx. */
export const STREAM_URL = `${SITE_URL}/listen/la_voz_de_la_verdad/`;

export const PUBLIC_ROUTES = [
  '/',
  '/programacion',
  '/opiniones',
  '/info/who-we-are',
  '/info/privacy',
  '/info/terms',
  '/info/data-treatment',
  '/info/cookies',
] as const;

export type PublicRoute = (typeof PUBLIC_ROUTES)[number];

/**
 * How a route is described to crawlers. `kind` selects the JSON-LD node type;
 * `priority` and `changefreq` are only consumed by the sitemap writer.
 */
export type RouteKind = 'home' | 'schedule' | 'about' | 'feedback' | 'legal';

export interface RouteMeta {
  readonly kind: RouteKind;
  readonly title: string;
  readonly description: string;
  readonly ogTitle: string;
  readonly priority: number;
  readonly changefreq: 'daily' | 'weekly' | 'monthly' | 'yearly';
}

const HOME_DESCRIPTION =
  'Emisora cristiana online transmitiendo 24/7 desde Colombia. Escucha música de alabanza, adoración y mensajes bíblicos que edifican tu fe. Únete a nuestros cultos en vivo.';

export const ROUTE_META: Readonly<Record<PublicRoute, RouteMeta>> = {
  '/': {
    kind: 'home',
    title: 'La Voz de la Verdad | Radio Cristiana Online 24/7',
    description: HOME_DESCRIPTION,
    ogTitle: 'La Voz de la Verdad | Radio Cristiana Online',
    priority: 1.0,
    changefreq: 'daily',
  },
  '/programacion': {
    kind: 'schedule',
    title: 'Programación | La Voz de la Verdad',
    description:
      'Consulta la programación semanal completa de La Voz de la Verdad: programas, horarios y mensajes de alabanza, adoración y predicación en directo.',
    ogTitle: 'Programación semanal | La Voz de la Verdad',
    priority: 0.8,
    changefreq: 'daily',
  },
  '/opiniones': {
    kind: 'feedback',
    title: 'Opiniones y Sugerencias | La Voz de la Verdad',
    description:
      'Escríbenos sin dar ningún dato. Sugerencias, felicitaciones, consultas y problemas de la emisión llegan directamente a la bandeja del equipo de La Voz de la Verdad.',
    ogTitle: 'Opiniones y sugerencias | La Voz de la Verdad',
    priority: 0.7,
    changefreq: 'monthly',
  },
  '/info/who-we-are': {
    kind: 'about',
    title: 'Quiénes Somos | La Voz de la Verdad',
    description:
      'Conoce La Voz de la Verdad: emisora cristiana de Cartago, Colombia. Nuestra historia, misión, visión y los valores que sostienen nuestra transmisión 24/7.',
    ogTitle: 'Quiénes somos | La Voz de la Verdad',
    priority: 0.6,
    changefreq: 'monthly',
  },
  '/info/privacy': {
    kind: 'legal',
    title: 'Política de Privacidad | La Voz de la Verdad',
    description:
      'Política de privacidad de La Voz de la Verdad: qué datos personales recopilamos, con qué finalidad y cómo se protegen, conforme a la Ley 1581 de 2012 de Colombia.',
    ogTitle: 'Política de privacidad | La Voz de la Verdad',
    priority: 0.2,
    changefreq: 'yearly',
  },
  '/info/terms': {
    kind: 'legal',
    title: 'Términos y Condiciones | La Voz de la Verdad',
    description:
      'Términos y condiciones de uso del sitio y del servicio de streaming de La Voz de la Verdad, emisora cristiana online.',
    ogTitle: 'Términos y condiciones | La Voz de la Verdad',
    priority: 0.2,
    changefreq: 'yearly',
  },
  '/info/data-treatment': {
    kind: 'legal',
    title: 'Tratamiento de Datos Personales | La Voz de la Verdad',
    description:
      'Información sobre el tratamiento de datos personales de La Voz de la Verdad de acuerdo con la Ley 1581 de 2012 y el Decreto 1377 de 2013 en Colombia.',
    ogTitle: 'Tratamiento de datos personales | La Voz de la Verdad',
    priority: 0.2,
    changefreq: 'yearly',
  },
  '/info/cookies': {
    kind: 'legal',
    title: 'Política de Cookies | La Voz de la Verdad',
    description:
      'Qué cookies utiliza La Voz de la Verdad, con qué finalidad y cómo puedes gestionarlas o revocarlas desde tu navegador.',
    ogTitle: 'Política de cookies | La Voz de la Verdad',
    priority: 0.2,
    changefreq: 'yearly',
  },
} satisfies Record<PublicRoute, RouteMeta>;

/**
 * Absolute URL for a public route. The home keeps its trailing slash so it
 * matches the URL a visitor actually lands on, which is what canonical must
 * agree with.
 */
export function canonicalUrl(route: PublicRoute): string {
  return route === '/' ? `${SITE_URL}/` : `${SITE_URL}${route}`;
}

export function absoluteUrl(assetPath: string): string {
  return `${SITE_URL}${assetPath.startsWith('/') ? assetPath : `/${assetPath}`}`;
}

export function isPublicRoute(pathname: string): pathname is PublicRoute {
  return (PUBLIC_ROUTES as readonly string[]).includes(pathname);
}

/** Strips the query, hash and trailing slash so lookups match ROUTE_META keys. */
export function normalizePathname(pathname: string): string {
  const withoutQuery = pathname.split(/[?#]/)[0] ?? '/';
  if (withoutQuery.length > 1 && withoutQuery.endsWith('/')) {
    return withoutQuery.slice(0, -1);
  }
  return withoutQuery;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Core `<head>` tags for a route: identity plus the canonical that tells
 * search engines which of the four served hosts owns this URL.
 */
export function buildHeadTags(route: PublicRoute): string {
  const meta = ROUTE_META[route];
  return [
    `<title>${escapeHtml(meta.title)}</title>`,
    `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    `<meta name="author" content="${escapeHtml(SITE_NAME)}" />`,
    '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />',
    `<link rel="canonical" href="${escapeHtml(canonicalUrl(route))}" />`,
  ].join('\n    ');
}

/**
 * Open Graph and Twitter tags. Open Graph requires absolute URLs, so a
 * relative asset path is resolved against SITE_URL here rather than at each
 * call site.
 */
export function buildSocialTags(route: PublicRoute): string {
  const meta = ROUTE_META[route];
  const canonical = canonicalUrl(route);
  const image = absoluteUrl(DEFAULT_OG_IMAGE_PATH);
  return [
    `<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />`,
    `<meta property="og:locale" content="${LOCALE}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
    `<meta property="og:title" content="${escapeHtml(meta.ogTitle)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    `<meta property="og:image:secure_url" content="${escapeHtml(image)}" />`,
    `<meta property="og:image:type" content="image/png" />`,
    `<meta property="og:image:width" content="${String(OG_IMAGE_WIDTH)}" />`,
    `<meta property="og:image:height" content="${String(OG_IMAGE_HEIGHT)}" />`,
    `<meta property="og:image:alt" content="${escapeHtml(SITE_NAME)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(meta.ogTitle)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
    `<meta name="twitter:image:alt" content="${escapeHtml(SITE_NAME)}" />`,
  ].join('\n    ');
}

/** Identity nodes shared by every public route. */
function organizationNodes(): readonly Record<string, unknown>[] {
  return [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      logo: {
        '@type': 'ImageObject',
        url: absoluteUrl('/web-app-manifest-512x512.png'),
        width: 512,
        height: 512,
      },
    },
    {
      '@type': 'BroadcastService',
      '@id': `${SITE_URL}/#station`,
      name: SITE_NAME,
      alternateName: 'La Voz Verdad',
      url: `${SITE_URL}/`,
      description: HOME_DESCRIPTION,
      broadcastDisplayName: SITE_NAME,
      areaServed: { '@type': 'Country', name: 'Colombia' },
      parentOrganization: { '@id': `${SITE_URL}/#organization` },
      hasBroadcastChannel: {
        '@type': 'RadioService',
        serviceType: 'Internet radio',
        serviceUrl: STREAM_URL,
        channel: {
          '@type': 'RadioChannel',
          name: SITE_NAME,
          medium: 'https://schema.org/HttpBroadcastChannel',
        },
      },
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      inLanguage: 'es-CO',
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
  ];
}

const PAGE_NODE_TYPE: Readonly<Record<RouteKind, string>> = {
  home: 'WebPage',
  schedule: 'ItemList',
  about: 'AboutPage',
  feedback: 'ContactPage',
  legal: 'WebPage',
};

/**
 * JSON-LD graph for a route. The stream URL is deliberately left out of the
 * home node's audio field: BroadcastService is not a Google rich-result type,
 * so the graph exists for entity understanding, not for a player button.
 */
export function buildJsonLd(route: PublicRoute): string {
  const meta = ROUTE_META[route];
  const canonical = canonicalUrl(route);
  const pageNode: Record<string, unknown> = {
    '@type': PAGE_NODE_TYPE[meta.kind],
    '@id': `${canonical}#page`,
    name: meta.title,
    description: meta.description,
    url: canonical,
    inLanguage: 'es-CO',
    isPartOf: { '@id': `${SITE_URL}/#website` },
    about: { '@id': `${SITE_URL}/#station` },
    image: absoluteUrl(DEFAULT_OG_IMAGE_PATH),
  };

  if (route === '/programacion') {
    // The weekly grid is fetched at runtime, so the list is declared empty
    // rather than baked with data that would go stale on every build.
    pageNode.itemListElement = [];
  }

  return JSON.stringify(
    { '@context': 'https://schema.org', '@graph': [...organizationNodes(), pageNode] },
    null,
    2,
  );
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Sitemap covering the public routes only. Generated at build time rather than
 * shipped from public/ so `lastmod` carries the real deploy date instead of a
 * hardcoded one that would silently go stale.
 */
export function buildSitemapXml(lastModified: Date): string {
  const lastmod = lastModified.toISOString().slice(0, 10);
  const ordered = [...PUBLIC_ROUTES].sort(
    (a, b) => ROUTE_META[b].priority - ROUTE_META[a].priority,
  );

  const entries = ordered.map((route) => {
    const meta = ROUTE_META[route];
    return [
      '  <url>',
      `    <loc>${escapeXml(canonicalUrl(route))}</loc>`,
      `    <lastmod>${lastmod}</lastmod>`,
      `    <changefreq>${meta.changefreq}</changefreq>`,
      `    <priority>${meta.priority.toFixed(1)}</priority>`,
      '  </url>',
    ].join('\n');
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    '</urlset>',
    '',
  ].join('\n');
}
