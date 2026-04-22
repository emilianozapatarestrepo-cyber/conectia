import ExcelJS from 'exceljs';

export interface PortfolioRow {
  unitLabel: string;
  ownerName: string;
  totalOwed: string;
  lastPayment: string;
  monthsDelinquent: number;
  status: string;
}

export async function generatePortfolioExcel(
  buildingName: string,
  period: string,
  rows: PortfolioRow[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Cartera');

  ws.mergeCells('A1:F1');
  ws.getCell('A1').value = `${buildingName} — Cartera ${period}`;
  ws.getCell('A1').font = { bold: true, size: 14 };

  ws.addRow(['Unidad', 'Propietario', 'Total Adeudado', 'Último Pago', 'Meses en Mora', 'Estado']);
  ws.getRow(2).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a2540' } };

  ws.columns = [
    { key: 'unit', width: 12 },
    { key: 'owner', width: 28 },
    { key: 'owed', width: 20 },
    { key: 'lastPayment', width: 16 },
    { key: 'months', width: 16 },
    { key: 'status', width: 14 },
  ];

  for (const row of rows) {
    const r = ws.addRow([row.unitLabel, row.ownerName, row.totalOwed, row.lastPayment, row.monthsDelinquent, row.status]);
    if (row.monthsDelinquent >= 3) {
      r.getCell(1).font = { color: { argb: 'FFEF4444' } };
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
