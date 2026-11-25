import zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { USER_AGENT } from '../src/lib/net/fetcher.js';
import { useLocalSite } from './helpers/site.js';

const redirect = (location) => ({ status: 302, headers: { location } });

const site = useLocalSite({
  '/': { body: '<h1>hello</h1>' },
  '/agent': (req, res) => res.end(req.headers['user-agent']),
  '/gzip': (req, res) => {
    res.writeHead(200, { 'content-encoding': 'gzip' });
    res.end(zlib.gzipSync('a'.repeat(5000)));
  },
  '/big': { body: 'x'.repeat(5000) },
  '/hop': redirect('/'),
  '/loop': redirect('/loop'),
  '/to-metadata': redirect('http://169.254.169.254/'),
  '/to-private': redirect('http://10.0.0.1/'),
  '/to-file': redirect('file:///etc/passwd'),
  '/slow': () => {},
});

const get = (path, options, requestOptions) =>
  site.createFetcher(options)(`${site.origin}${path}`, requestOptions);

describe('fetcher', () => {
  it('returns status, body and timing', async () => {
    const res = await get('/');
    expect(res).toMatchObject({ status: 200, body: '<h1>hello</h1>', redirects: 0 });
    expect(res.responseTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('identifies itself', async () => {
    expect((await get('/agent')).body).toBe(USER_AGENT);
  });

  it('decompresses the response', async () => {
    expect((await get('/gzip')).bytes).toBe(5000);
  });

  it('caps the body size, including decompressed data', async () => {
    for (const path of ['/big', '/gzip']) {
      const res = await get(path, { maxBytes: 1000 });
      expect(res).toMatchObject({ bytes: 1000, truncated: true });
    }
  });

  it('follows redirects and reports the final URL', async () => {
    expect(await get('/hop')).toMatchObject({ url: `${site.origin}/`, redirects: 1 });
  });

  it('stops after too many redirects', async () => {
    await expect(get('/loop')).rejects.toMatchObject({ code: 'too_many_redirects' });
  });

  it.each([
    ['/to-metadata', 'invalid_url'],
    ['/to-private', 'invalid_url'],
    ['/to-file', 'invalid_url'],
  ])('re-checks the redirect target of %s', async (path, code) => {
    await expect(get(path)).rejects.toMatchObject({ code });
  });

  it('blocks a redirect to a private address on an allowed port', async () => {
    site.routes['/to-internal'] = redirect(`http://127.0.0.2:${site.port}/`);
    await expect(get('/to-internal')).rejects.toMatchObject({ code: 'blocked_address' });
  });

  it('times out as a transient failure', async () => {
    await expect(get('/slow', { timeoutMs: 200 })).rejects.toMatchObject({
      code: 'timeout',
      transient: true,
    });
  });

  it('lets the caller veto each request', async () => {
    const beforeRequest = (url) => {
      if (url.pathname === '/') throw Object.assign(new Error('no'), { code: 'ECONNRESET' });
    };
    await expect(get('/hop', {}, { beforeRequest })).rejects.toThrow();
  });
});
