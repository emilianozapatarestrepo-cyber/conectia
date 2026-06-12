import { CreateChargeUseCase, type CreateChargeInput } from './create-charge.usecase.js';
import { db } from '../../../shared/database/db.js';
import { logger } from '../../../shared/logger.js';

const log = logger.child({ module: 'batch-charges' });

export interface BatchChargeUnit {
  unitId:    string;
  unitLabel: string;
  ownerName: string | null;
  userId:    string;
  amount:    bigint;
}

export interface BatchChargeInput {
  tenantId:       string;
  // Provide units explicitly, OR set useRoster=true to pull from the units table
  units?:         BatchChargeUnit[];
  useRoster?:     boolean;
  // userId used for all units when pulling from roster (resident UID or 'system')
  rosterUserId?:  string;
  concept:        string;
  dueDate:        Date;
  periodId:       string | null;
  createdBy:      string;
}

export interface BatchChargeResult {
  created:   number;
  failed:    number;
  errors:    Array<{ unitId: string; reason: string }>;
  chargeIds: string[];
}

export class BatchChargesUseCase {
  private readonly createUC = new CreateChargeUseCase();

  async execute(input: BatchChargeInput): Promise<BatchChargeResult> {
    const { tenantId, concept, dueDate, periodId, createdBy } = input;

    let units: BatchChargeUnit[];

    if (input.useRoster) {
      // Pull active units from the roster — the admin registers once, charges forever
      const rows = await db
        .selectFrom('units')
        .select(['unitId', 'label', 'ownerName', 'feeAmount'])
        .where('tenantId', '=', tenantId)
        .where('active',   '=', true)
        .orderBy('unitId',  'asc')
        .execute();

      if (rows.length === 0) {
        throw new Error('ROSTER_EMPTY: no active units found — add units first');
      }

      units = rows.map((r) => ({
        unitId:    r.unitId,
        unitLabel: r.label,
        ownerName: r.ownerName ?? null,
        userId:    input.rosterUserId ?? 'system',
        amount:    typeof r.feeAmount === 'bigint'
          ? r.feeAmount
          : BigInt(String(r.feeAmount ?? 0)),
      }));
    } else {
      units = input.units ?? [];
    }

    if (units.length === 0) throw new Error('INVALID_INPUT: units array is empty');
    if (units.length > 500) throw new Error('INVALID_INPUT: max 500 units per batch');

    const chargeIds: string[] = [];
    const errors: Array<{ unitId: string; reason: string }> = [];

    // Sequential: each charge holds the ledger state FOR UPDATE lock
    for (const unit of units) {
      const chargeInput: CreateChargeInput = {
        tenantId,
        unitId:    unit.unitId,
        unitLabel: unit.unitLabel,
        ownerName: unit.ownerName,
        userId:    unit.userId,
        amount:    unit.amount,
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

    return { created: chargeIds.length, failed: errors.length, errors, chargeIds };
  }
}
