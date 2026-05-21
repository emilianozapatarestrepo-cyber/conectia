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
import { requireSubscription } from '../../billing/application/require-subscription.js';

export function createLedgerRouter(): Router {
  const router = Router();

  const txRepo = new TransactionRepository();
  const accountRepo = new AccountRepository();
  const auditRepo = new AuditRepository();

  const postTxUseCase = new PostTransactionUseCase(txRepo, accountRepo, auditRepo);
  const getBalancesUseCase = new GetBalancesUseCase(accountRepo);

  const controller = new LedgerController(postTxUseCase, getBalancesUseCase);

  router.use(requireAuth, requireTenant, requireSubscription);

  router.post('/transactions', requireAdmin, controller.postTransaction);
  router.get('/balances', controller.getBalances);
  router.get('/balances/:accountId', controller.getAccountBalance);

  return router;
}
