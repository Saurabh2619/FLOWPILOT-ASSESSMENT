import robotsParser from 'robots-parser';
import { AuditError } from './errors.js';

const ROBOTS_AGENT = 'FlowPilotBot';
const MAX_ROBOTS_BYTES = 500 * 1024;

export function createRobots(fetcher) {
  const cache = new Map();

  async function load(origin) {
    const robotsUrl = `${origin}/robots.txt`;
    const response = await fetcher(robotsUrl, { maxBytes: MAX_ROBOTS_BYTES });

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
