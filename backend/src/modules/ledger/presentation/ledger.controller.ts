import type { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import {
  postTransactionSchema,
  getAccountBalanceParamsSchema,
} from './validation.js';
import { PostTransactionUseCase } from '../application/post-transaction.usecase.js';
import { GetBalancesUseCase } from '../application/get-balances.usecase.js';
import { AppError } from '../domain/errors.js';
import type { PostTransactionInput } from '../domain/types.js';

/**
 * Extracts tenant ID from req.user (resolved by requireTenant middleware).
 * Throws if tenantId is not present — defensive guard against misconfigured routes.
 */
function extractTenantId(req: Request): string {
  const tenantId = req.user?.tenantId;
  if (!tenantId) {
    throw new AppError(
      'MISSING_TENANT_CONTEXT',
      'Tenant context not resolved. Ensure requireTenant middleware is in the chain.',
      StatusCodes.INTERNAL_SERVER_ERROR,
    );
  }
  return tenantId;
}

export class LedgerController {
  constructor(
    private readonly postTxUseCase: PostTransactionUseCase,
    private readonly getBalancesUseCase: GetBalancesUseCase,
  ) {}

  /**
   * POST /api/v1/ledger/transactions
   * Posts a balanced double-entry transaction.
   *
   * SECURITY: tenantId comes from req.user.tenantId (resolved via DB),
   * NOT from the request body. The client cannot choose which tenant to post to.
   */
  postTransaction = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const tenantId = extractTenantId(req);
      const body = postTransactionSchema.parse(req.body);

      const input: PostTransactionInput = {
        tenantId,
        transactionType: body.transactionType,
        description: body.description,
        effectiveDate: new Date(body.effectiveDate),
        periodId: body.periodId,
        idempotencyKey: body.idempotencyKey,
        currency: body.currency,
        sourceType: body.sourceType,
        sourceId: body.sourceId,
        createdBy: req.user!.uid,
        lines: body.lines.map((l) => ({
          accountId: l.accountId,
          entryType: l.entryType,
          amount: l.amount,
          description: l.description,
        })),
        metadata: body.metadata,
      };

      const result = await this.postTxUseCase.execute(input);

      res.status(StatusCodes.CREATED).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/ledger/balances
   * Returns all account balances for the authenticated user's tenant.
   *
   * SECURITY: tenantId comes from req.user.tenantId, not query params.
   */
  getBalances = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const tenantId = extractTenantId(req);
      const balances = await this.getBalancesUseCase.allBalances(tenantId);

      res.status(StatusCodes.OK).json({
        status: 'success',
        data: balances,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/ledger/balances/:accountId
   * Returns balance for a single account within the authenticated user's tenant.
   *
   * SECURITY: tenantId comes from req.user.tenantId, not query params.
   */
  getAccountBalance = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const tenantId = extractTenantId(req);
      const params = getAccountBalanceParamsSchema.parse(req.params);

      const balance = await this.getBalancesUseCase.singleBalance(
        tenantId,
        params.accountId,
      );

      res.status(StatusCodes.OK).json({
        status: 'success',
        data: balance,
      });
    } catch (error) {
      next(error);
    }
  };
}
