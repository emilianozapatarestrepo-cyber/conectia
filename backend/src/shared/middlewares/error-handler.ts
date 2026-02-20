import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { StatusCodes } from 'http-status-codes';
import { AppError } from '../../modules/ledger/domain/errors.js';

interface ErrorResponse {
  status: 'error';
  code: string;
  message: string;
  details?: unknown;
}

export function globalErrorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Zod validation errors
  if (err instanceof ZodError) {
    const response: ErrorResponse = {
      status: 'error',
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: err.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    };
    res.status(StatusCodes.BAD_REQUEST).json(response);
    return;
  }

  // Domain errors
  if (err instanceof AppError) {
    const response: ErrorResponse = {
      status: 'error',
      code: err.code,
      message: err.message,
    };
    res.status(err.httpStatus).json(response);
    return;
  }

  // PostgreSQL unique constraint violation
  if ((err as unknown as Record<string, unknown>)['code'] === '23505') {
    const response: ErrorResponse = {
      status: 'error',
      code: 'DUPLICATE_ENTRY',
      message: 'A record with this key already exists (idempotency check)',
    };
    res.status(StatusCodes.CONFLICT).json(response);
    return;
  }

  // PostgreSQL double-entry violation (our custom trigger)
  if (err.message?.includes('DOUBLE-ENTRY VIOLATION')) {
    const response: ErrorResponse = {
      status: 'error',
      code: 'LEDGER_IMBALANCE',
      message: 'Transaction debits and credits do not balance',
    };
    res.status(StatusCodes.UNPROCESSABLE_ENTITY).json(response);
    return;
  }

  // Unknown errors — don't leak internals
  console.error('[ERROR]', err);
  const response: ErrorResponse = {
    status: 'error',
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
  };
  res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(response);
}
