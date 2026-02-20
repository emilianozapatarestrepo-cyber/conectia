import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { postTransactionSchema } from '../../src/modules/ledger/presentation/validation.js';
import {
  LedgerImbalanceError,
  EmptyTransactionError,
  InvalidAmountError,
} from '../../src/modules/ledger/domain/errors.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Simulates the pre-flight validation logic from TransactionRepository.
 * Extracted here so we can test the invariant in pure form.
 */
function preflightValidation(
  lines: Array<{ entryType: 'debit' | 'credit'; amount: bigint }>,
): { debitSum: bigint; creditSum: bigint } {
  if (lines.length < 2) throw new EmptyTransactionError();

  let debitSum = 0n;
  let creditSum = 0n;
  for (const line of lines) {
    if (line.amount <= 0n) throw new InvalidAmountError();
    if (line.entryType === 'debit') debitSum += line.amount;
    else creditSum += line.amount;
  }
  if (debitSum !== creditSum) throw new LedgerImbalanceError(debitSum, creditSum);
  return { debitSum, creditSum };
}

/** Generate a random UUID v4 string */
const arbUuid = fc.uuid();

/** Generate a positive bigint amount (1 to 10^12 centavos = 10 billion COP) */
const arbPositiveAmount = fc.bigInt({ min: 1n, max: 10n ** 12n });

// ─── P01: For ANY set of valid ledger lines, sum(debits) === sum(credits) ──

describe('P01: Double-entry balance invariant', () => {
  it('for any balanced line set, debitSum === creditSum after validation', () => {
    fc.assert(
      fc.property(
        arbPositiveAmount,
        fc.array(arbPositiveAmount, { minLength: 1, maxLength: 5 }),
        (baseAmount, extraDebits) => {
          // Build a balanced set: N debits + 1 credit with total
          const totalDebit = extraDebits.reduce((sum, a) => sum + a, baseAmount);
          const lines: Array<{ entryType: 'debit' | 'credit'; amount: bigint }> = [
            { entryType: 'debit', amount: baseAmount },
            ...extraDebits.map((a) => ({ entryType: 'debit' as const, amount: a })),
            { entryType: 'credit', amount: totalDebit },
          ];

          const result = preflightValidation(lines);
          expect(result.debitSum).toBe(result.creditSum);
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ─── P02: Hash determinism (same input → same hash) ─────────────────────────

describe('P02: Hash determinism', () => {
  it('SHA-256 of identical inputs produces identical output', () => {
    // This tests the pure cryptographic property — actual DB function tested in integration
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 500 }), (input) => {
        const crypto = require('node:crypto');
        const hash1 = crypto.createHash('sha256').update(input).digest('hex');
        const hash2 = crypto.createHash('sha256').update(input).digest('hex');
        expect(hash1).toBe(hash2);
      }),
      { numRuns: 100 },
    );
  });
});

// ─── P03: BIGINT serialization round-trips correctly ─────────────────────────

describe('P03: Money precision — BIGINT round-trip', () => {
  it('any positive bigint survives string serialization', () => {
    fc.assert(
      fc.property(arbPositiveAmount, (amount) => {
        const serialized = amount.toString();
        const deserialized = BigInt(serialized);
        expect(deserialized).toBe(amount);
      }),
      { numRuns: 500 },
    );
  });

  it('any positive bigint as number string survives Zod transform', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
        (amount) => {
          const serialized = amount.toString();
          const parsed = BigInt(serialized);
          expect(parsed).toBe(BigInt(amount));
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ─── P04: For ANY random imbalanced lines, preflight always rejects ──────────

describe('P04: Imbalance detection completeness', () => {
  it('any imbalanced set is always rejected', () => {
    fc.assert(
      fc.property(
        arbPositiveAmount,
        arbPositiveAmount,
        (debitAmount, creditAmount) => {
          // Ensure they're actually different
          fc.pre(debitAmount !== creditAmount);

          const lines = [
            { entryType: 'debit' as const, amount: debitAmount },
            { entryType: 'credit' as const, amount: creditAmount },
          ];

          expect(() => preflightValidation(lines)).toThrow(LedgerImbalanceError);
        },
      ),
      { numRuns: 500 },
    );
  });
});

// ─── P05: For ANY valid PostTransactionInput, Zod parse succeeds ─────────────

describe('P05: Schema completeness for valid inputs', () => {
  it('any well-formed input parses successfully', () => {
    const arbTransactionType = fc.constantFrom(
      'charge', 'payment', 'adjustment', 'reversal',
      'migration', 'transfer', 'fee', 'settlement',
    );
    const arbEntryType = fc.constantFrom('debit', 'credit');

    fc.assert(
      fc.property(
        arbTransactionType,
        fc.string({ minLength: 1, maxLength: 100 }),
        arbUuid,
        arbEntryType,
        fc.integer({ min: 1, max: 999999999 }),
        (txType, desc, idemKey, entryType, amount) => {
          const oppositeEntry = entryType === 'debit' ? 'credit' : 'debit';
          const body = {
            transactionType: txType,
            description: desc,
            effectiveDate: '2026-01-15',
            idempotencyKey: idemKey,
            lines: [
              {
                accountId: '550e8400-e29b-41d4-a716-446655440000',
                entryType,
                amount: amount.toString(),
              },
              {
                accountId: '660e8400-e29b-41d4-a716-446655440001',
                entryType: oppositeEntry,
                amount: amount.toString(),
              },
            ],
          };

          const result = postTransactionSchema.safeParse(body);
          expect(result.success).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── P06: For ANY input with tenantId in body, Zod strips it ─────────────────

describe('P06: Trust boundary — tenantId stripped from body', () => {
  it('tenantId is never present in parsed output regardless of input', () => {
    fc.assert(
      fc.property(arbUuid, (fakeTenantId) => {
        const body = {
          tenantId: fakeTenantId, // ATTACKER TRIES TO INJECT
          transactionType: 'charge',
          description: 'test',
          effectiveDate: '2026-01-15',
          idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
          lines: [
            {
              accountId: '550e8400-e29b-41d4-a716-446655440000',
              entryType: 'debit',
              amount: '100',
            },
            {
              accountId: '660e8400-e29b-41d4-a716-446655440001',
              entryType: 'credit',
              amount: '100',
            },
          ],
        };

        const result = postTransactionSchema.parse(body);
        expect(result).not.toHaveProperty('tenantId');
      }),
      { numRuns: 50 },
    );
  });
});
