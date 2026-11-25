import { crawlSite } from './crawl.js';
import { scoreCrawl } from './score.js';

export async function runAudit(url, dependencies) {
  const crawl = await crawlSite(url, dependencies);
  const { pages, brokenLinks, ...site } = crawl;
  return { ...scoreCrawl(crawl), site, pages, brokenLinks };
}
