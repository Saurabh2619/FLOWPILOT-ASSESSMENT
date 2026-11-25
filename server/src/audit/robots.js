import robotsParser from 'robots-parser';
import { AuditError } from './errors.js';

const ROBOTS_AGENT = 'FlowPilotBot';
const MAX_ROBOTS_BYTES = 500 * 1024;

// Reads robots.txt once per origin and answers whether a URL may be fetched.
export function createRobots(fetcher) {
  const cache = new Map();

  async function load(origin) {
    const robotsUrl = `${origin}/robots.txt`;
    const response = await fetcher(robotsUrl, { maxBytes: MAX_ROBOTS_BYTES });

    // RFC 9309: a server error means "do not crawl", a missing file allows all.
    if (response.status >= 500) {
      throw new AuditError(`robots.txt returned status ${response.status}`, { transient: true });
    }
    const isText = !/text\/html/i.test(response.headers['content-type'] ?? '');
    const found = response.status === 200 && isText;
    const rules = robotsParser(robotsUrl, found ? response.body : '');
    return { found, rules };
  }

  function forOrigin(origin) {
    if (!cache.has(origin)) cache.set(origin, load(origin));
    return cache.get(origin);
  }

  return {
    forOrigin,
    // Passed to the fetcher, so it also applies to every redirect.
    async assertAllowed(url) {
      const { rules } = await forOrigin(url.origin);
      if (rules.isAllowed(url.toString(), ROBOTS_AGENT) === false) {
        throw new AuditError('robots.txt does not allow this page to be audited', {
          code: 'robots_disallowed',
        });
      }
    },
  };
}
