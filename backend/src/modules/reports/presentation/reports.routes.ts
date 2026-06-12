import { Router } from 'express';
import { z } from 'zod';
import { sql } from 'kysely';
import { db } from '../../../shared/database/db.js';
import { requireAuth, requireTenant, requireAdmin } from '../../../shared/middlewares/auth.js';
import { generateBalanceGeneralPDF, generateEstadoResultadosPDF } from '../../export/infrastructure/pdf.generator.js';

// ── Shared types ──────────────────────────────────────────────────────────────

interface ReportAccount {
  id: string;
  code: string;
  name: string;
  accountType: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  parentId: string | null;
  balance: string;
}

interface LedgerRow {
  id: string;
  code: string;
  name: string;
  accountType: string;
  parentId: string | null;
  balance: string;
}

// ── Balance SQL ───────────────────────────────────────────────────────────────

async function fetchAccountBalances(
  tenantId: string,
  filter: { asOf: string } | { from: string; to: string },
): Promise<ReportAccount[]> {
  const typeFilter =
    'asOf' in filter
      ? sql`coa.account_type IN ('asset', 'liability', 'equity')`
      : sql`coa.account_type IN ('revenue', 'expense')`;

  const dateFilter =
    'asOf' in filter
      ? sql`(t.id IS NULL OR t.transacted_at::date <= ${filter.asOf}::date)`
      : sql`t.transacted_at::date BETWEEN ${'from' in filter ? filter.from : ''}::date AND ${'to' in filter ? filter.to : ''}::date`;

  const rows = await sql<LedgerRow>`
    SELECT
      coa.id,
      coa.code,
      coa.name,
      coa.account_type  AS "accountType",
      coa.parent_id     AS "parentId",
      COALESCE(SUM(
        CASE
          WHEN le.entry_type = 'debit'  AND coa.account_type IN ('asset', 'expense')                    THEN  le.amount
          WHEN le.entry_type = 'credit' AND coa.account_type IN ('asset', 'expense')                    THEN -le.amount
          WHEN le.entry_type = 'credit' AND coa.account_type IN ('liability', 'equity', 'revenue') THEN  le.amount
          WHEN le.entry_type = 'debit'  AND coa.account_type IN ('liability', 'equity', 'revenue') THEN -le.amount
          ELSE 0
        END
      ), 0)::TEXT AS balance
    FROM chart_of_accounts coa
    LEFT JOIN ledger_entries le
      ON  le.account_id = coa.id
      AND le.tenant_id  = coa.tenant_id
    LEFT JOIN transactions t
      ON  t.id        = le.transaction_id
      AND t.tenant_id = coa.tenant_id
      AND t.status    = 'confirmed'
      AND ${dateFilter}
    WHERE coa.tenant_id = ${tenantId}
      AND coa.is_active = true
      AND ${typeFilter}
    GROUP BY coa.id, coa.code, coa.name, coa.account_type, coa.parent_id
    HAVING COALESCE(SUM(
      CASE
        WHEN le.entry_type = 'debit'  AND coa.account_type IN ('asset', 'expense')               THEN  le.amount
        WHEN le.entry_type = 'credit' AND coa.account_type IN ('asset', 'expense')               THEN -le.amount
        WHEN le.entry_type = 'credit' AND coa.account_type IN ('liability', 'equity', 'revenue') THEN  le.amount
        WHEN le.entry_type = 'debit'  AND coa.account_type IN ('liability', 'equity', 'revenue') THEN -le.amount
        ELSE 0
      END
    ), 0) <> 0
    ORDER BY coa.code
  `.execute(db);

  return rows.rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    accountType: r.accountType as ReportAccount['accountType'],
    parentId: r.parentId,
    balance: r.balance,
  }));
}

function sumByType(accounts: ReportAccount[], type: ReportAccount['accountType']): bigint {
  return accounts
    .filter((a) => a.accountType === type)
    .reduce((s, a) => s + BigInt(a.balance), 0n);
}

// ── Router ────────────────────────────────────────────────────────────────────

export function createReportsRouter(): Router {
  const router = Router();
  router.use(requireAuth, requireTenant, requireAdmin);

  // ── GET /reports/balance-general ─────────────────────────────────────────
  router.get('/balance-general', async (req, res, next) => {
    try {
      const { asOf } = z.object({
        asOf: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/).default(
          new Date().toISOString().slice(0, 10)
        ),
      }).parse(req.query);

      const accounts = await fetchAccountBalances(req.user!.tenantId!, { asOf });

      res.json({
        asOf,
        generatedAt: new Date().toISOString(),
        accounts,
        totals: {
          assets:      String(sumByType(accounts, 'asset')),
          liabilities: String(sumByType(accounts, 'liability')),
          equity:      String(sumByType(accounts, 'equity')),
        },
      });
    } catch (err) { next(err); }
  });

  // ── GET /reports/estado-resultados ───────────────────────────────────────
  router.get('/estado-resultados', async (req, res, next) => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const firstOfMonth = today.slice(0, 8) + '01';
      const { from, to } = z.object({
        from: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/).default(firstOfMonth),
        to:   z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/).default(today),
      }).parse(req.query);

      const accounts = await fetchAccountBalances(req.user!.tenantId!, { from, to });

      const revenue  = sumByType(accounts, 'revenue');
      const expenses = sumByType(accounts, 'expense');

      res.json({
        from,
        to,
        generatedAt: new Date().toISOString(),
        accounts,
        totals: {
          revenue:   String(revenue),
          expenses:  String(expenses),
          netIncome: String(revenue - expenses),
        },
      });
    } catch (err) { next(err); }
  });

  // ── GET /reports/balance-general/pdf ────────────────────────────────────
  router.get('/balance-general/pdf', async (req, res, next) => {
    try {
      const { asOf } = z.object({
        asOf: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/).default(
          new Date().toISOString().slice(0, 10)
        ),
      }).parse(req.query);

      const accounts = await fetchAccountBalances(req.user!.tenantId!, { asOf });

      const pdfBuffer = await generateBalanceGeneralPDF({
        buildingName: 'Conjunto Residencial',
        asOf,
        generatedAt: new Date().toLocaleDateString('es-CO'),
        accounts,
        totals: {
          assets:      sumByType(accounts, 'asset'),
          liabilities: sumByType(accounts, 'liability'),
          equity:      sumByType(accounts, 'equity'),
        },
      });

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="balance-general-${asOf}.pdf"`,
        'Content-Length': String(pdfBuffer.length),
      });
      res.send(pdfBuffer);
    } catch (err) { next(err); }
  });

  // ── GET /reports/estado-resultados/pdf ──────────────────────────────────
  router.get('/estado-resultados/pdf', async (req, res, next) => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const firstOfMonth = today.slice(0, 8) + '01';
      const { from, to } = z.object({
        from: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/).default(firstOfMonth),
        to:   z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/).default(today),
      }).parse(req.query);

      const accounts = await fetchAccountBalances(req.user!.tenantId!, { from, to });
      const revenue  = sumByType(accounts, 'revenue');
      const expenses = sumByType(accounts, 'expense');

      const pdfBuffer = await generateEstadoResultadosPDF({
        buildingName: 'Conjunto Residencial',
        from,
        to,
        generatedAt: new Date().toLocaleDateString('es-CO'),
        accounts,
        totals: {
          revenue,
          expenses,
          netIncome: revenue - expenses,
        },
      });

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="estado-resultados-${from}-${to}.pdf"`,
        'Content-Length': String(pdfBuffer.length),
      });
      res.send(pdfBuffer);
    } catch (err) { next(err); }
  });

  return router;
}
