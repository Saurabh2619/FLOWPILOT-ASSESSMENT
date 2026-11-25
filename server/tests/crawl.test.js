import { describe, expect, it } from 'vitest';
import { crawlSite } from '../src/audit/crawl.js';
import { parsePage } from '../src/audit/parse-page.js';
import { useLocalSite } from './helpers/site.js';

const page = (body, head = '') => ({
  body: `<!doctype html><html lang="en"><head>${head}</head><body>${body}</body></html>`,
});
const links = (...paths) => paths.map((path) => `<a href="${path}">${path}</a>`).join('');
const text = (body, type = 'text/plain') => ({ headers: { 'content-type': type }, body });

const site = useLocalSite({});

function serve(routes) {
  site.routes = routes;
  site.hits.length = 0;
}
const crawl = () => crawlSite(`${site.origin}/`, { fetcher: site.createFetcher() });

describe('parsePage', () => {
  const html = `<html lang="en"><head><title> My  Site </title>
    <meta name="Description" content="About us">
    <meta name="viewport" content="width=device-width">
    <script type="application/ld+json">{"@graph":[{"@type":"Organization"}]}</script>
    <script type="application/ld+json">{broken</script></head>
    <body><h1>Hello</h1><h2>More</h2>
    <img src="a.png"><img src="b.png" alt=""><img src="c.png" alt="C">
    <a href="/about#team">About</a><a href="/about">Again</a><a href="/file.pdf">PDF</a>
    <a href="https://other.example.com/">Out</a><a href="mailto:a@b.co">Mail</a>
    <p>one two three</p><script>var ignored = 1;</script></body></html>`;
  const facts = parsePage(html, 'https://example.com/');

  it('reads head and heading facts', () => {
    expect(facts).toMatchObject({
      title: 'My Site',
      metaDescription: 'About us',
      h1: ['Hello'],
      h1Count: 1,
      subheadingCount: 1,
      hasLang: true,
      hasViewport: true,
      structuredData: ['Organization'],
    });
  });

  it('counts only images without an alt attribute', () => {
    expect(facts).toMatchObject({ imageCount: 3, imagesMissingAlt: 1 });
  });

  it('keeps unique internal page links', () => {
    expect(facts.links).toEqual(['https://example.com/about']);
  });

  it('does not count script text as words', () => {
    expect(facts.wordCount).toBeLessThan(15);
  });

  it('limits the length of site supplied text', () => {
    const long = parsePage(`<title>${'a'.repeat(5000)}</title>`, 'https://example.com/');
    expect(long.title).toHaveLength(300);
  });
});

describe('crawlSite', () => {
  it('audits the home page and at most five internal pages', async () => {
    const paths = Array.from({ length: 14 }, (_, i) => `/p${i}`);
    serve({
      '/': page(links(...paths)),
      ...Object.fromEntries(paths.map((path) => [path, page('ok')])),
    });
    const result = await crawl();
    expect(result.pages).toHaveLength(6);
    expect(result.checkedLinks).toBe(10);
  });

  it('records broken links without failing the audit', async () => {
    serve({ '/': page(links('/ok', '/missing', '/locked')), '/ok': page('ok'), '/locked': { status: 403 } });
    const result = await crawl();
    expect(result.brokenLinks).toEqual([{ url: `${site.origin}/missing`, status: 404 }]);
    expect(result.pages).toHaveLength(2);
  });

  it('notes robots.txt and the sitemap', async () => {
    serve({
      '/': page('hi'),
      '/robots.txt': text(`User-agent: *\nSitemap: ${'/'}map.xml`),
      '/sitemap.xml': text('<urlset></urlset>', 'application/xml'),
    });
    expect(await crawl()).toMatchObject({ robotsTxt: true, sitemap: true, https: false });
  });

  it('reports a missing robots.txt and sitemap', async () => {
    serve({ '/': page('hi') });
    expect(await crawl()).toMatchObject({ robotsTxt: false, sitemap: false });
  });

  it('never requests pages that robots.txt disallows', async () => {
    serve({
      '/': page(links('/open', '/secret')),
      '/open': page('ok'),
      '/secret': page('no'),
      '/robots.txt': text('User-agent: FlowPilotBot\nDisallow: /secret'),
    });
    const result = await crawl();
    expect(site.hits).not.toContain('/secret');
    expect(result.brokenLinks).toEqual([]);
  });

  it('fails when robots.txt disallows the home page', async () => {
    serve({ '/': page('hi'), '/robots.txt': text('User-agent: *\nDisallow: /') });
    await expect(crawl()).rejects.toMatchObject({ code: 'robots_disallowed', transient: false });
    expect(site.hits).toEqual(['/robots.txt']);
  });

  it('applies robots.txt to redirect targets', async () => {
    serve({
      '/': { status: 302, headers: { location: '/hidden' } },
      '/hidden': page('no'),
      '/robots.txt': text('User-agent: *\nDisallow: /hidden'),
    });
    await expect(crawl()).rejects.toMatchObject({ code: 'robots_disallowed' });
    expect(site.hits).not.toContain('/hidden');
  });

  it.each([
    [403, false],
    [404, false],
    [429, true],
    [503, true],
  ])('fails on home page status %i (retry: %s)', async (status, transient) => {
    serve({ '/': { status } });
    await expect(crawl()).rejects.toMatchObject({ name: 'AuditError', transient });
  });

  it('fails when the home page is not HTML', async () => {
    serve({ '/': text('{}', 'application/json') });
    await expect(crawl()).rejects.toThrow(/HTML/);
  });

  it('treats a robots.txt server error as a temporary block', async () => {
    serve({ '/': page('hi'), '/robots.txt': { status: 500 } });
    await expect(crawl()).rejects.toMatchObject({ transient: true });
  });
});
