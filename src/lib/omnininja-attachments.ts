export type OmniNinjaAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  dataUrl: string;
};

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_MESSAGE = 5;
const MAX_ATTACHMENT_DATA_URL_LENGTH = Math.ceil(MAX_ATTACHMENT_BYTES * 4 / 3) + 1024;

export function isImageAttachment(attachment: OmniNinjaAttachment): boolean {
  return attachment.mimeType.startsWith('image/');
}

export function normalizeOmniNinjaAttachments(value: unknown): OmniNinjaAttachment[] {
  if (!Array.isArray(value)) return [];

  const normalized: OmniNinjaAttachment[] = [];
  for (const item of value.slice(0, MAX_ATTACHMENTS_PER_MESSAGE)) {
    if (!item || typeof item !== 'object') continue;
    const attachment = item as Record<string, unknown>;
    const name = typeof attachment.name === 'string' ? attachment.name.slice(0, 180) : '';
    const fallbackMimeType = typeof attachment.mimeType === 'string'
      ? attachment.mimeType.slice(0, 120)
      : 'application/octet-stream';
    const size = Number(attachment.size);
    const dataUrl = typeof attachment.dataUrl === 'string' ? attachment.dataUrl : '';
    const id = typeof attachment.id === 'string' ? attachment.id.slice(0, 120) : crypto.randomUUID();

    if (!name || !dataUrl.startsWith('data:') || dataUrl.length > MAX_ATTACHMENT_DATA_URL_LENGTH) continue;
    if (!Number.isFinite(size) || size <= 0 || size > MAX_ATTACHMENT_BYTES) continue;

    const comma = dataUrl.indexOf(',');
    if (comma < 6) continue;
    const header = dataUrl.slice(5, comma);
    if (!header.toLowerCase().includes(';base64')) continue;
    const encodedLength = dataUrl.length - comma - 1;
    const padding = dataUrl.endsWith('==') ? 2 : dataUrl.endsWith('=') ? 1 : 0;
    const decodedSize = Math.floor(encodedLength * 3 / 4) - padding;
    if (decodedSize <= 0 || decodedSize > MAX_ATTACHMENT_BYTES || Math.abs(decodedSize - size) > 4) continue;

    const declaredMimeType = header.split(';')[0]?.trim().toLowerCase();
    const mimeType = declaredMimeType && declaredMimeType.length <= 120
      ? declaredMimeType
      : fallbackMimeType;

    normalized.push({ id, name, mimeType, size: decodedSize, dataUrl });
  }

  return normalized;
}
