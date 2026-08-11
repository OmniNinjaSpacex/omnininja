import type { OmniNinjaAttachment } from './omnininja-attachments';
import { isImageAttachment } from './omnininja-attachments';
import { OPENAI_BASE_URL } from './openai-services';

const OMNINJA_MODEL = process.env.OMNINJA_MODEL || 'gpt-5.6';

function requireApiKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error('OPENAI_API_KEY não configurada no servidor');
  return key;
}

function extractOutputText(payload: any): string {
  if (typeof payload?.output_text === 'string') return payload.output_text.trim();
  const parts: string[] = [];
  for (const item of payload?.output || []) {
    if (item?.type !== 'message') continue;
    for (const content of item?.content || []) {
      if ((content?.type === 'output_text' || content?.type === 'text') && typeof content?.text === 'string') {
        parts.push(content.text);
      }
    }
  }
  return parts.join('\n').trim();
}

export async function buildAttachmentContext(
  attachments: OmniNinjaAttachment[],
  signal?: AbortSignal,
): Promise<string> {
  if (!attachments.length) return '';

  const content: any[] = [
    {
      type: 'input_text',
      text: [
        'Prepare compact private context for the next OMNINJA response.',
        'Analyze every attachment carefully and preserve concrete facts, text, numbers, structure, visible UI details and filenames.',
        'For documents, extract relevant text and tables faithfully.',
        'For images, describe visible content and read legible text.',
        'Do not answer the user request yet and do not mention this preprocessing step.',
        'Return only a compact, information-rich attachment digest in Brazilian Portuguese.',
      ].join(' '),
    },
  ];

  for (const attachment of attachments) {
    if (isImageAttachment(attachment)) {
      content.push({
        type: 'input_image',
        image_url: attachment.dataUrl,
        detail: 'auto',
      });
      content.push({ type: 'input_text', text: `Nome da imagem: ${attachment.name}` });
    } else {
      content.push({
        type: 'input_file',
        file_data: attachment.dataUrl,
        filename: attachment.name,
      });
    }
  }

  const response = await fetch(`${OPENAI_BASE_URL}/responses`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${requireApiKey()}`,
      'X-Client-Request-Id': `omnininja-attachments-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    },
    body: JSON.stringify({
      model: OMNINJA_MODEL,
      input: [{ role: 'user', content }],
      max_output_tokens: 5000,
      reasoning: { effort: 'low', context: 'current_turn' },
      store: false,
    }),
    cache: 'no-store',
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(90_000)])
      : AbortSignal.timeout(90_000),
  });

  const payload = await response.json().catch(() => ({} as any));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `OpenAI attachment analysis HTTP ${response.status}`);
  }

  const text = extractOutputText(payload);
  if (!text) throw new Error('O OMNINJA não conseguiu ler os anexos.');
  return text;
}
