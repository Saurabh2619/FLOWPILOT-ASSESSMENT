import { BlockList, isIP } from 'node:net';

const blockedV4 = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], // "this" network
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, includes cloud metadata
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.88.99.0', 24], // 6to4 relay
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved and broadcast
]) {
  blockedV4.addSubnet(network, prefix, 'ipv4');
}

// For IPv6 only global unicast is allowed, which already excludes loopback,
// link-local, unique-local, multicast and IPv4-mapped addresses.
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');

const blockedV6 = new BlockList();
for (const [network, prefix] of [
  ['2001::', 23], // protocol assignments, includes Teredo
  ['2001:db8::', 32], // documentation
  ['2002::', 16], // 6to4, can wrap a private IPv4 address
  ['3fff::', 20], // documentation
]) {
  blockedV6.addSubnet(network, prefix, 'ipv6');
}

export function isPublicAddress(address) {
  const family = isIP(address);
  if (family === 4) return !blockedV4.check(address, 'ipv4');
  if (family === 6) {
    return globalV6.check(address, 'ipv6') && !blockedV6.check(address, 'ipv6');
  }
  return false;
}
