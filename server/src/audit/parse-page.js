import * as cheerio from 'cheerio';

const ASSET_PATH =
  /\.(?:jpe?g|png|gif|webp|avif|svg|ico|pdf|zip|gz|mp4|mp3|webm|css|js|json|xml|txt|docx?|xlsx?|pptx?|woff2?)$/i;

const clean = (text, max = 300) => (text ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

function structuredDataTypes($) {
  const types = new Set();
  const collect = (node) => {
    if (Array.isArray(node)) node.forEach(collect);
    else if (node && typeof node === 'object') {
      [node['@type']].flat().forEach((type) => typeof type === 'string' && types.add(type));
      Object.values(node).forEach(collect);
    }
  };

  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      collect(JSON.parse($(element).text()));
    } catch {
      return;
    }
  });
  $('[itemtype*="schema.org"]').each((_, element) => {
    const type = $(element).attr('itemtype').split('/').pop();
    if (type) types.add(type);
  });

  return [...types].slice(0, 20).map((type) => clean(type, 60));
}

function internalLinks($, pageUrl) {
  const page = new URL(pageUrl);
  const links = new Set();

  $('a[href]').each((_, element) => {
    let url;
    try {
      url = new URL($(element).attr('href'), page);
    } catch {
      return;
    }
    if (url.origin !== page.origin || ASSET_PATH.test(url.pathname)) return;
    url.hash = '';
    if (url.toString() !== page.toString()) links.add(url.toString());
  });

  return [...links];
}

export function parsePage(html, pageUrl) {
  const $ = cheerio.load(html);
  const structuredData = structuredDataTypes($);
  const links = internalLinks($, pageUrl);

  const images = $('img');
  const imagesMissingAlt = images.filter((_, element) => $(element).attr('alt') === undefined);

  $('script, style, noscript, template, svg').remove();
  const words = $('body').text().split(/\s+/).filter(Boolean).length;

  return {
    title: clean($('head title').first().text() || $('title').first().text()),
    metaDescription: clean($('meta[name="description" i]').attr('content'), 500),
    h1: $('h1')
      .map((_, element) => clean($(element).text(), 150))
      .get()
      .slice(0, 5),
    h1Count: $('h1').length,
    subheadingCount: $('h2, h3').length,
    imageCount: images.length,
    imagesMissingAlt: imagesMissingAlt.length,
    hasLang: Boolean($('html').attr('lang')?.trim()),
    hasViewport: $('meta[name="viewport" i]').length > 0,
    wordCount: words,
    structuredData,
    links,
  };
}
