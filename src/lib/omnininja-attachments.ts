export type OmniNinjaAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  dataUrl: string;
};

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_MESSAGE = 5;

export function isImageAttachment(attachment: OmniNinjaAttachment): boolean {
  return attachment.mimeType.startsWith('image/');
}
