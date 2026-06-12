import { v4 as uuidv4 } from 'uuid';
import type { Transaction } from 'kysely';
import { db } from '../../../shared/database/db.js';
import type { DB, SubscriptionStatus } from '../../../shared/database/schema.js';

export interface SubscriptionView {
  id:                 string;
  planCode:           string;
  planName:           string;
  maxUnits:           number | null;
  monthlyPriceCents:  string;            // bigint → string
  status:             SubscriptionStatus;
  trialEndsAt:        Date | null;
  currentPeriodEnd:   Date;
  daysRemaining:      number;
  isTrialing:         boolean;
  isActive:           boolean;
  isExpired:          boolean;
  features:           Record<string, unknown>;
}

const TRIAL_DAYS  = 30;
const GRACE_DAYS  = 7;

// ── Read ──────────────────────────────────────────────────────────────────────

export async function getSubscription(tenantId: string): Promise<SubscriptionView | null> {
  const row = await db
    .selectFrom('subscriptions as s')
    .innerJoin('plans as p', 'p.id', 's.planId')
    .select([
      's.id', 's.status', 's.trialEndsAt', 's.currentPeriodEnd',
      'p.code as planCode', 'p.name as planName', 'p.maxUnits',
      'p.monthlyPriceCents', 'p.features',
    ])
    .where('s.tenantId', '=', tenantId)
    .executeTakeFirst();

  if (!row) return null;

  const now = new Date();
  const periodEnd = new Date(row.currentPeriodEnd);
  const daysRemaining = Math.ceil((periodEnd.getTime() - now.getTime()) / 86_400_000);

  const isExpired = (['expired', 'cancelled'] as SubscriptionStatus[]).includes(row.status)
    || (row.status === 'past_due' && daysRemaining < -GRACE_DAYS);

  return {
    id:                row.id,
    planCode:          row.planCode,
    planName:          row.planName,
    maxUnits:          row.maxUnits,
    monthlyPriceCents: String(row.monthlyPriceCents),
    status:            row.status,
    trialEndsAt:       row.trialEndsAt ? new Date(row.trialEndsAt) : null,
    currentPeriodEnd:  periodEnd,
    daysRemaining:     Math.max(daysRemaining, 0),
    isTrialing:        row.status === 'trialing',
    isActive:          !isExpired,
    isExpired,
    features:          typeof row.features === 'object' ? (row.features as Record<string, unknown>) : {},
  };
}

// ── Create trial on tenant onboarding ─────────────────────────────────────────

export async function createTrialSubscription(
  tenantId: string,
  trx: Transaction<DB>,
): Promise<void> {
  const trialPlan = await trx
    .selectFrom('plans')
    .select('id')
    .where('code', '=', 'trial')
    .where('isActive', '=', true)
    .executeTakeFirst();

  if (!trialPlan) return; // Plans not seeded yet (first boot before migration 006)

  const now      = new Date();
  const trialEnd = new Date(now);
  trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS);

  await trx.insertInto('subscriptions').values({
    id:                 uuidv4(),
    tenantId,
    planId:             trialPlan.id,
    status:             'trialing',
    trialEndsAt:        trialEnd,
    currentPeriodStart: now,
    currentPeriodEnd:   trialEnd,
    activatedBy:        'system',
  }).onConflict((oc) => oc.column('tenantId').doNothing()).execute();
}

// ── Activate / upgrade plan (platform-level action) ──────────────────────────

export async function activatePlan(
  tenantId:      string,
  planCode:      string,
  activatedBy:   string,
  paymentMethod: string,
  externalRef:   string | null,
): Promise<SubscriptionView> {
  const plan = await db
    .selectFrom('plans')
    .select(['id', 'code'])
    .where('code', '=', planCode)
    .where('isActive', '=', true)
    .executeTakeFirst();

  if (!plan) throw new Error(`PLAN_NOT_FOUND: ${planCode}`);

  const now       = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  await db
    .insertInto('subscriptions')
    .values({
      id:                 uuidv4(),
      tenantId,
      planId:             plan.id,
      status:             'active',
      trialEndsAt:        null,
      currentPeriodStart: now,
      currentPeriodEnd:   periodEnd,
      paymentMethod,
      externalRef,
      activatedBy,
    })
    .onConflict((oc) =>
      oc.column('tenantId').doUpdateSet({
        planId:             plan.id,
        status:             'active',
        trialEndsAt:        null,
        currentPeriodStart: now,
        currentPeriodEnd:   periodEnd,
        paymentMethod,
        externalRef,
        activatedBy,
        updatedAt:          now,
      }),
    )
    .execute();

  const sub = await getSubscription(tenantId);
  if (!sub) throw new Error('SUBSCRIPTION_NOT_FOUND_AFTER_ACTIVATE');
  return sub;
}
