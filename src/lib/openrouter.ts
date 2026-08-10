// Compatibility shim.
// OmniNinja now uses OpenAI's native Responses API as the central LLM backend.
// Existing imports keep working while the rest of the codebase is migrated.
export * from './openai-native';
