import { CATEGORY_WEIGHTS, PAGE_RULES, SITE_RULES } from './rules.js';

const IMAGE_ALT_PENALTY = 40;
const DUPLICATE_TITLE_PENALTY = 10;
const BROKEN_LINK_PENALTY = 50;
const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };

function issue(rule, share, affected) {
  const { id, category, severity, message, recommendation } = rule;
  return {
    id,
    category,
    severity,
    message,
    recommendation,
    penalty: Math.max(1, Math.round(rule.penalty * share)),
    affected: affected.slice(0, 10),
  };
}

function pageIssues(pages) {
  return PAGE_RULES.flatMap((rule) => {
    const affected = pages.filter(rule.test).map((page) => page.url);
    return affected.length ? [issue(rule, affected.length / pages.length, affected)] : [];
  });
}

function imageIssue(pages) {
  const total = pages.reduce((sum, page) => sum + page.imageCount, 0);
  const missing = pages.reduce((sum, page) => sum + page.imagesMissingAlt, 0);
  if (!missing) return [];
  const rule = {
    id: 'image-alt-missing',
    category: 'accessibility',
    severity: missing / total > 0.25 ? 'high' : 'medium',
    penalty: IMAGE_ALT_PENALTY,
    message: `${missing} of ${total} images have no alt attribute`,
    recommendation: 'Describe each meaningful image with alt text; use alt="" for decoration.',
  };
  const affected = pages.filter((page) => page.imagesMissingAlt).map((page) => page.url);
  return [issue(rule, missing / total, affected)];
}

function duplicateTitleIssue(pages) {
  const byTitle = Map.groupBy(
    pages.filter((page) => page.title),
    (page) => page.title,
  );
  const affected = [...byTitle.values()].filter((group) => group.length > 1).flat();
  if (!affected.length) return [];
  const rule = {
    id: 'title-duplicate',
    category: 'seo',
    severity: 'medium',
    penalty: DUPLICATE_TITLE_PENALTY,
    message: 'Several pages share the same title',
    recommendation: 'Write a distinct title for each page.',
  };
  return [issue(rule, 1, affected.map((page) => page.url))];
}

function brokenLinkIssue({ brokenLinks, checkedLinks }) {
  if (!brokenLinks.length) return [];
  const rule = {
    id: 'links-broken',
    category: 'technical',
    severity: 'high',
    penalty: BROKEN_LINK_PENALTY,
    message: `${brokenLinks.length} of ${checkedLinks} checked internal links are broken`,
    recommendation: 'Fix or remove links that lead to errors.',
  };
  const affected = brokenLinks.map((link) => link.url);
  return [issue(rule, brokenLinks.length / checkedLinks, affected)];
}

// Deterministic: the same crawl always gives the same report.
export function scoreCrawl(crawl) {
  const issues = [
    ...SITE_RULES.filter((rule) => rule.test(crawl)).map((rule) => issue(rule, 1, [crawl.url])),
    ...pageIssues(crawl.pages),
    ...imageIssue(crawl.pages),
    ...duplicateTitleIssue(crawl.pages),
    ...brokenLinkIssue(crawl),
  ].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.penalty - a.penalty);

  const categoryScores = {};
  let overall = 0;
  for (const [category, weight] of Object.entries(CATEGORY_WEIGHTS)) {
    const lost = issues
      .filter((found) => found.category === category)
      .reduce((sum, found) => sum + found.penalty, 0);
    categoryScores[category] = Math.max(0, 100 - lost);
    overall += categoryScores[category] * weight;
  }

  return { overallScore: Math.round(overall), categoryScores, issues };
}
