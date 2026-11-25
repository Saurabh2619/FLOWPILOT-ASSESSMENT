export class AuditError extends Error {
  constructor(message, { code = 'audit_failed', transient = false } = {}) {
    super(message);
    this.name = 'AuditError';
    this.code = code;
    this.transient = transient;
  }
}
