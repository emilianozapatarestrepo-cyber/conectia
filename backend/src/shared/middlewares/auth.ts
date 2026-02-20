import type { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import admin from 'firebase-admin';
import { env } from '../../config/env.js';
import { db } from '../database/db.js';
import { AppError } from '../../modules/ledger/domain/errors.js';
import type { MembershipRole } from '../database/schema.js';

// ─── Firebase Admin Initialization (singleton, thread-safe) ─────────────────

let firebaseInitialized = false;

function ensureFirebaseInit(): void {
  if (firebaseInitialized) return;

  if (env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
  } else {
    // GCP environments: Application Default Credentials
    admin.initializeApp({ projectId: env.FIREBASE_PROJECT_ID });
  }

  firebaseInitialized = true;
  console.log('[Auth] Firebase Admin initialized ✓');
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AuthenticatedUser {
  /** Firebase UID — always present after requireAuth */
  uid: string;
  /** Email from Firebase Auth */
  email: string | undefined;
  /**
   * Role resolved from tenant_memberships (server-side source of truth).
   * Populated by requireTenant middleware, NOT from custom claims.
   * undefined if requireTenant hasn't run yet.
   */
  role: MembershipRole | undefined;
  /**
   * Tenant ID resolved from tenant_memberships (server-side source of truth).
   * Populated by requireTenant middleware via DB query.
   * undefined if requireTenant hasn't run yet.
   */
  tenantId: string | undefined;
  /**
   * Unit ID resolved from tenant_memberships (server-side source of truth).
   * Nullable for admin/staff users who aren't assigned to a specific unit.
   */
  unitId: string | undefined;
}

// Extend Express Request globally
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

// ─── Middleware: requireAuth ─────────────────────────────────────────────────

/**
 * Zero-Trust Auth Middleware (Identity Layer).
 *
 * 1. Extracts JWT from `Authorization: Bearer <token>`.
 * 2. Verifies the token against Firebase Admin (signature + expiry + revocation).
 * 3. Extracts uid and email ONLY. Role and tenant come from DB (see requireTenant).
 * 4. Injects into req.user for downstream handlers.
 * 5. Rejects with UNAUTHORIZED AppError if anything fails.
 *
 * SECURITY: checkRevoked=true ensures revoked tokens are immediately rejected.
 *
 * IMPORTANT: This middleware does NOT resolve tenant or role.
 * Use requireTenant (which queries tenant_memberships) for tenant-scoped routes.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  ensureFirebaseInit();

  const authHeader = req.headers.authorization;

  // ── Guard: Missing or malformed header ──
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next(
      new AppError(
        'MISSING_TOKEN',
        'Authorization header with Bearer token is required',
        StatusCodes.UNAUTHORIZED,
      ),
    );
    return;
  }

  const token = authHeader.slice(7).trim();

  if (token.length === 0) {
    next(
      new AppError('EMPTY_TOKEN', 'Bearer token is empty', StatusCodes.UNAUTHORIZED),
    );
    return;
  }

  // ── Verify token (async → promise chain to call next()) ──
  admin
    .auth()
    .verifyIdToken(token, /* checkRevoked */ true)
    .then((decoded) => {
      // ONLY extract identity. Role + tenant resolved by requireTenant via DB.
      req.user = {
        uid: decoded.uid,
        email: decoded.email,
        role: undefined,     // Resolved by requireTenant
        tenantId: undefined, // Resolved by requireTenant
        unitId: undefined,   // Resolved by requireTenant
      };

      next();
    })
    .catch((error: Error) => {
      const firebaseCode = (error as unknown as Record<string, unknown>)['code'];

      let appErr: AppError;

      if (firebaseCode === 'auth/id-token-expired') {
        appErr = new AppError(
          'TOKEN_EXPIRED',
          'Authentication token has expired. Please re-authenticate.',
          StatusCodes.UNAUTHORIZED,
        );
      } else if (firebaseCode === 'auth/id-token-revoked') {
        appErr = new AppError(
          'TOKEN_REVOKED',
          'Authentication token has been revoked. Please re-authenticate.',
          StatusCodes.UNAUTHORIZED,
        );
      } else if (firebaseCode === 'auth/argument-error') {
        appErr = new AppError(
          'MALFORMED_TOKEN',
          'The provided token is malformed or not a valid Firebase ID token.',
          StatusCodes.UNAUTHORIZED,
        );
      } else {
        console.warn('[Auth] Token verification failed:', firebaseCode, error.message);
        appErr = new AppError(
          'INVALID_TOKEN',
          'Invalid or expired authentication token',
          StatusCodes.UNAUTHORIZED,
        );
      }

      next(appErr);
    });
}

