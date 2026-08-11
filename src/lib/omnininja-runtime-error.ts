export type OmniNinjaRuntimeErrorCode =
  | 'openai_insufficient_quota'
  | 'openai_rate_limit'
  | 'openai_request_failed';

type CodedRuntimeError = Error & { runtimeCode?: OmniNinjaRuntimeErrorCode };

export function withOmniNinjaRuntimeErrorCode(
  error: Error,
  runtimeCode: OmniNinjaRuntimeErrorCode,
): Error {
  (error as CodedRuntimeError).runtimeCode = runtimeCode;
  return error;
}

export function publicOmniNinjaRuntimeError(error: unknown): string {
  const code = (error as CodedRuntimeError | null)?.runtimeCode;
  if (code === 'openai_insufficient_quota') {
    return 'A capacidade OpenAI deste deploy está sem créditos de API. O administrador precisa revisar o faturamento do projeto OpenAI.';
  }
  if (code === 'openai_rate_limit') {
    return 'A OpenAI atingiu um limite temporário de uso. Aguarde um instante e tente novamente.';
  }
  return 'Não consegui concluir esta resposta. Tente novamente em instantes.';
}
