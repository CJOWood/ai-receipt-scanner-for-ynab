export const ipToInt = (ip: string): bigint => {
  const parts = ip.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) {
    throw new Error(`Invalid IP address: ${ip}`);
  }
  return parts.reduce((acc, part) => (acc << 8n) + BigInt(part), 0n);
};

export const ipInRange = (ip: string, start: string, end: string): boolean => {
  const ipInt = ipToInt(ip);
  return ipInt >= ipToInt(start) && ipInt <= ipToInt(end);
};

export const ipInCidr = (ip: string, cidr: string): boolean => {
  const [range, bitsStr] = cidr.split('/');
  const bits = parseInt(bitsStr || '32', 10);
  const mask = bits === 0 ? 0n : (~0n << BigInt(32 - bits)) & 0xffffffffn;
  return (ipToInt(ip) & mask) === (ipToInt(range) & mask);
};
