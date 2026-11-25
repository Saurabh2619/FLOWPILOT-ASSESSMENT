import http from 'node:http';
import { afterAll, beforeAll } from 'vitest';
import { createFetcher } from '../../src/lib/net/fetcher.js';

// A throwaway local website. `routes` maps a path to a handler or a response
// object. The returned fetcher is allowed to reach this server and nothing else
// private: only the loopback address and its port are opened.
export function useLocalSite(routes) {
  const site = { routes, hits: [] };
  const server = http.createServer((req, res) => {
    site.hits.push(req.url);
    const route = site.routes[req.url];
    if (typeof route === 'function') return route(req, res);
    const { status = 200, headers = {}, body = '' } = route ?? { status: 404, body: 'missing' };
    res.writeHead(status, { 'content-type': 'text/html', ...headers });
    res.end(body);
  });

  beforeAll(async () => {
    await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
    site.port = String(server.address().port);
    site.origin = `http://127.0.0.1:${site.port}`;
    site.createFetcher = (options = {}) =>
      createFetcher({
        isAddressAllowed: (address) => address === '127.0.0.1',
        allowedPorts: [site.port],
        ...options,
      });
  });

  afterAll(() => {
    server.closeAllConnections();
    server.close();
  });

  return site;
}
