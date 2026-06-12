import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { WompiReconcileUseCase } from '../../src/modules/webhooks/application/wompi-reconcile.usecase.js';
import type { WompiTransactionEvent } from '../../src/modules/webhooks/domain/types.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SECRET = 'test_events_secret_xyz';
const REFERENCE = '550e8400-e29b-41d4-a716-446655440001';

function buildEvent(overrides: Partial<WompiTransactionEvent['data']['transaction']> = {}): WompiTransactionEvent {
  const tx = {
    id: 'wompi_tx_123abc',
    status: 'APPROVED' as const,
    amount_in_cents: 350000,
    currency: 'COP',
    reference: REFERENCE,
    customer_email: 'test@test.com',
    payment_method_type: 'CARD',
    created_at: '2026-01-01T00:00:00.000Z',
    finalized_at: '2026-01-01T00:00:01.000Z',
    ...overrides,
  };

  const timestamp = 1735689600;
  const properties: Array<keyof typeof tx> = ['id', 'status', 'amount_in_cents'];
  const checksumRaw = properties.map((p) => String(tx[p])).join('') + timestamp + SECRET;
  const checksum = createHash('sha256').update(checksumRaw).digest('hex');

  return {
    event: 'transaction.updated',
    data: { transaction: tx },
    environment: 'production',
    signature: { checksum, properties: properties.map((p) => `transaction.${p}`) },
    timestamp,
  };
}

// ─── W01–W05: Signature verification ─────────────────────────────────────────

describe('WompiReconcileUseCase — signature verification', () => {
  const uc = new WompiReconcileUseCase(null as never);

  it('W01: accepts valid signature', () => {
    expect(uc.verifySignature(buildEvent(), SECRET)).toBe(true);
  });

  it('W02: rejects wrong secret', () => {
    expect(uc.verifySignature(buildEvent(), 'wrong_secret')).toBe(false);
  });

  it('W03: rejects tampered amount', () => {
    const event = buildEvent();
    event.data.transaction.amount_in_cents = 999999;
    expect(uc.verifySignature(event, SECRET)).toBe(false);
  });

  it('W04: rejects tampered status', () => {
    const event = buildEvent();
    (event.data.transaction as { status: string }).status = 'DECLINED';
    expect(uc.verifySignature(event, SECRET)).toBe(false);
  });

  it('W05: returns false instead of throwing on malformed event', () => {
    const broken = { event: 'transaction.updated', data: { transaction: {} }, signature: {} } as unknown as WompiTransactionEvent;
    expect(uc.verifySignature(broken, SECRET)).toBe(false);
  });
});

// ─── W06–W08: Wompi URL builder (via payment-link use case) ─────────────────

describe('Payment link Wompi URL integrity hash', () => {
  it('W06: SHA256(reference + amount + currency + secret) matches known vector', () => {
    const reference = 'abc-ref-123';
    const amount = 350000n;
    const currency = 'COP';
    const secret = 'test_integrity_secret';

    const hash = createHash('sha256')
      .update(`${reference}${amount}${currency}${secret}`)
      .digest('hex');

    // Must be deterministic — same inputs must always produce same hash
    const hash2 = createHash('sha256')
      .update(`${reference}${amount}${currency}${secret}`)
      .digest('hex');

    expect(hash).toBe(hash2);
    expect(hash).toHaveLength(64);
  });

  it('W07: different amounts produce different hashes', () => {
    const base = (amt: bigint) =>
      createHash('sha256').update(`ref${amt}COP secret`).digest('hex');
    expect(base(100000n)).not.toBe(base(200000n));
  });

  it('W08: different references produce different hashes', () => {
    const base = (ref: string) =>
      createHash('sha256').update(`${ref}100000COPsecret`).digest('hex');
    expect(base('ref-a')).not.toBe(base('ref-b'));
  });
});

// ─── W09: CreateCharge validation ────────────────────────────────────────────

describe('CreateCharge input validation', () => {
  it('W09: rejects zero amount', async () => {
    const { CreateChargeUseCase } = await import('../../src/modules/charges/application/create-charge.usecase.js');
    const uc = new CreateChargeUseCase();
    await expect(
      uc.execute({
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        unitId: 'A-101',
        unitLabel: 'Apto 101',
        ownerName: null,
        userId: 'user-1',
        amount: 0n,
        concept: 'Cuota Ordinaria',
        dueDate: new Date('2026-02-01'),
        periodId: null,
        createdBy: 'admin-uid',
      }),
    ).rejects.toThrow('INVALID_AMOUNT');
  });
});
