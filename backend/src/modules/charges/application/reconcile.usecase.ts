import type { IChargesRepository } from '../domain/interfaces.js';

export class ReconcileUseCase {
  constructor(private readonly repo: IChargesRepository) {}

  async execute(
    tenantId: string,
    paymentIntentId: string,
    action: 'approve' | 'reject',
    actorId: string,
    reason?: string,
  ): Promise<void> {
    // Verify existence and status before delegating.
    // The repository additionally guards with WHERE status='pending' + numUpdatedRows check
    // to prevent TOCTOU races under concurrent requests.
    const pi = await this.repo.getPaymentIntent(tenantId, paymentIntentId);
    if (!pi) {
      throw new Error(`PI_NOT_FOUND: payment intent ${paymentIntentId} not found`);
    }
    if (pi.status !== 'pending') {
      throw new Error(`PI_INVALID_STATE: payment intent ${paymentIntentId} status is ${pi.status}`);
    }

    if (action === 'approve') {
      await this.repo.approve(tenantId, paymentIntentId, actorId);
    } else {
      await this.repo.reject(tenantId, paymentIntentId, actorId, reason ?? 'Rechazado por administrador');
    }
  }
}
