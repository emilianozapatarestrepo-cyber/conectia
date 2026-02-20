import { StatusCodes } from 'http-status-codes';

/**
 * Base application error with HTTP status and machine-readable code.
 * The global error handler translates these to JSON responses.
 */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus: number = StatusCodes.INTERNAL_SERVER_ERROR,
  ) {
    super(message);
    this.name = 'AppError';
    // Maintains proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ─── Ledger Domain Errors ───────────────────────────────────────────────────

export class LedgerImbalanceError extends AppError {
  constructor(debitSum: bigint, creditSum: bigint) {
    super(
      'LEDGER_IMBALANCE',
      `Double-entry violation: debit_sum=${debitSum} != credit_sum=${creditSum}`,
      StatusCodes.UNPROCESSABLE_ENTITY,
    );
  }
}

export class EmptyTransactionError extends AppError {
  constructor() {
    super(
      'EMPTY_TRANSACTION',
      'Transaction must have at least 2 ledger entries (one debit, one credit)',
      StatusCodes.BAD_REQUEST,
    );
  }
}

export class IdempotencyConflictError extends AppError {
  /** The existing transaction ID that was already posted with this key */
  public readonly existingTransactionId: string | undefined;

  constructor(key: string, existingId?: string) {
    super(
      'IDEMPOTENCY_CONFLICT',
      `Transaction with idempotency_key=${key} already exists`,
      StatusCodes.CONFLICT,
    );
    this.existingTransactionId = existingId;
  }
}

export class ClosedPeriodError extends AppError {
  constructor(periodId: string) {
    super(
      'CLOSED_PERIOD',
      `Cannot post to closed fiscal period ${periodId}`,
      StatusCodes.UNPROCESSABLE_ENTITY,
    );
  }
}

export class TenantNotFoundError extends AppError {
  constructor(tenantId: string) {
    super('TENANT_NOT_FOUND', `Tenant ${tenantId} not found`, StatusCodes.NOT_FOUND);
  }
}

export class AccountNotFoundError extends AppError {
  constructor(accountId: string) {
    super('ACCOUNT_NOT_FOUND', `Account ${accountId} not found`, StatusCodes.NOT_FOUND);
  }
}

export class InvalidAmountError extends AppError {
  constructor(detail?: string) {
    super(
      'INVALID_AMOUNT',
      detail ?? 'Amount must be a positive integer (in smallest currency unit)',
      StatusCodes.BAD_REQUEST,
    );
  }
}

export class TransactionNotFoundError extends AppError {
  constructor(txId: string) {
    super('TRANSACTION_NOT_FOUND', `Transaction ${txId} not found`, StatusCodes.NOT_FOUND);
  }
}

export class ChargeNotFoundError extends AppError {
  constructor(chargeId: string) {
    super('CHARGE_NOT_FOUND', `Charge ${chargeId} not found`, StatusCodes.NOT_FOUND);
  }
}

export class ChargeAlreadyPaidError extends AppError {
  constructor(chargeId: string) {
    super(
      'CHARGE_ALREADY_PAID',
      `Charge ${chargeId} is already fully paid`,
      StatusCodes.CONFLICT,
    );
  }
}

export class PaymentAmountMismatchError extends AppError {
  constructor(expected: string, received: string) {
    super(
      'PAYMENT_AMOUNT_MISMATCH',
      `Payment amount ${received} does not match charge outstanding amount ${expected}`,
      StatusCodes.UNPROCESSABLE_ENTITY,
    );
  }
}

export class TenantMismatchError extends AppError {
  constructor() {
    super(
      'TENANT_MISMATCH',
      'The requested resource does not belong to your tenant',
      StatusCodes.FORBIDDEN,
    );
  }
}
