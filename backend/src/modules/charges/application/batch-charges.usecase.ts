import { CreateChargeUseCase, type CreateChargeInput } from './create-charge.usecase.js';
import { logger } from '../../../shared/logger.js';

const log = logger.child({ module: 'batch-charges' });

export interface BatchChargeUnit {
  unitId: string;
  unitLabel: string;
  ownerName: string | null;
  userId: string;
  amount: bigint;          // each unit can have a different amount (variable fees)
}

export interface BatchChargeInput {
  tenantId: string;
  units: BatchChargeUnit[];
  concept: string;
  dueDate: Date;
  periodId: string | null;
  createdBy: string;
}

export interface BatchChargeResult {
  created: number;
  failed: number;
  errors: Array<{ unitId: string; reason: string }>;
  chargeIds: string[];
}

export class BatchChargesUseCase {
  private readonly createUC = new CreateChargeUseCase();

  async execute(input: BatchChargeInput): Promise<BatchChargeResult> {
    const { tenantId, units, concept, dueDate, periodId, createdBy } = input;

    if (units.length === 0) throw new Error('INVALID_INPUT: units array is empty');
    if (units.length > 500) throw new Error('INVALID_INPUT: max 500 units per batch');

    const chargeIds: string[] = [];
    const errors: Array<{ unitId: string; reason: string }> = [];

    // Sequential: each charge acquires the ledger state FOR UPDATE lock.
    // Parallel execution would deadlock on that row.
    for (const unit of units) {
      const chargeInput: CreateChargeInput = {
        tenantId,
        unitId: unit.unitId,
        unitLabel: unit.unitLabel,
        ownerName: unit.ownerName,
        userId: unit.userId,
        amount: unit.amount,
        concept,
        dueDate,
        periodId,
        createdBy,
      };

      try {
        const { chargeId } = await this.createUC.execute(chargeInput);
        chargeIds.push(chargeId);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        log.warn({ unitId: unit.unitId, reason }, 'Batch charge failed for unit');
        errors.push({ unitId: unit.unitId, reason });
      }
    }

    log.info(
      { tenantId, created: chargeIds.length, failed: errors.length },
      'Batch charge generation complete',
    );

    return {
      created: chargeIds.length,
      failed: errors.length,
      errors,
      chargeIds,
    };
  }
}
