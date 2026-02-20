import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';

/**
 * Correlation ID Middleware.
 *
 * Assigns a unique correlation ID to every inbound request.
 * The ID is:
 *   1. Extracted from the `X-Correlation-Id` header (if present — for distributed tracing).
 *   2. Generated as a new UUIDv4 if no header is provided.
 *   3. Set on the response header so clients can reference it.
 *   4. Stored on `req.correlationId` for use in downstream logging.
 *
 * This enables end-to-end tracing across:
 *   - iOS app → Backend → PostgreSQL → Webhook processor
 */

// Extend Express Request to include correlationId
declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
    }
  }
}

export function correlationMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Accept from client (distributed tracing) or generate new
  const correlationId =
    (typeof req.headers['x-correlation-id'] === 'string'
      ? req.headers['x-correlation-id']
      : undefined) ?? randomUUID();

  req.correlationId = correlationId;

  // Echo back to client for debugging
  res.setHeader('X-Correlation-Id', correlationId);

  next();
}
