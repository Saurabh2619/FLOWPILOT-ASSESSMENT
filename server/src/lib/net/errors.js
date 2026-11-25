export class FetchError extends Error {
  constructor(code, message, { transient = false } = {}) {
    super(message);
    this.name = 'FetchError';
    this.code = code;
    this.transient = transient;
  }
}
