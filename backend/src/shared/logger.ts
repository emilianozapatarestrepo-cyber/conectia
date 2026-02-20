import pino from 'pino';
import { env } from '../config/env.js';

/**
 * Structured logger for Conectia backend.
 *
 * Uses Pino for high-performance JSON logging.
 * In development, pino-pretty formats output for readability.
 * In production, raw JSON is emitted for Cloud Logging / ELK ingestion.
 *
 * Every log entry includes:
 *   - level, time, pid, hostname (standard Pino fields)
 *   - correlationId (injected per-request by correlation middleware)
 *   - tenantId (injected per-request after requireTenant runs)
 *   - module (set by child logger)
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  // Redact sensitive fields that may appear in serialized objects
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'token',
      'secret',
      'privateKey',
    ],
    censor: '[REDACTED]',
  },
  // Use ISO timestamps for structured log aggregation
  timestamp: pino.stdTimeFunctions.isoTime,
  // In development, use pino-pretty for human-readable output
  ...(env.NODE_ENV === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname',
          },
        },
      }
    : {}),
});

/**
 * Creates a child logger scoped to a module.
 *
 * @param module - The module name (e.g., 'ledger', 'auth', 'webhook')
 */
export function createModuleLogger(module: string): pino.Logger {
  return logger.child({ module });
}
