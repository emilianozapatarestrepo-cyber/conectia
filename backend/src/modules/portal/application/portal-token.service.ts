import { createHash, randomBytes } from 'node:crypto';
import { db } from '../../../shared/database/db.js';

/**
 * Portal Residente — capability tokens per unit.
 *
 * Security model (mirrors /pay/:reference):
 * - Raw token: 256 bits of CSPRNG entropy, base64url (43 chars). Travels only
 *   in the URL shared with the resident via WhatsApp.
 * - Storage: only SHA-256(token) is persisted. A DB leak does not expose links.
 * - Lookup is by unique hash index — equality on a high-entropy digest, the
 *   standard pattern for reset/magic tokens (no timing oracle: the attacker
 *   would need to predict 256 random bits).
 * - Rotation: issuing a new token revokes all previous ones for the unit.
 */

export interface PortalContext {
  tenantId: string;
  unitId:   string;
}

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/** Issues a fresh token for a unit, revoking any previous active tokens. */
export async function rotatePortalToken(
  tenantId: string,
  unitId: string,
): Promise<string> {
  const rawToken = randomBytes(32).toString('base64url');

  await db.transaction().execute(async (trx) => {
    await trx
      .updateTable('unitPortalTokens')
      .set({ active: false, revokedAt: new Date() })
      .where('tenantId', '=', tenantId)
      .where('unitId', '=', unitId)
      .where('active', '=', true)
      .execute();

    await trx
      .insertInto('unitPortalTokens')
      .values({ tenantId, unitId, tokenHash: hashToken(rawToken) })
      .execute();
  });

  return rawToken;
}

/** Tokens expire even if never rotated — caps exposure of forwarded WhatsApp links. */
const TOKEN_TTL_MS = 180 * 24 * 60 * 60 * 1000; // 180 days

/**
 * Resolves a raw token to its tenant/unit context, or null if
 * invalid / revoked / expired / unit no longer active.
 *
 * The units join is deliberate: deactivating a unit (soft-delete) must kill
 * its portal access on EVERY endpoint, not just the ones that re-check.
 * Touches last_accessed_at for adoption analytics.
 */
export async function resolvePortalToken(rawToken: string): Promise<PortalContext | null> {
  // Cheap rejection of garbage before hitting the DB
  if (rawToken.length < 20 || rawToken.length > 100) return null;

  const row = await db
    .selectFrom('unitPortalTokens as t')
    .innerJoin('units as u', (join) =>
      join
        .onRef('u.unitId', '=', 't.unitId')
        .onRef('u.tenantId', '=', 't.tenantId'),
    )
    .select(['t.id', 't.tenantId', 't.unitId'])
    .where('t.tokenHash', '=', hashToken(rawToken))
    .where('t.active', '=', true)
    .where('t.createdAt', '>', new Date(Date.now() - TOKEN_TTL_MS))
    .where('u.active', '=', true)
    .executeTakeFirst();

  if (!row) return null;

  // Fire-and-forget analytics touch — portal reads must not fail on this
  void db
    .updateTable('unitPortalTokens')
    .set({ lastAccessedAt: new Date() })
    .where('id', '=', row.id)
    .execute()
    .catch(() => { /* non-critical */ });

  return { tenantId: row.tenantId, unitId: row.unitId };
}

/**
 * Revokes all active tokens for a unit. Call on unit deactivation and on
 * owner change (apartment sold/re-rented): the old resident's link must die.
 */
export async function revokeUnitPortalTokens(
  tenantId: string,
  unitId: string,
): Promise<void> {
  await db
    .updateTable('unitPortalTokens')
    .set({ active: false, revokedAt: new Date() })
    .where('tenantId', '=', tenantId)
    .where('unitId', '=', unitId)
    .where('active', '=', true)
    .execute();
}
