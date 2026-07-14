// Business-rule errors carry a stable code + HTTP status. Centcom maps these to
// a consistent JSON error shape; apps switch on the code, never the message.
export class AppError extends Error {
  constructor(public code: string, public status: number = 400) {
    super(code);
    this.name = 'AppError';
  }
}
export const err = (code: string, status = 400) => new AppError(code, status);
