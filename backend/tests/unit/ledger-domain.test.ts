import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import {
  postTransactionSchema,
  getAccountBalanceParamsSchema,
} from '../../src/modules/ledger/presentation/validation.js';
import {
  LedgerImbalanceError,
  EmptyTransactionError,
  InvalidAmountError,
} from '../../src/modules/ledger/domain/errors.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_UUID_2 = '660e8400-e29b-41d4-a716-446655440001';

function validBody() {
  return {
    transactionType: 'charge',
    description: 'Monthly maintenance fee',
    effectiveDate: '2026-02-01',
    idempotencyKey: VALID_UUID,
    lines: [
      { accountId: VALID_UUID, entryType: 'debit', amount: '100000' },
      { accountId: VALID_UUID_2, entryType: 'credit', amount: '100000' },
    ],
  };
}

// ─── U01: Schema rejects tenantId from body (trust violation guard) ─────────

describe('postTransactionSchema — Trust Boundary', () => {
  it('U01: strips tenantId if present in body (not accepted from client)', () => {
    const body = { ...validBody(), tenantId: VALID_UUID };
    const result = postTransactionSchema.parse(body);
    // Zod strict mode strips unknown keys — tenantId should not be in result
    expect(result).not.toHaveProperty('tenantId');
  });
});

// ─── U02-U05: Schema validation ─────────────────────────────────────────────

describe('postTransactionSchema — Field Validation', () => {
  it('U02: accepts all valid fields', () => {
    const result = postTransactionSchema.parse(validBody());
    expect(result.transactionType).toBe('charge');
    expect(result.description).toBe('Monthly maintenance fee');
    expect(result.idempotencyKey).toBe(VALID_UUID);
    expect(result.lines).toHaveLength(2);
  });

  it('U03: rejects empty description', () => {
    const body = { ...validBody(), description: '' };
    expect(() => postTransactionSchema.parse(body)).toThrow(ZodError);
  });

  it('U04: rejects invalid UUID in idempotencyKey', () => {
    const body = { ...validBody(), idempotencyKey: 'not-a-uuid' };
    expect(() => postTransactionSchema.parse(body)).toThrow(ZodError);
  });

  it('U05: rejects lines array with < 2 entries', () => {
    const body = {
      ...validBody(),
      lines: [{ accountId: VALID_UUID, entryType: 'debit', amount: '100000' }],
    };
    expect(() => postTransactionSchema.parse(body)).toThrow(ZodError);
  });

  it('rejects invalid transactionType', () => {
    const body = { ...validBody(), transactionType: 'invalid' };
    expect(() => postTransactionSchema.parse(body)).toThrow(ZodError);
  });

  it('rejects missing required fields', () => {
    expect(() => postTransactionSchema.parse({})).toThrow(ZodError);
  });

  it('validates effectiveDate as ISO date string', () => {
    const body = { ...validBody(), effectiveDate: '2026-02-01T00:00:00Z' };
    const result = postTransactionSchema.parse(body);
    expect(result.effectiveDate).toBe('2026-02-01T00:00:00Z');
  });

  it('validates effectiveDate as YYYY-MM-DD', () => {
    const body = { ...validBody(), effectiveDate: '2026-02-01' };
    const result = postTransactionSchema.parse(body);
    expect(result.effectiveDate).toBe('2026-02-01');
  });
});

// ─── U06-U08: Pre-flight Domain Validation ──────────────────────────────────

