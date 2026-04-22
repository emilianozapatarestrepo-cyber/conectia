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
    const pi = await this.repo.getPaymentIntent(tenantId, paymentIntentId);
    if (!pi || pi.status !== 'pending') {
      throw new Error(
        `Cannot reconcile payment intent ${paymentIntentId}: status is ${pi?.status ?? 'not found'}`,
      );
    }
    if (action === 'approve') {
      await this.repo.approve(tenantId, paymentIntentId, actorId);
    } else {
      await this.repo.reject(tenantId, paymentIntentId, actorId, reason ?? 'Rechazado por administrador');
    }
  }
}