// ─── Middleware: requireTenant ───────────────────────────────────────────────

/**
 * Tenant Resolution Middleware (Authorization Layer).
 * Must be placed AFTER requireAuth in the middleware chain.
 *
 * Resolves tenant membership from PostgreSQL (source of truth), NOT custom claims.
 *
 * Flow:
 *   1. Extract firebase_uid from req.user (set by requireAuth).
 *   2. Query tenant_memberships WHERE firebase_uid = $1 AND status = 'active'.
 *   3. If membership found → set req.user.tenantId, role, unitId from DB row.
 *   4. If no membership → reject with FORBIDDEN.
 *
 * SECURITY:
 * - tenantId is NEVER accepted from the client (body, query, params).
 * - Role is resolved server-side from the DB, not from JWT custom claims.
 * - Custom claims may be used as a CACHE by the iOS app for UI rendering,
 *   but the backend always re-resolves from tenant_memberships.
 *
 * NOTE: For users with multiple tenant memberships (future multi-building),
 * the client sends a X-Tenant-Id header to select which tenant context.
 * If absent, the first active membership is used.
 */
export function requireTenant(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(
      new AppError('NOT_AUTHENTICATED', 'Authentication required', StatusCodes.UNAUTHORIZED),
    );
    return;
  }

  const firebaseUid = req.user.uid;

  // Optional: client can specify which tenant context (for multi-building users)
  const requestedTenantId = req.headers['x-tenant-id'];
  const tenantIdFilter =
    typeof requestedTenantId === 'string' && requestedTenantId.length > 0
      ? requestedTenantId
      : undefined;

  // Query tenant_memberships — the authoritative source of truth
  let query = db
    .selectFrom('tenantMemberships')
    .select(['tenantId', 'role', 'unitId'])
    .where('firebaseUid', '=', firebaseUid)
    .where('status', '=', 'active');

  if (tenantIdFilter) {
    query = query.where('tenantId', '=', tenantIdFilter);
  }

  query
    .limit(1)
    .executeTakeFirst()
    .then((membership) => {
      if (!membership) {
        next(
          new AppError(
            'NO_TENANT_MEMBERSHIP',
            tenantIdFilter
              ? `No active membership for tenant ${tenantIdFilter}. Request access from the building administrator.`
              : 'User has no active building membership. Complete onboarding first.',
            StatusCodes.FORBIDDEN,
          ),
        );
        return;
      }

      // Hydrate req.user with server-resolved tenant context
      req.user!.tenantId = membership.tenantId;
      req.user!.role = membership.role as MembershipRole;
      req.user!.unitId = membership.unitId ?? undefined;

      next();
    })
    .catch((error: Error) => {
      console.error('[Auth] tenant_memberships query failed:', error.message);
      next(
        new AppError(
          'TENANT_RESOLUTION_FAILED',
          'Failed to resolve tenant membership. Please try again.',
          StatusCodes.INTERNAL_SERVER_ERROR,
        ),
      );
    });
}

// ─── Middleware: requireRole ─────────────────────────────────────────────────

/**
 * Factory that creates a role-check middleware.
 * Must be placed AFTER requireTenant in the middleware chain
 * (because requireTenant resolves the role from DB).
 *
 * Usage:
 *   router.post('/charges', requireAuth, requireTenant, requireRole('admin', 'manager'), handler);
 */
export function requireRole(...allowedRoles: MembershipRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(
        new AppError('NOT_AUTHENTICATED', 'Authentication required', StatusCodes.UNAUTHORIZED),
      );
      return;
    }

    if (!req.user.role || !allowedRoles.includes(req.user.role)) {
      next(
        new AppError(
          'FORBIDDEN',
          `One of these roles is required: ${allowedRoles.join(', ')}. Your role: ${req.user.role ?? 'none'}`,
          StatusCodes.FORBIDDEN,
        ),
      );
      return;
    }

    next();
  };
}

// ─── Convenience: requireAdmin ──────────────────────────────────────────────

/**
 * Shortcut middleware that requires the 'admin' role.
 * Must be placed AFTER requireTenant.
 *
 * Usage:
 *   router.post('/transactions', requireAuth, requireTenant, requireAdmin, handler);
 */
export const requireAdmin = requireRole('admin');
