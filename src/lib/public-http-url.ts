import { isIP } from 'node:net';

function isPrivateIPv4(hostname: string): boolean {
  const octets = hostname.split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }

  const [first, second] = octets;
  return first === 0 || first === 10 || first === 127 || first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19));
}

export function isPrivateHostname(value: string): boolean {
  const hostname = value.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    return true;
  }

  const ipVersion = isIP(hostname);
  if (ipVersion === 4) return isPrivateIPv4(hostname);
  if (ipVersion === 6) {
    const normalized = hostname.toLowerCase();
    return normalized === '::' || normalized === '::1' ||
      normalized.startsWith('fc') || normalized.startsWith('fd') ||
      /^fe[89ab]/.test(normalized) ||
      normalized.startsWith('::ffff:127.') ||
      normalized.startsWith('::ffff:10.') ||
      normalized.startsWith('::ffff:192.168.') ||
      normalized.startsWith('::ffff:169.254.');
  }

  return false;
}

export function validatePublicHttpUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('URL inválida');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('URL precisa usar http ou https');
  }
  if (url.username || url.password) throw new Error('URL com credenciais não é permitida');
  if (isPrivateHostname(url.hostname)) throw new Error('Destino de rede privado não é permitido');
  return url.toString();
}

