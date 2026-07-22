/**
 * Abstract base class for domain-specific errors.
 * Services throw DomainError subclasses; handlers map them to HTTP responses via withDomainMap.
 */
export abstract class DomainError extends Error {
  readonly code: string;
  abstract readonly domain: string;

  constructor(
    code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}
