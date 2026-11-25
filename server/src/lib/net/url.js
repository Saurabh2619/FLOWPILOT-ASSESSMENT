import { isIP } from 'node:net';
import { FetchError } from './errors.js';

const INTERNAL_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa'];

const invalid = (message) => new FetchError('invalid_url', message);

// Returns a normalised URL, or throws when the address is not a public web page.
// This checks the text only; the resolved IP address is checked when connecting.
export function parseWebUrl(input, { allowedPorts = ['', '80', '443'] } = {}) {
  const text = String(input ?? '').trim();
  if (!text || text.length > 2000) throw invalid('Enter a website URL');

  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    throw invalid('This is not a valid URL');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw invalid('Only http and https URLs are supported');
  }
  if (url.username || url.password) throw invalid('URLs with a username or password are not allowed');
  if (!allowedPorts.includes(url.port)) throw invalid('Only the standard web ports are allowed');

  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!isIP(host)) {
    if (!host.includes('.') || INTERNAL_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
      throw invalid('Enter a public domain name, such as example.com');
    }
  }

  url.hash = '';
  return url;
}
