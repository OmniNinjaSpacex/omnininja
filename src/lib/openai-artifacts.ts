export interface OpenAIContainerArtifact {
  name: string;
  kind: 'file';
  path: string;
  sizeBytes: number;
}

interface OpenAIResponseWithOutput {
  output?: any[];
}

export function collectContainerArtifacts(
  response: OpenAIResponseWithOutput,
): OpenAIContainerArtifact[] {
  const artifacts = new Map<string, OpenAIContainerArtifact>();

  for (const item of response.output || []) {
    if (item?.type !== 'message') continue;
    for (const part of item?.content || []) {
      for (const annotation of part?.annotations || []) {
        if (annotation?.type !== 'container_file_citation') continue;
        const containerId = typeof annotation.container_id === 'string'
          ? annotation.container_id.trim()
          : '';
        const fileId = typeof annotation.file_id === 'string'
          ? annotation.file_id.trim()
          : '';
        const filename = typeof annotation.filename === 'string'
          ? annotation.filename.trim()
          : '';
        if (!containerId || !fileId || !filename) continue;
        if (
          !/^[A-Za-z0-9_-]{3,200}$/.test(containerId) ||
          !/^[A-Za-z0-9_-]{3,200}$/.test(fileId)
        ) continue;

        const key = `${containerId}:${fileId}`;
        artifacts.set(key, {
          name: filename.slice(0, 240),
          kind: 'file',
          path: JSON.stringify({ provider: 'openai-container', containerId, fileId }),
          sizeBytes: 0,
        });
      }
    }
  }

  return Array.from(artifacts.values()).slice(0, 16);
}
