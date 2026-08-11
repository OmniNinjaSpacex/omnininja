const HTML_ERROR_PATTERN = /<!doctype|<\/?(?:html|head|body|script|style)\b/i;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

export function safePublicApiError(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const message = value.trim();
  if (
    !message ||
    message.length > 240 ||
    HTML_ERROR_PATTERN.test(message) ||
    CONTROL_CHARACTER_PATTERN.test(message)
  ) {
    return fallback;
  }
  return message;
}

export async function readPublicApiError(
  response: Response,
  fallback: string,
): Promise<string> {
  const contentType = response.headers.get('content-type')?.toLowerCase() || '';
  if (!contentType.includes('application/json')) return fallback;

  const payload = await response.json().catch(() => null) as { error?: unknown } | null;
  return safePublicApiError(payload?.error, fallback);
}
