import { describe, expect, it } from 'vitest';
import { CATEGORY_WEIGHTS } from '../src/audit/rules.js';
import { scoreCrawl } from '../src/audit/score.js';

const goodPage = (overrides = {}) => ({
  url: 'https://example.com/',
  title: 'A perfectly sized title',
  metaDescription: 'A description that is long enough to be useful to a search engine user.',
  responseTimeMs: 200,
  bytes: 20000,
  truncated: false,
  compressed: true,
  h1Count: 1,
  subheadingCount: 3,
  imageCount: 4,
  imagesMissingAlt: 0,
  hasLang: true,
  hasViewport: true,
  wordCount: 500,
  structuredData: ['Organization'],
  ...overrides,
});

const goodCrawl = (overrides = {}) => ({
  url: 'https://example.com/',
  https: true,
  hsts: true,
  robotsTxt: true,
  sitemap: true,
  pages: [goodPage()],
  checkedLinks: 4,
  brokenLinks: [],
  ...overrides,
});

const ids = (report) => report.issues.map((issue) => issue.id);

describe('scoring', () => {
  it('uses weights that add up to one', () => {
    const total = Object.values(CATEGORY_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
    expect(total).toBeCloseTo(1);
  });

  it('gives a clean site full marks', () => {
    const report = scoreCrawl(goodCrawl());
    expect(report.overallScore).toBe(100);
    expect(report.issues).toEqual([]);
  });

  it('flags missing site features', () => {
    const report = scoreCrawl(
      goodCrawl({
        https: false,
        robotsTxt: false,
        sitemap: false,
        pages: [goodPage({ structuredData: [] })],
      }),
    );
    expect(ids(report)).toEqual(
      expect.arrayContaining([
        'https-missing',
        'robots-missing',
        'sitemap-missing',
        'structured-data-missing',
      ]),
    );
    expect(report.categoryScores).toMatchObject({ technical: 40, seo: 70, content: 100 });
  });

  it('scales a page problem by the share of pages affected', () => {
    const pages = [goodPage(), goodPage({ url: 'https://example.com/b', title: '' })];
    const [found] = scoreCrawl(goodCrawl({ pages })).issues;
    expect(found).toMatchObject({
      id: 'title-missing',
      penalty: 18,
      affected: ['https://example.com/b'],
    });
  });

  it('scores image alt text by the share of images missing it', () => {
    const report = scoreCrawl(goodCrawl({ pages: [goodPage({ imagesMissingAlt: 2 })] }));
    expect(report.categoryScores.accessibility).toBe(80);
  });

  it('reports duplicate titles and broken links', () => {
    const pages = [goodPage(), goodPage({ url: 'https://example.com/b' })];
    const brokenLinks = [{ url: 'https://example.com/x', status: 404 }];
    const report = scoreCrawl(goodCrawl({ pages, brokenLinks }));
    expect(ids(report)).toEqual(expect.arrayContaining(['title-duplicate', 'links-broken']));
  });

  it('never goes below zero and lists severe issues first', () => {
    const awful = goodPage({
      title: '',
      metaDescription: '',
      responseTimeMs: 9000,
      bytes: 3_000_000,
      compressed: false,
      h1Count: 0,
      wordCount: 5,
      hasLang: false,
      hasViewport: false,
      imagesMissingAlt: 4,
      structuredData: [],
    });
    const report = scoreCrawl(
      goodCrawl({ https: false, robotsTxt: false, sitemap: false, pages: [awful] }),
    );
    for (const score of Object.values(report.categoryScores)) {
      expect(score).toBeGreaterThanOrEqual(0);
    }
    expect(report.overallScore).toBeLessThan(30);
    expect(report.issues[0].severity).toBe('high');
    expect(report.issues.at(-1).severity).toBe('low');
  });
});
