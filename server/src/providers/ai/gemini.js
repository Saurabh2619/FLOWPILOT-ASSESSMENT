import { AiError } from './errors.js';
import { buildPrompt, INSTRUCTIONS } from './prompt.js';
import { adviceSchema, responseSchema } from './schema.js';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const TRY_NEXT_STATUSES = new Set([404, 408, 429, 500, 502, 503, 504]);

function readAdvice(body) {
  const parts = body?.candidates?.[0]?.content?.parts ?? [];
  const output = parts
    .filter((part) => !part.thought)
    .map((part) => part.text ?? '')
    .join('');
  try {
    return adviceSchema.parse(JSON.parse(output));
  } catch {
    throw new AiError('The AI service returned an unusable answer', { transient: true });
  }
}

export function createGeminiProvider({ apiKey, models, timeoutMs = 45000, fetchImpl = fetch }) {
  async function ask(model, prompt) {
    let response;
    let body;
    try {
      response = await fetchImpl(`${BASE_URL}/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: INSTRUCTIONS }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema,
            temperature: 0.3,
          },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      body = await response.json();
    } catch {
      throw new AiError('The AI service could not be reached', { transient: true });
    }

    if (!response.ok) {
      if (!TRY_NEXT_STATUSES.has(response.status)) {
        throw new AiError(`The AI service rejected the request (status ${response.status})`);
      }
      const reason =
        response.status === 429
          ? 'The AI service rate limit was reached'
          : 'The AI service is unavailable';
      throw new AiError(reason, { transient: true });
    }
    return readAdvice(body);
  }

  return {
    name: 'gemini',
    async suggest(input) {
      const prompt = buildPrompt(input);
      let lastError;
      for (const model of models) {
        try {
          return { ...(await ask(model, prompt)), model };
        } catch (error) {
          if (!error.transient) throw error;
          lastError = error;
        }
      }
      throw lastError;
    },
  };
}
