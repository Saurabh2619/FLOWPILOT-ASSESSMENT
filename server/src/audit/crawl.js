import { AuditError } from './errors.js';
import { parsePage } from './parse-page.js';
import { createRobots } from './robots.js';

const MAX_INTERNAL_PAGES = 5;
const MAX_LINK_CHECKS = 10;
const CRAWL_BUDGET_MS = 90 * 1000;

function assertAuditable(response) {
  const { status, headers } = response;
  if (status === 401 || status === 403) {
    throw new AuditError(`The website blocked the audit (status ${status})`);
  }
  if (status === 429 || status >= 500) {
    throw new AuditError(`The website responded with status ${status}`, { transient: true });
  }
  if (status >= 400) throw new AuditError(`The website responded with status ${status}`);
  if (!/html/i.test(headers['content-type'] ?? '')) {
    throw new AuditError('The website did not return an HTML page');
  }
}

function toPage(response) {
  return {
    url: response.url,
    status: response.status,
    responseTimeMs: response.responseTimeMs,
    bytes: response.bytes,
    truncated: response.truncated,
    compressed: Boolean(response.headers['content-encoding']),
    ...parsePage(response.body, response.url),
  };
}

async function hasSitemap(origin, declared, fetcher, robots) {
  for (const url of [...declared.slice(0, 2), `${origin}/sitemap.xml`]) {
    try {
      const response = await fetcher(url, {
        beforeRequest: robots.assertAllowed,
        maxBytes: 64 * 1024,
      });
      const isXml = /<(urlset|sitemapindex)[\s>]/i.test(response.body);
      if (response.status === 200 && (isXml || url.endsWith('.gz'))) return true;
    } catch {
      continue;
    }
  }
  return false;
}

export async function crawlSite(startUrl, { fetcher, budgetMs = CRAWL_BUDGET_MS }) {
  const deadline = Date.now() + budgetMs;
  const robots = createRobots(fetcher);
  const request = (url) => fetcher(url, { beforeRequest: robots.assertAllowed });

  const homeResponse = await request(startUrl);
  assertAuditable(homeResponse);
  const home = toPage(homeResponse);

  const { origin, protocol } = new URL(home.url);
  const { found: robotsFound, rules } = await robots.forOrigin(origin);
  const sitemapFound = await hasSitemap(origin, rules.getSitemaps(), fetcher, robots);

  const pages = [home];
  const brokenLinks = [];
  let checkedLinks = 0;
  const seen = new Set([home.url, startUrl]);

  for (const link of home.links) {
    if (Date.now() > deadline || checkedLinks >= MAX_LINK_CHECKS) break;
    if (seen.has(link)) continue;
    seen.add(link);

    try {
      const response = await request(link);
      checkedLinks += 1;
      if (response.status >= 400 && ![401, 403, 429].includes(response.status)) {
        brokenLinks.push({ url: link, status: response.status });
      } else if (
        pages.length <= MAX_INTERNAL_PAGES &&
        response.status < 400 &&
        /html/i.test(response.headers['content-type'] ?? '') &&
        new URL(response.url).origin === origin &&
        !pages.some((page) => page.url === response.url)
      ) {
        pages.push(toPage(response));
      }
    } catch (error) {
      if (error.code === 'robots_disallowed') continue;
      checkedLinks += 1;
      brokenLinks.push({ url: link, status: null });
    }
  }

  return {
    url: home.url,
    https: protocol === 'https:',
    hsts: Boolean(homeResponse.headers['strict-transport-security']),
    robotsTxt: robotsFound,
    sitemap: sitemapFound,
    pages: pages.map(({ links, ...page }) => ({ ...page, internalLinkCount: links.length })),
    checkedLinks,
    brokenLinks,
  };
}
