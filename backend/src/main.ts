import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { checkDatabaseConnection, destroyDatabase } from './shared/database/db.js';
import { logger } from './shared/logger.js';
import { correlationMiddleware } from './shared/middlewares/correlation.js';
import { globalErrorHandler } from './shared/middlewares/error-handler.js';
import { createLedgerRouter } from './modules/ledger/presentation/ledger.routes.js';
import { createDashboardRouter } from './modules/dashboard/presentation/dashboard.routes.js';
import { createChargesRouter } from './modules/charges/presentation/charges.routes.js';
import { createExportRouter } from './modules/export/presentation/export.routes.js';
import { createWebhookRouter } from './modules/webhooks/presentation/webhook.routes.js';
import { createTenantsRouter } from './modules/tenants/presentation/tenants.routes.js';
import { createPeriodsRouter } from './modules/periods/presentation/periods.routes.js';
import { createPayRouter } from './modules/pay/presentation/pay.routes.js';
import { createUnitsRouter } from './modules/units/presentation/units.routes.js';
import { createBillingRouter } from './modules/billing/presentation/billing.routes.js';
import { createCronRouter } from './modules/cron/presentation/cron.routes.js';
import { createPqrsRouter } from './modules/pqrs/presentation/pqrs.routes.js';
import { createAmenitiesRouter } from './modules/amenities/presentation/amenities.routes.js';
import { createAnnouncementsRouter } from './modules/announcements/presentation/announcements.routes.js';
import { createPortalRouter } from './modules/portal/presentation/portal.routes.js';
import { createPortalAdminRouter } from './modules/portal/presentation/portal-admin.routes.js';
import { createAssembliesRouter } from './modules/assemblies/presentation/assemblies.routes.js';
import { createBudgetsRouter } from './modules/budgets/presentation/budgets.routes.js';

const log = logger.child({ module: 'server' });

async function bootstrap(): Promise<void> {
  const app = express();

  // ── Global Middleware ──
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(correlationMiddleware);

  // ── Rate Limiting ──
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' },
  });

  // Stricter limit for export endpoints (CPU/memory heavy)
  const exportLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Export rate limit exceeded, please wait before requesting another export' },
  });

  // Webhook flood protection — Wompi sends up to 3 retries; 60/min is generous
  const webhookLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip ?? 'unknown',
    message: { error: 'Webhook rate limit exceeded' },
  });

  // Portal Residente — public capability-URL surface. Reads are bursty
  // (mobile, WhatsApp opens); writes (PQRS, reservas) are further capped
  // per-unit inside the routes.
  const portalLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiadas solicitudes, intenta de nuevo en un minuto' },
  });

  // Cron protection — extra layer on top of secret validation
  const cronLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Cron rate limit exceeded' },
  });

  app.use('/api/v1/', apiLimiter);
  app.use('/api/v1/export', exportLimiter);
  app.use('/api/v1/portal', portalLimiter);
  app.use('/webhooks', webhookLimiter);
  app.use('/cron', cronLimiter);

  // ── Health Check ──
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ── API Routes ──
  app.use('/api/v1/ledger', createLedgerRouter());
  app.use('/api/v1/dashboard', createDashboardRouter());
  app.use('/api/v1/charges', createChargesRouter());
  app.use('/api/v1/export', createExportRouter());

  // ── Platform-internal endpoints ──
  app.use('/api/v1/tenants', createTenantsRouter());
  app.use('/api/v1/periods', createPeriodsRouter());
  app.use('/api/v1/units',   createUnitsRouter());
  app.use('/api/v1/billing', createBillingRouter());
  app.use('/api/v1/pqrs',      createPqrsRouter());
  app.use('/api/v1/amenities', createAmenitiesRouter());
  app.use('/api/v1/announcements', createAnnouncementsRouter());
  app.use('/api/v1/portal-admin', createPortalAdminRouter());
  app.use('/api/v1/assemblies', createAssembliesRouter());
  app.use('/api/v1/budgets',    createBudgetsRouter());

  // ── Cron endpoints (secret-protected, no user auth) ──
  app.use('/cron', createCronRouter());

  // ── Public endpoints (no auth) ──
  app.use('/api/v1/pay', createPayRouter());
  // Portal Residente — capability-URL auth (token per unit, see portal module)
  app.use('/api/v1/portal', createPortalRouter());

  // ── Webhook endpoints (no auth — verified by HMAC signature) ──
  app.use('/webhooks', createWebhookRouter());

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
