import { describe, expect, it } from 'vitest';
import { isPublicAddress } from '../src/lib/net/address.js';
import { createFetcher } from '../src/lib/net/fetcher.js';
import { parseWebUrl } from '../src/lib/net/url.js';

describe('isPublicAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '255.255.255.255',
    '::1',
    '::',
    'fe80::1',
    'fd00::1',
    'ff02::1',
    '::ffff:127.0.0.1',
    '::ffff:a9fe:a9fe',
    '64:ff9b::a9fe:a9fe',
    '2002:7f00:1::',
    '2001:db8::1',
    'not-an-ip',
  ])('blocks %s', (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each(['8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700:4700::1111'])('allows %s', (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });
});

describe('parseWebUrl', () => {
  it('adds https and drops the fragment', () => {
    expect(parseWebUrl(' Example.com/a#top ').toString()).toBe('https://example.com/a');
  });

  it.each([
    '',
    'ftp://example.com',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'https://user:pass@example.com',
    'https://example.com:8080',
    'http://localhost',
    'http://intranet',
    'http://printer.local',
    'http://metadata.google.internal',
    'http://exa mple.com',
  ])('rejects "%s"', (input) => {
    expect(() => parseWebUrl(input)).toThrow(expect.objectContaining({ code: 'invalid_url' }));
  });
});

describe('fetcher address checks', () => {
  const resolveTo =
    (...addresses) =>
    (hostname, options, callback) =>
      callback(
        null,
        addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })),
      );

  // Encoded forms of private addresses are normalised by the URL parser.
  it.each([
    'http://127.0.0.1',
    'http://2130706433',
    'http://0x7f.0.0.1',
    'http://[::1]',
    'http://[::ffff:169.254.169.254]',
    'http://169.254.169.254/latest/meta-data',
  ])('refuses %s', async (url) => {
    await expect(createFetcher()(url)).rejects.toMatchObject({ code: 'blocked_address' });
  });

  it('refuses a name that resolves to a private address', async () => {
    const fetcher = createFetcher({ resolve: resolveTo('10.0.0.5') });
    await expect(fetcher('http://rebind.example.com')).rejects.toMatchObject({
      code: 'blocked_address',
    });
  });

  it('refuses a name with any private address among its answers', async () => {
    const fetcher = createFetcher({ resolve: resolveTo('8.8.8.8', '127.0.0.1') });
    await expect(fetcher('http://mixed.example.com')).rejects.toMatchObject({
      code: 'blocked_address',
    });
  });

  it('reports a domain that does not exist', async () => {
    const resolve = (hostname, options, callback) =>
      callback(Object.assign(new Error('nope'), { code: 'ENOTFOUND' }));
    await expect(createFetcher({ resolve })('http://missing.example.com')).rejects.toMatchObject({
      code: 'dns_not_found',
      transient: false,
    });
  });
});
