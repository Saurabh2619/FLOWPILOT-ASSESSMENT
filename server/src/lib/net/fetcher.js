import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import zlib from 'node:zlib';
import { isPublicAddress } from './address.js';
import { FetchError } from './errors.js';
import { parseWebUrl } from './url.js';

export const USER_AGENT = 'FlowPilotBot/1.0 (website audit)';

const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);
const DECODERS = {
  gzip: zlib.createGunzip,
  deflate: zlib.createInflate,
  br: zlib.createBrotliDecompress,
};
const TRANSIENT_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EAI_AGAIN',
]);

const blocked = () =>
  new FetchError('blocked_address', 'This address points to a private or reserved network');

function toFetchError(error) {
  if (error instanceof FetchError) return error;
  if (error.name === 'AbortError' || error.name === 'TimeoutError') {
    return new FetchError('timeout', 'The website took too long to respond', { transient: true });
  }
  if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
    return new FetchError('dns_not_found', 'This domain does not exist');
  }
  if (/CERT|SSL|TLS/i.test(error.code ?? '')) {
    return new FetchError('tls_error', 'The website has an invalid SSL certificate');
  }
  return new FetchError('connection_failed', 'Could not connect to the website', {
    transient: TRANSIENT_CODES.has(error.code),
  });
}

// Outbound HTTP client that is safe to point at user supplied URLs:
// every hop is validated, DNS answers are checked at connection time (so a name
// cannot change between check and use), and size, time and redirects are capped.
// The address and port rules are parameters only so tests can use a local server.
export function createFetcher({
  isAddressAllowed = isPublicAddress,
  allowedPorts,
  resolve = dns.lookup,
  timeoutMs = 10000,
  maxBytes = 2 * 1024 * 1024,
  maxRedirects = 5,
} = {}) {
  function safeLookup(hostname, options, callback) {
    resolve(hostname, { ...options, all: true }, (error, addresses) => {
      if (error) return callback(error);
      // One private address among the answers is enough to refuse the name.
      if (!addresses.length || !addresses.every((entry) => isAddressAllowed(entry.address))) {
        return callback(blocked());
      }
      if (options.all) return callback(null, addresses);
      return callback(null, addresses[0].address, addresses[0].family);
    });
  }

  function requestOnce(url, signal, limit) {
    const host = url.hostname.replace(/^\[|\]$/g, '');
    // A literal IP address never goes through DNS, so it is checked here.
    if (isIP(host) && !isAddressAllowed(host)) return Promise.reject(blocked());

    return new Promise((done, fail) => {
      const started = performance.now();
      const client = url.protocol === 'https:' ? https : http;
      const request = client.request(url, {
        method: 'GET',
        agent: false,
        lookup: safeLookup,
        signal,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml,text/plain,*/*;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
        },
      });

      request.on('error', fail);
      request.on('response', (response) => {
        const responseTimeMs = Math.round(performance.now() - started);
        const { statusCode: status, headers } = response;

        if (REDIRECT_CODES.has(status) && headers.location) {
          response.destroy();
          done({ status, headers, redirectTo: headers.location });
          return;
        }

        const createDecoder = DECODERS[headers['content-encoding']];
        const stream = createDecoder ? response.pipe(createDecoder()) : response;
        const chunks = [];
        let bytes = 0;
        let finished = false;

        // The cap applies after decompression, which also stops compression bombs.
        const finish = (truncated) => {
          if (finished) return;
          finished = true;
          const body = Buffer.concat(chunks).toString('utf8');
          done({ status, headers, body, bytes, truncated, responseTimeMs });
          response.destroy();
        };

        stream.on('data', (chunk) => {
          if (finished) return;
          const room = limit - bytes;
          chunks.push(chunk.length > room ? chunk.subarray(0, room) : chunk);
          bytes += Math.min(chunk.length, room);
          if (chunk.length > room) finish(true);
        });
        stream.on('end', () => finish(false));
        stream.on('error', (error) => !finished && fail(error));
        response.on('error', (error) => !finished && fail(error));
        response.on('aborted', () => !finished && fail(Object.assign(new Error('aborted'), { code: 'ECONNRESET' })));
      });
      request.end();
    });
  }

  return async function safeFetch(input, { beforeRequest, maxBytes: limit = maxBytes } = {}) {
    let url = parseWebUrl(input, { allowedPorts });
    // One deadline covers all redirects and the body.
    const signal = AbortSignal.timeout(timeoutMs);

    try {
      for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
        if (beforeRequest) await beforeRequest(url);
        const result = await requestOnce(url, signal, limit);
        if (!result.redirectTo) return { ...result, url: url.toString(), redirects };
        url = parseWebUrl(new URL(result.redirectTo, url).toString(), { allowedPorts });
      }
      throw new FetchError('too_many_redirects', 'The website redirects too many times');
    } catch (error) {
      throw toFetchError(signal.aborted ? signal.reason : error);
    }
  };
}
