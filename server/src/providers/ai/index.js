import { createGeminiProvider } from './gemini.js';

export function createAiProvider(config) {
  return config.ai.apiKey ? createGeminiProvider(config.ai) : null;
}
