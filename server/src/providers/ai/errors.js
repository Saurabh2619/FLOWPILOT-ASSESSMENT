export class AiError extends Error {
  constructor(message, { transient = false } = {}) {
    super(message);
    this.name = 'AiError';
    this.transient = transient;
  }
}
