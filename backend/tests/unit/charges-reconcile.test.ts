import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReconcileUseCase } from '../../src/modules/charges/application/reconcile.usecase.js';

const mockRepo = {
  approve: vi.fn(),
  reject: vi.fn(),
  getPaymentIntent: vi.fn(),
  list: vi.fn(),
  getDelinquent: vi.fn(),
  getPendingReconciliation: vi.fn(),
};

describe('ReconcileUseCase', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls approve with correct args when action=approve', async () => {
    mockRepo.getPaymentIntent.mockResolvedValue({ id: 'pi-1', status: 'pending', chargeId: 'c-1', amount: 100000n });
    mockRepo.approve.mockResolvedValue(undefined);
    const uc = new ReconcileUseCase(mockRepo as any);
    await uc.execute('tenant-1', 'pi-1', 'approve', 'admin-1');
    expect(mockRepo.approve).toHaveBeenCalledWith('tenant-1', 'pi-1', 'admin-1');
  });

  it('calls reject with correct args when action=reject', async () => {
    mockRepo.getPaymentIntent.mockResolvedValue({ id: 'pi-1', status: 'pending', chargeId: 'c-1', amount: 100000n });
    mockRepo.reject.mockResolvedValue(undefined);
    const uc = new ReconcileUseCase(mockRepo as any);
    await uc.execute('tenant-1', 'pi-1', 'reject', 'admin-1', 'Comprobante inválido');
    expect(mockRepo.reject).toHaveBeenCalledWith('tenant-1', 'pi-1', 'admin-1', 'Comprobante inválido');
  });

  it('throws if payment intent not found', async () => {
    mockRepo.getPaymentIntent.mockResolvedValue(null);
    const uc = new ReconcileUseCase(mockRepo as any);
    await expect(uc.execute('tenant-1', 'pi-1', 'approve', 'admin-1')).rejects.toThrow('Cannot reconcile');
  });

  it('throws if payment intent not in pending status', async () => {
    mockRepo.getPaymentIntent.mockResolvedValue({ id: 'pi-1', status: 'approved' });
    const uc = new ReconcileUseCase(mockRepo as any);
    await expect(uc.execute('tenant-1', 'pi-1', 'approve', 'admin-1')).rejects.toThrow('Cannot reconcile');
  });
});
