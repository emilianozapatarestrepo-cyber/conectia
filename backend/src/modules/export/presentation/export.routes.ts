import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireTenant, requireAdmin } from '../../../shared/middlewares/auth.js';
import { ChargesRepository } from '../../charges/infrastructure/charges.repository.js';
import { generateStatementPDF } from '../infrastructure/pdf.generator.js';
import { generatePortfolioExcel } from '../infrastructure/excel.generator.js';

export function createExportRouter(): Router {
  const router = Router();
  const chargesRepo = new ChargesRepository();

  // GET /export/statement?unitId=&period=YYYY-MM
  router.get('/statement', requireAuth, requireTenant, requireAdmin, async (req, res, next) => {
    try {
      const { unitId, period } = z.object({
        unitId: z.string().min(1),
        period: z.string().regex(/^\d{4}-\d{2}$/),
      }).parse(req.query);

      const charges = await chargesRepo.list(req.user!.tenantId!, { unitId, period });
      const totalOwed = charges
        .filter((c) => c.status !== 'paid')
        .reduce((s, c) => s + c.amount, 0n);

      const buildingName = 'Conjunto Residencial'; // TODO: fetch from tenant profile
      const pdfBuffer = generateStatementPDF({
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

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="estado-cuenta-${unitId}-${period}.pdf"`,
        'Content-Length': String(pdfBuffer.length),
      });
      res.send(pdfBuffer);
    } catch (err) { next(err); }
  });

  // GET /export/portfolio?period=YYYY-MM
  router.get('/portfolio', requireAuth, requireTenant, requireAdmin, async (req, res, next) => {
    try {
      const { period } = z.object({
        period: z.string().regex(/^\d{4}-\d{2}$/),
      }).parse(req.query);

      const delinquent = await chargesRepo.getDelinquent(req.user!.tenantId!);
      const buildingName = 'Conjunto Residencial'; // TODO: fetch from tenant profile

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
