import { sql } from 'kysely';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../../shared/database/db.js';

export interface OnboardTenantInput {
  name: string;
  address: string | null;
  taxId: string | null;
  type: string;            // 'conjunto_residencial' | 'edificio' | 'oficinas'
  currency?: string;
  timezone?: string;
  adminFirebaseUid: string;
}

export interface OnboardTenantResult {
  tenantId: string;
  name: string;
  accountsSeeded: number;
}

export class OnboardTenantUseCase {
  async execute(input: OnboardTenantInput): Promise<OnboardTenantResult> {
    const {
      name, address, taxId, type, currency = 'COP',
      timezone = 'America/Bogota', adminFirebaseUid,
    } = input;

    if (!name?.trim()) throw new Error('INVALID_INPUT: name is required');
    if (!adminFirebaseUid?.trim()) throw new Error('INVALID_INPUT: adminFirebaseUid is required');

    return db.transaction().execute(async (trx) => {
      // 1. Create tenant
      const tenantId = uuidv4();
      await trx.insertInto('tenants').values({
        id: tenantId,
        name: name.trim(),
        type,
        address,
        taxId,
        currency,
        timezone,
        isActive: true,
      }).execute();

      // 2. Seed chart of accounts (calls the Postgres function from migration 001)
      await sql`SELECT fn_seed_chart_of_accounts(${sql.lit(tenantId)}::uuid)`.execute(trx);

      // 3. Create admin membership
      await trx.insertInto('tenantMemberships').values({
        id: uuidv4(),
        firebaseUid: adminFirebaseUid,
        tenantId,
        role: 'admin',
        status: 'active',
      }).execute();

      // 4. Count seeded accounts to confirm
      const { count } = await trx
        .selectFrom('chartOfAccounts')
        .select((eb) => eb.fn.countAll<number>().as('count'))
        .where('tenantId', '=', tenantId)
        .executeTakeFirstOrThrow();

      return {
        tenantId,
        name: name.trim(),
        accountsSeeded: Number(count),
      };
    });
  }
}