describe('Pre-flight Validation — Domain Errors', () => {
  // Simulate the pre-flight validation logic from TransactionRepository
  function preflight(lines: Array<{ entryType: string; amount: bigint }>) {
    if (lines.length < 2) throw new EmptyTransactionError();

    let debitSum = 0n;
    let creditSum = 0n;
    for (const line of lines) {
      if (line.amount <= 0n) throw new InvalidAmountError();
      if (line.entryType === 'debit') debitSum += line.amount;
      else creditSum += line.amount;
    }
    if (debitSum !== creditSum) throw new LedgerImbalanceError(debitSum, creditSum);
  }

  it('U06: imbalance (debit != credit) throws LedgerImbalanceError', () => {
    expect(() =>
      preflight([
        { entryType: 'debit', amount: 100000n },
        { entryType: 'credit', amount: 99999n },
      ]),
    ).toThrow(LedgerImbalanceError);
  });

  it('U07: empty lines throws EmptyTransactionError', () => {
    expect(() => preflight([])).toThrow(EmptyTransactionError);
    expect(() => preflight([{ entryType: 'debit', amount: 100n }])).toThrow(
      EmptyTransactionError,
    );
  });

  it('U08: zero amount throws InvalidAmountError', () => {
    expect(() =>
      preflight([
        { entryType: 'debit', amount: 0n },
        { entryType: 'credit', amount: 0n },
      ]),
    ).toThrow(InvalidAmountError);
  });

  it('U08b: negative amount throws InvalidAmountError', () => {
    expect(() =>
      preflight([
        { entryType: 'debit', amount: -100n },
        { entryType: 'credit', amount: -100n },
      ]),
    ).toThrow(InvalidAmountError);
  });

  it('balanced transaction does not throw', () => {
    expect(() =>
      preflight([
        { entryType: 'debit', amount: 50000n },
        { entryType: 'credit', amount: 50000n },
      ]),
    ).not.toThrow();
  });

  it('multi-line balanced transaction does not throw', () => {
    expect(() =>
      preflight([
        { entryType: 'debit', amount: 30000n },
        { entryType: 'debit', amount: 20000n },
        { entryType: 'credit', amount: 50000n },
      ]),
    ).not.toThrow();
  });
});

// ─── U09-U11: Correlation Middleware ─────────────────────────────────────────

describe('Correlation Middleware', () => {
  // We test the middleware without importing Express — mock req/res/next
  let correlationMiddleware: typeof import('../../src/shared/middlewares/correlation.js').correlationMiddleware;

  // Dynamic import to handle ESM
  beforeAll(async () => {
    const mod = await import('../../src/shared/middlewares/correlation.js');
    correlationMiddleware = mod.correlationMiddleware;
  });

  function createMockReq(headers: Record<string, string> = {}) {
    return { headers, correlationId: undefined } as any;
  }

  function createMockRes() {
    const headersSet: Record<string, string> = {};
    return {
      setHeader: (name: string, value: string) => {
        headersSet[name] = value;
      },
      _headers: headersSet,
    } as any;
  }

  it('U09: generates UUID when no X-Correlation-Id header', () => {
    const req = createMockReq();
    const res = createMockRes();
    let called = false;
    correlationMiddleware(req, res, () => { called = true; });

    expect(called).toBe(true);
    expect(req.correlationId).toBeDefined();
    expect(typeof req.correlationId).toBe('string');
    // UUID v4 format check
    expect(req.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('U10: uses X-Correlation-Id header when present', () => {
    const customId = 'my-custom-correlation-id';
    const req = createMockReq({ 'x-correlation-id': customId });
    const res = createMockRes();
    correlationMiddleware(req, res, () => {});

    expect(req.correlationId).toBe(customId);
  });

  it('U11: sets X-Correlation-Id response header', () => {
    const req = createMockReq();
    const res = createMockRes();
    correlationMiddleware(req, res, () => {});

    expect(res._headers['X-Correlation-Id']).toBe(req.correlationId);
  });
});

// ─── getAccountBalanceParamsSchema ───────────────────────────────────────────

describe('getAccountBalanceParamsSchema', () => {
  it('accepts valid UUID', () => {
    const result = getAccountBalanceParamsSchema.parse({ accountId: VALID_UUID });
    expect(result.accountId).toBe(VALID_UUID);
  });

  it('rejects invalid UUID', () => {
    expect(() =>
      getAccountBalanceParamsSchema.parse({ accountId: 'not-a-uuid' }),
    ).toThrow(ZodError);
  });
});
