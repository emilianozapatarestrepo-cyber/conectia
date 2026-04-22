import PDFDocument from 'pdfkit';

export interface StatementData {
  buildingName: string;
  period: string;
  unitLabel: string;
  ownerName: string | null;
  charges: Array<{
    concept: string;
    dueDate: string;
    amount: string;
    status: string;
  }>;
  totalOwed: string;
  generatedAt: string;
}

export function generateStatementPDF(data: StatementData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: 'A4', margin: 50 });

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc.fontSize(20).font('Helvetica-Bold').text('Conectia', 50, 50);
    doc.fontSize(12).font('Helvetica').text(data.buildingName, 50, 80);
    doc.text(`Estado de Cuenta — ${data.period}`, 50, 96);

    doc.moveTo(50, 120).lineTo(545, 120).stroke();

    doc.fontSize(11).text(`Unidad: ${data.unitLabel}`, 50, 135);
    if (data.ownerName) doc.text(`Propietario: ${data.ownerName}`, 50, 151);

    let y = 185;
    doc.fontSize(10).font('Helvetica-Bold');
    doc.text('Concepto', 50, y);
    doc.text('Vencimiento', 220, y);
    doc.text('Monto', 340, y);
    doc.text('Estado', 450, y);
    doc.moveTo(50, y + 14).lineTo(545, y + 14).stroke();

    doc.font('Helvetica');
    y += 20;
    for (const charge of data.charges) {
      doc.text(charge.concept, 50, y);
      doc.text(charge.dueDate, 220, y);
      doc.text(charge.amount, 340, y);
      doc.text(charge.status, 450, y);
      y += 18;
      if (y > 720) { doc.addPage(); y = 50; }
    }

    doc.moveTo(50, y + 5).lineTo(545, y + 5).stroke();
    y += 14;
    doc.font('Helvetica-Bold').text('Total adeudado:', 340, y);
    doc.text(data.totalOwed, 450, y);

    doc.fontSize(8).font('Helvetica').text(`Generado el ${data.generatedAt} · Conectia`, 50, 780);

    doc.end();
  });
}
