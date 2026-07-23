export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code = 'APPLICATION_ERROR',
    public readonly details?: Array<{ field?: string; message: string }>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
