import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireTenant, requireAdmin } from '../../../shared/middlewares/auth.js';
import { requireSubscription } from '../../billing/application/require-subscription.js';
import { ChargesRepository } from '../../charges/infrastructure/charges.repository.js';
import { sql } from 'kysely';
import { db, withTenantTransaction } from '../../../shared/database/db.js';
import { generateStatementPDF } from '../infrastructure/pdf.generator.js';
import { generatePortfolioExcel } from '../infrastructure/excel.generator.js';

export function createExportRouter(): Router {
  const router = Router();
  const chargesRepo = new ChargesRepository();

  router.use(requireAuth, requireTenant, requireSubscription);

  // GET /export/statement?unitId=&period=YYYY-MM
  router.get('/statement', requireAdmin, async (req, res, next) => {
    try {
      const { unitId, period } = z.object({
        unitId: z.string().regex(/^[A-Za-z0-9_\-]{1,64}$/, 'unitId must be alphanumeric'),
        period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
      }).parse(req.query);

      const tenantId = req.user!.tenantId!;
      const [charges, tenant] = await Promise.all([
        chargesRepo.list(tenantId, { unitId, period }),
        db.selectFrom('tenants').select('name').where('id', '=', tenantId).executeTakeFirst(),
      ]);

      if (charges.length === 0) {
        res.status(404).json({ error: 'No charges found for this unit in the requested period' });
        return;
      }

      const totalOwed = charges
        .filter((c) => c.status !== 'paid')
        .reduce((s, c) => s + c.amount, 0n);

      const buildingName = tenant?.name ?? 'Conjunto Residencial';
      const pdfBuffer = await generateStatementPDF({
        buildingName,
        period,
        unitLabel: charges[0]?.unitLabel ?? unitId,
        ownerName: charges[0]?.ownerName ?? null,
        charges: charges.map((c) => ({
          concept: c.concept,
          dueDate: c.dueDate.toLocaleDateString('es-CO'),
          amount: `$${Number(c.amount / 100n).toLocaleString('es-CO')}`,
          status: c.status === 'paid' ? 'Pagado' : 'Pendiente',
        })),
        totalOwed: `$${Number(totalOwed / 100n).toLocaleString('es-CO')}`,
        generatedAt: new Date().toLocaleDateString('es-CO'),
      });

      const safeUnitId = encodeURIComponent(unitId);
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="estado-cuenta-${safeUnitId}-${period}.pdf"`,
        'Content-Length': String(pdfBuffer.length),
      });
      res.send(pdfBuffer);
    } catch (err) { next(err); }
  });

  // GET /export/libro-auxiliar?period=YYYY-MM — Libro auxiliar de cartera (CSV para contadores)
  router.get('/libro-auxiliar', requireAdmin, async (req, res, next) => {
    try {
      const { period } = z.object({
        period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
      }).parse(req.query);

      const tenantId = req.user!.tenantId!;
      const [year, month] = period.split('-').map(Number);
      const startOfMonth = new Date(year!, month! - 1, 1);
      const startOfNextMonth = new Date(year!, month!, 1);

      const rows = await withTenantTransaction(tenantId, async (trx) =>
        trx
          .selectFrom('ledgerEntries as le')
          .innerJoin('transactions as t', 't.id', 'le.transactionId')
          .innerJoin('chartOfAccounts as coa', 'coa.id', 'le.accountId')
          .leftJoin('charges as c', (j) =>
            j.onRef('c.id', '=', 't.sourceId').on('t.sourceType', '=', 'charge')
          )
          .where('le.tenantId', '=', tenantId)
          .where('t.effectiveDate', '>=', startOfMonth)
          .where('t.effectiveDate', '<', startOfNextMonth)
          .select([
            't.effectiveDate',
            't.transactionType',
            't.sourceId',
            'coa.code',
            'coa.name',
            'le.entryType',
            'le.description',
            'le.amount',
            'c.unitLabel',
          ])
          .orderBy('t.effectiveDate', 'asc')
          .orderBy('t.id', 'asc')
          .execute()
      );

      const BOM = '﻿';
      const header = 'Fecha;Comprobante;Cuenta;NombreCuenta;Tercero;Detalle;Debito;Credito;Referencia';
      const csvLines = rows.map((r) => {
        const amountBigint = typeof r.amount === 'bigint' ? r.amount : BigInt(String(r.amount ?? '0'));
        const amountPesos = Number(amountBigint) / 100;
        const debit = r.entryType === 'debit' ? amountPesos.toFixed(2).replace('.', ',') : '0,00';
        const credit = r.entryType === 'credit' ? amountPesos.toFixed(2).replace('.', ',') : '0,00';
        const fecha = r.effectiveDate instanceof Date
          ? r.effectiveDate.toISOString().slice(0, 10)
          : String(r.effectiveDate).slice(0, 10);
        return [
          fecha,
          r.transactionType ?? '',
          r.code ?? '',
          r.name ?? '',
          r.unitLabel ?? '',
          (r.description ?? '').replace(/;/g, ','),
          debit,
          credit,
          r.sourceId ?? '',
        ].join(';');
      });

      const csv = BOM + [header, ...csvLines].join('\n');
      res.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="libro-auxiliar-cartera-${period}.csv"`,
      });
      res.send(csv);
    } catch (err) { next(err); }
  });

  // GET /export/saldos-cartera?asOf=YYYY-MM-DD — Saldos por unidad (reemplaza /portfolio)
  router.get('/saldos-cartera', requireAdmin, async (req, res, next) => {
    try {
      const { asOf } = z.object({
        asOf: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/).optional(),
      }).parse(req.query);

      const tenantId = req.user!.tenantId!;
      const cutDate = asOf ?? new Date().toISOString().slice(0, 10);
      const tenant = await db.selectFrom('tenants').select('name').where('id', '=', tenantId).executeTakeFirst();
      const buildingName = tenant?.name ?? 'Conjunto Residencial';

      const rows = await withTenantTransaction(tenantId, async (trx) =>
        trx
          .selectFrom('charges')
          .leftJoin('units', (j) =>
            j.onRef('units.unitId', '=', 'charges.unitId')
             .on('units.tenantId', '=', tenantId)
             .on('units.active', '=', true)
          )
          .where('charges.tenantId', '=', tenantId)
          .where('charges.status', 'in', ['active', 'partial', 'overdue'])
          .groupBy([
            'charges.unitId', 'charges.unitLabel', 'charges.ownerName',
            'units.phone', 'units.coefficient',
          ])
          .select([
            'charges.unitId',
            'charges.unitLabel',
            'charges.ownerName',
            'units.phone',
            'units.coefficient',
          ])
          .select(() => [
            sql<string>`SUM(charges.amount - charges.paid_amount)`.as('saldo'),
            sql<string>`COUNT(charges.id)`.as('cargosCount'),
            sql<string>`COUNT(CASE WHEN charges.status = 'overdue' THEN 1 END)`.as('mesesMora'),
            sql<Date | null>`MAX(charges.paid_at)`.as('ultimoPago'),
          ])
          .orderBy(sql`SUM(charges.amount - charges.paid_amount)`, 'desc')
          .execute()
      );

      const BOM = '﻿';
      const meta = `Saldos de Cartera — ${buildingName};;\nCorte: ${cutDate};;\n`;
      const colHeader = 'Unidad;Propietario;Teléfono;Coeficiente;Cargos Pendientes;Meses en Mora;Saldo Adeudado COP;Último Pago';
      const csvLines = rows.map((r) => {
        const saldo = Number(r.saldo ?? '0') / 100;
        const coef = r.coefficient ? Number(r.coefficient).toFixed(4) : '0,0000';
        const ultimoPago = r.ultimoPago instanceof Date
          ? r.ultimoPago.toISOString().slice(0, 10)
          : (r.ultimoPago ? String(r.ultimoPago).slice(0, 10) : 'Nunca');
        return [
          r.unitLabel ?? r.unitId,
          r.ownerName ?? '',
          r.phone ?? '',
          coef,
          String(r.cargosCount ?? 0),
          String(r.mesesMora ?? 0),
          saldo.toFixed(2).replace('.', ','),
          ultimoPago,
        ].join(';');
      });

      const csv = BOM + meta + colHeader + '\n' + csvLines.join('\n');
      res.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="saldos-cartera-${cutDate}.csv"`,
      });
      res.send(csv);
    } catch (err) { next(err); }
  });

  // GET /export/portfolio?period=YYYY-MM
  router.get('/portfolio', requireAdmin, async (req, res, next) => {
    try {
      const { period } = z.object({
        period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
      }).parse(req.query);

      const tenantId = req.user!.tenantId!;
      const [delinquent, tenant] = await Promise.all([
        chargesRepo.getDelinquent(tenantId),
        db.selectFrom('tenants').select('name').where('id', '=', tenantId).executeTakeFirst(),
      ]);
      const buildingName = tenant?.name ?? 'Conjunto Residencial';

      const excelBuffer = await generatePortfolioExcel(
        buildingName,
        period,
        delinquent.map((c) => ({
          unitLabel: c.unitLabel,
          ownerName: c.ownerName ?? '-',
          totalOwed: `$${Number(c.amount / 100n).toLocaleString('es-CO')}`,
          lastPayment: c.paidAt?.toLocaleDateString('es-CO') ?? 'Nunca',
          monthsDelinquent: 1,
          status: 'En mora',
        })),
      );

      res.set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="cartera-${period}.xlsx"`,
      });
      res.send(excelBuffer);
    } catch (err) { next(err); }
  });

  return router;
}
