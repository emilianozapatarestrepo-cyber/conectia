import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { env } from './config/env.js';
import { checkDatabaseConnection, destroyDatabase } from './shared/database/db.js';
import { logger } from './shared/logger.js';
import { correlationMiddleware } from './shared/middlewares/correlation.js';
import { globalErrorHandler } from './shared/middlewares/error-handler.js';
import { createLedgerRouter } from './modules/ledger/presentation/ledger.routes.js';
import { createDashboardRouter } from './modules/dashboard/presentation/dashboard.routes.js';

const log = logger.child({ module: 'server' });

async function bootstrap(): Promise<void> {
  const app = express();

  // ── Global Middleware ──
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(correlationMiddleware);

  // ── Health Check ──
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ── API Routes ──
  app.use('/api/v1/ledger', createLedgerRouter());
  app.use('/api/v1/dashboard', createDashboardRouter());

  // ── Global Error Handler (must be last) ──
  app.use(globalErrorHandler);

  // ── Verify DB Connection ──
  await checkDatabaseConnection();

  // ── Start Server ──
  const server = app.listen(env.PORT, () => {
    log.info(
      { env: env.NODE_ENV, port: env.PORT },
      'Conectia backend started',
    );
  });

  // ── Graceful Shutdown ──
  const shutdown = async (signal: string): Promise<void> => {
    log.info({ signal }, 'Shutting down gracefully...');
    server.close(async () => {
      await destroyDatabase();
      log.info('Server closed');
      process.exit(0);
    });

    // Force kill after 10s
    setTimeout(() => {
      log.fatal('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

bootstrap().catch((err: Error) => {
  log.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
