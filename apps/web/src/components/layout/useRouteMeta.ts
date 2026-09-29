import { useEffect } from 'react';
import { useLocation } from 'react-router';
import {
  ROUTE_META,
  buildJsonLd,
  canonicalUrl,
  isPublicRoute,
  normalizePathname,
  type PublicRoute,
} from '@/config/seo.config';

/**
 * Keeps the live document head in step with SPA navigation.
 *
 * The build bakes correct tags into dist/<route>/index.html, so a hard load
 * already arrives with the right metadata. This only matters when a visitor
 * reaches a route through client-side navigation and then shares the URL: the
 * document would otherwise still be labelled as the previous page.
 */

function upsertHeadTag(
  selector: string,
  create: (value: string) => Element,
  value: string,
  apply: (element: Element, value: string) => void,
): void {
  const existing = document.head.querySelector(selector);
  const element = existing ?? create(value);
  apply(element, value);
  if (existing === null) {
    document.head.appendChild(element);
  }
}

function setNamedMeta(name: string, content: string): void {
  upsertHeadTag(
    `meta[name="${name}"]`,
    (value) => {
      const meta = document.createElement('meta');
      meta.setAttribute('name', name);
      meta.setAttribute('content', value);
      return meta;
    },
    content,
    (element, value) => element.setAttribute('content', value),
  );
}

function setPropertyMeta(property: string, content: string): void {
  upsertHeadTag(
    `meta[property="${property}"]`,
    (value) => {
      const meta = document.createElement('meta');
      meta.setAttribute('property', property);
      meta.setAttribute('content', value);
      return meta;
    },
    content,
    (element, value) => element.setAttribute('content', value),
  );
}

function setCanonical(href: string): void {
  upsertHeadTag(
    'link[rel="canonical"]',
    (value) => {
      const link = document.createElement('link');
      link.setAttribute('rel', 'canonical');
      link.setAttribute('href', value);
      return link;
    },
    href,
    (element, value) => element.setAttribute('href', value),
  );
}

function setJsonLd(json: string): void {
  const selector = 'script[type="application/ld+json"]';
  const existing = document.head.querySelector(selector);
  if (existing !== null) {
    existing.textContent = json;
  }
}

function applyRouteMeta(route: PublicRoute): void {
  const meta = ROUTE_META[route];
  const canonical = canonicalUrl(route);

  document.title = meta.title;
  setNamedMeta('description', meta.description);
  setCanonical(canonical);

  setPropertyMeta('og:url', canonical);
  setPropertyMeta('og:title', meta.ogTitle);
  setPropertyMeta('og:description', meta.description);

  setNamedMeta('twitter:title', meta.ogTitle);
  setNamedMeta('twitter:description', meta.description);

  setJsonLd(buildJsonLd(route));
}

export function useRouteMeta(): void {
  const { pathname } = useLocation();
  const route = normalizePathname(pathname);

  useEffect(() => {
    if (isPublicRoute(route)) {
      applyRouteMeta(route);
    }
  }, [route]);
}
