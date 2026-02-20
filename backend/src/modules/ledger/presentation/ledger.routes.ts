import { Router } from 'express';
import { LedgerController } from './ledger.controller.js';
import { PostTransactionUseCase } from '../application/post-transaction.usecase.js';
import { GetBalancesUseCase } from '../application/get-balances.usecase.js';
import { TransactionRepository } from '../infrastructure/transaction.repository.js';
import { AccountRepository } from '../infrastructure/account.repository.js';
import { AuditRepository } from '../infrastructure/audit.repository.js';
import {
  requireAuth,
  requireTenant,
  requireAdmin,
} from '../../../shared/middlewares/auth.js';

export function createLedgerRouter(): Router {
  const router = Router();

  // ── Wire dependencies (Poor Man's DI — replace with container later) ──
  const txRepo = new TransactionRepository();
  const accountRepo = new AccountRepository();
  const auditRepo = new AuditRepository();

  const postTxUseCase = new PostTransactionUseCase(txRepo, accountRepo, auditRepo);
  const getBalancesUseCase = new GetBalancesUseCase(accountRepo);

  const controller = new LedgerController(postTxUseCase, getBalancesUseCase);

  // ── Middleware chain: requireAuth → requireTenant → role check → handler ──
  // requireAuth:   verifies Firebase JWT (identity)
  // requireTenant: resolves tenant+role from tenant_memberships DB (authorization)
  // requireAdmin:  checks role === 'admin' (resolved from DB, not custom claims)

  // Post a double-entry transaction (admin only)
  router.post(
    '/transactions',
    requireAuth,
    requireTenant,
    requireAdmin,
    controller.postTransaction,
  );

  // Get all account balances for a tenant (any authenticated tenant member)
  router.get('/balances', requireAuth, requireTenant, controller.getBalances);

  // Get single account balance (any authenticated tenant member)
  router.get('/balances/:accountId', requireAuth, requireTenant, controller.getAccountBalance);

  return router;
}
