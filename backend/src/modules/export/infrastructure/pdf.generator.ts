import PDFDocument from 'pdfkit';

// ── Shared report account type ───────────────────────────────────────────────
export interface ReportAccount {
  id:          string;
  code:        string;
  name:        string;
  accountType: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  parentId:    string | null;
  balance:     string; // BIGINT as string, centavos
}

export interface BalanceGeneralData {
  buildingName: string;
  asOf:         string;
  generatedAt:  string;
  accounts:     ReportAccount[];
  totals: {
    assets:      bigint;
    liabilities: bigint;
    equity:      bigint;
  };
}

export interface EstadoResultadosData {
  buildingName: string;
  from:         string;
  to:           string;
  generatedAt:  string;
  accounts:     ReportAccount[];
  totals: {
    revenue:   bigint;
    expenses:  bigint;
    netIncome: bigint;
  };
}

function writeFooter(doc: PDFKit.PDFDocument, text: string, marginX: number): void {
  const footerY = doc.page.height - 30;
  if (doc.y > footerY - 10) doc.addPage();
  doc.fontSize(8).fillColor('#aaaaaa')
    .text(text, marginX, footerY, { width: doc.page.width - marginX * 2, align: 'center', lineBreak: false });
}

export interface PazYSalvoData {
  buildingName:      string;
  unitLabel:         string;
  ownerName:         string | null;
  asOf:              string;
  generatedAt:       string;
  administratorName?: string | null;
}

export interface MinutesAgendaItem {
  order:          number;
  title:          string;
  type:           'votacion' | 'informativo';
  description:    string | null;
  resolvedStatus: string | null;
  votes?: {
    a_favor:    { count: number; coefficient: number };
    en_contra:  { count: number; coefficient: number };
    abstencion: { count: number; coefficient: number };
    totalVoted: number;
    approved:   boolean | null;
  } | null;
}

export interface MinutesData {
  buildingName:      string;
  assemblyType:      string;
  assemblyTitle:     string;
  scheduledDate:     string | null;
  location:          string | null;
  quorum:            {
    presentPct:          number;
    totalCoefficient:    number;
    presentCoefficient:  number;
    quorumReached:       boolean;
    attendanceCount:     number;
    quorumPct:           number;
  };
  attendances:       Array<{
    unitId:         string;
    unitLabel:      string;
    ownerName:      string | null;
    attendanceMode: string;
    coefficient:    string | number;
  }>;
  agenda:            MinutesAgendaItem[];
  minutesText:       string | null;
  minutesApprovedAt: string | null;
  generatedAt:       string;
}

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

    writeFooter(doc, `Generado el ${data.generatedAt} · Conectia`, 50);

    doc.end();
  });
}

export function generatePazYSalvoPDF(data: PazYSalvoData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: 'A4', margin: 60 });
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageW = 595 - 120; // width within margins

    // Header
    doc.fontSize(22).font('Helvetica-Bold').fillColor('#000000')
      .text('Conectia', 60, 70, { width: pageW, align: 'center' });
    doc.fontSize(12).font('Helvetica').fillColor('#444444')
      .text(data.buildingName, 60, 100, { width: pageW, align: 'center' });
    doc.moveTo(60, 125).lineTo(535, 125).strokeColor('#cccccc').stroke();

    // Certificate title
    doc.fontSize(18).font('Helvetica-Bold').fillColor('#1a1a2e')
      .text('PAZ Y SALVO', 60, 150, { width: pageW, align: 'center' });
    doc.fontSize(11).font('Helvetica').fillColor('#666666')
      .text('Certificación de no adeudo', 60, 175, { width: pageW, align: 'center' });

    // Body
    doc.fontSize(11).font('Helvetica').fillColor('#000000');
    const ownerClause = data.ownerName ? `, a cargo de ${data.ownerName},` : '';
    const body = `Se certifica que la unidad ${data.unitLabel}${ownerClause} se encuentra a PAZ Y SALVO con ${data.buildingName} a la fecha de corte ${data.asOf}, sin registrar deudas por concepto de administración, cuotas ordinarias, ni ninguna otra obligación ante el conjunto residencial.`;
    doc.text(body, 80, 220, { width: pageW - 40, align: 'justify', lineGap: 4 });

    let signatureY = Math.max(doc.y + 60, 380);

    // Signature line
    doc.moveTo(180, signatureY).lineTo(415, signatureY).strokeColor('#000000').stroke();
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#000000')
      .text(data.administratorName ?? 'Administrador', 60, signatureY + 6, { width: pageW, align: 'center' });
    doc.fontSize(9).font('Helvetica').fillColor('#888888')
      .text('Administrador del conjunto residencial', 60, signatureY + 20, { width: pageW, align: 'center' });

    // Date of issue
    doc.fontSize(10).fillColor('#444444')
      .text(`Fecha de expedición: ${data.generatedAt}`, 60, signatureY + 50, { width: pageW, align: 'center' });

    writeFooter(doc, `Generado por Conectia · ${data.generatedAt}`, 60);

    doc.end();
  });
}

export function generateMinutesPDF(data: MinutesData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const L = 50, R = 545, W = 495;

    // Header
    doc.fontSize(18).font('Helvetica-Bold').fillColor('#000000').text('Conectia', L, 50);
    doc.fontSize(11).font('Helvetica').fillColor('#444444').text(data.buildingName, L, 75);
    doc.moveTo(L, 98).lineTo(R, 98).strokeColor('#888888').stroke();

    // Title
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#000000')
      .text('ACTA DE ASAMBLEA', L, 112);
    doc.fontSize(13).font('Helvetica').fillColor('#333333')
      .text(data.assemblyTitle, L, 132, { width: W });

    let y = Math.max(doc.y + 6, 160);

    // Meta row
    doc.fontSize(9).font('Helvetica').fillColor('#666666');
    const metaParts: string[] = [];
    if (data.scheduledDate) metaParts.push(`Fecha: ${data.scheduledDate}`);
    if (data.location)      metaParts.push(`Lugar: ${data.location}`);
    metaParts.push(`Tipo: ${data.assemblyType}`);
    doc.text(metaParts.join('   ·   '), L, y, { width: W });
    y = doc.y + 10;

    doc.moveTo(L, y).lineTo(R, y).strokeColor('#cccccc').stroke();
    y += 12;

    // Quorum
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000').text('QUÓRUM', L, y);
    y += 15;
    doc.fontSize(9).font('Helvetica').fillColor('#333333');
    doc.text(
      `Coeficiente presente: ${data.quorum.presentCoefficient.toFixed(4)} / ${data.quorum.totalCoefficient.toFixed(4)} ` +
      `(${data.quorum.presentPct.toFixed(1)}%) — Requerido: ${data.quorum.quorumPct}% — ` +
      `Resultado: ${data.quorum.quorumReached ? 'QUÓRUM ALCANZADO' : 'SIN QUÓRUM'} — ` +
      `${data.quorum.attendanceCount} unidades registradas`,
      L, y, { width: W }
    );
    y = doc.y + 10;
    doc.moveTo(L, y).lineTo(R, y).strokeColor('#cccccc').stroke();
    y += 12;

    // Agenda
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000').text('ORDEN DEL DÍA', L, y);
    y += 15;

    for (const item of data.agenda) {
      if (y > 700) { doc.addPage(); y = 50; }
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#000000')
        .text(`${item.order}. ${item.title}`, L, y, { width: W });
      y = doc.y + 2;
      if (item.description) {
        doc.fontSize(8).font('Helvetica').fillColor('#555555')
          .text(item.description, L + 12, y, { width: W - 12 });
        y = doc.y + 2;
      }
      if (item.type === 'votacion' && item.votes) {
        const v = item.votes;
        doc.fontSize(8).font('Helvetica').fillColor('#333333').text(
          `A favor: ${v.a_favor.count} (${v.a_favor.coefficient.toFixed(2)})  ` +
          `En contra: ${v.en_contra.count} (${v.en_contra.coefficient.toFixed(2)})  ` +
          `Abstención: ${v.abstencion.count}` +
          (item.resolvedStatus ? `  →  ${item.resolvedStatus.toUpperCase()}` : ''),
          L + 12, y, { width: W - 12 }
        );
        y = doc.y + 2;
      }
      y += 6;
    }

    doc.moveTo(L, y).lineTo(R, y).strokeColor('#cccccc').stroke();
    y += 12;

    // Attendances
    if (y > 650) { doc.addPage(); y = 50; }
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000').text('LISTA DE ASISTENCIA', L, y);
    y += 15;
    doc.fontSize(8).font('Helvetica').fillColor('#333333');
    for (const a of data.attendances) {
      if (y > 730) { doc.addPage(); y = 50; }
      const row = `${a.unitId} — ${a.unitLabel}${a.ownerName ? ` (${a.ownerName})` : ''} · ${a.attendanceMode} · coef. ${Number(a.coefficient).toFixed(4)}`;
      doc.text(row, L + 8, y, { width: W - 8 });
      y = doc.y + 1;
    }
    y += 10;

    // Minutes text
    if (data.minutesText) {
      if (y > 600) { doc.addPage(); y = 50; }
      doc.moveTo(L, y).lineTo(R, y).strokeColor('#cccccc').stroke();
      y += 12;
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000').text('TEXTO DEL ACTA', L, y);
      y += 15;
      doc.fontSize(9).font('Helvetica').fillColor('#333333')
        .text(data.minutesText, L, y, { width: W, lineGap: 2 });
      y = doc.y + 10;
    }

    // Approval note
    if (data.minutesApprovedAt) {
      if (y > 710) { doc.addPage(); y = 50; }
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#1a7a3a')
        .text(`Acta aprobada el ${data.minutesApprovedAt}`, L, y);
      y = doc.y + 6;
    }

    writeFooter(doc, `Generado el ${data.generatedAt} · Conectia`, L);

    doc.end();
  });
}

// ── Balance General PDF ───────────────────────────────────────────────────────

function copStr(cents: bigint): string {
  const abs = cents < 0n ? -cents : cents;
  const pesos = abs / 100n;
  return `${cents < 0n ? '-' : ''}$${Number(pesos).toLocaleString('es-CO')}`;
}

export function generateBalanceGeneralPDF(data: BalanceGeneralData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const L = 50, R = 545, W = 495;

    doc.fontSize(18).font('Helvetica-Bold').fillColor('#000000').text('Conectia', L, 50);
    doc.fontSize(11).font('Helvetica').fillColor('#444444').text(data.buildingName, L, 75);
    doc.moveTo(L, 98).lineTo(R, 98).strokeColor('#888888').stroke();
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#000000').text('BALANCE GENERAL', L, 112);
    doc.fontSize(10).font('Helvetica').fillColor('#666666').text(`Al ${data.asOf}`, L, 130);

    let y = 155;

    const sections: Array<{ title: string; type: ReportAccount['accountType']; total: bigint }> = [
      { title: 'ACTIVOS',     type: 'asset',     total: data.totals.assets },
      { title: 'PASIVOS',     type: 'liability', total: data.totals.liabilities },
      { title: 'PATRIMONIO',  type: 'equity',    total: data.totals.equity },
    ];

    for (const section of sections) {
      if (y > 680) { doc.addPage(); y = 50; }

      doc.fontSize(9).font('Helvetica-Bold').fillColor('#000000')
        .text(section.title, L, y, { width: W });
      doc.moveTo(L, y + 13).lineTo(R, y + 13).strokeColor('#cccccc').stroke();
      y += 18;

      const accts = data.accounts.filter((a) => a.accountType === section.type);
      for (const acct of accts) {
        if (y > 710) { doc.addPage(); y = 50; }
        doc.fontSize(8).font('Helvetica').fillColor('#333333')
          .text(`${acct.code}  ${acct.name}`, L + 10, y, { width: W - 90 });
        doc.text(copStr(BigInt(acct.balance)), R - 80, y, { width: 80, align: 'right' });
        y = doc.y + 1;
      }

      if (y > 710) { doc.addPage(); y = 50; }
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#000000')
        .text(`Total ${section.title}`, L + 10, y + 4, { width: W - 90 });
      doc.text(copStr(section.total), R - 80, y + 4, { width: 80, align: 'right' });
      doc.moveTo(L, y + 2).lineTo(R, y + 2).strokeColor('#cccccc').stroke();
      y += 22;
    }

    if (y > 710) { doc.addPage(); y = 50; }
    const balanced = data.totals.assets === data.totals.liabilities + data.totals.equity;
    doc.moveTo(L, y).lineTo(R, y).strokeColor('#888888').stroke();
    y += 8;
    doc.fontSize(8).font('Helvetica').fillColor(balanced ? '#16a34a' : '#dc2626')
      .text(
        balanced
          ? `✓ Ecuación contable cuadra: Activos (${copStr(data.totals.assets)}) = Pasivos + Patrimonio (${copStr(data.totals.liabilities + data.totals.equity)})`
          : `⚠ Diferencia: ${copStr(data.totals.assets - data.totals.liabilities - data.totals.equity)}`,
        L, y, { width: W }
      );

    writeFooter(doc, `Generado el ${data.generatedAt} · Conectia`, L);
    doc.end();
  });
}

// ── Estado de Resultados PDF ──────────────────────────────────────────────────

export function generateEstadoResultadosPDF(data: EstadoResultadosData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const L = 50, R = 545, W = 495;

    doc.fontSize(18).font('Helvetica-Bold').fillColor('#000000').text('Conectia', L, 50);
    doc.fontSize(11).font('Helvetica').fillColor('#444444').text(data.buildingName, L, 75);
    doc.moveTo(L, 98).lineTo(R, 98).strokeColor('#888888').stroke();
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#000000').text('ESTADO DE RESULTADOS', L, 112);
    doc.fontSize(10).font('Helvetica').fillColor('#666666')
      .text(`Período: ${data.from} — ${data.to}`, L, 130);

    let y = 155;

    const sections: Array<{ title: string; type: ReportAccount['accountType']; total: bigint }> = [
      { title: 'INGRESOS', type: 'revenue', total: data.totals.revenue },
      { title: 'EGRESOS',  type: 'expense', total: data.totals.expenses },
    ];

    for (const section of sections) {
      if (y > 680) { doc.addPage(); y = 50; }

      doc.fontSize(9).font('Helvetica-Bold').fillColor('#000000')
        .text(section.title, L, y, { width: W });
      doc.moveTo(L, y + 13).lineTo(R, y + 13).strokeColor('#cccccc').stroke();
      y += 18;

      const accts = data.accounts.filter((a) => a.accountType === section.type);
      for (const acct of accts) {
        if (y > 710) { doc.addPage(); y = 50; }
        doc.fontSize(8).font('Helvetica').fillColor('#333333')
          .text(`${acct.code}  ${acct.name}`, L + 10, y, { width: W - 90 });
        doc.text(copStr(BigInt(acct.balance)), R - 80, y, { width: 80, align: 'right' });
        y = doc.y + 1;
      }

      if (y > 710) { doc.addPage(); y = 50; }
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#000000')
        .text(`Total ${section.title}`, L + 10, y + 4, { width: W - 90 });
      doc.text(copStr(section.total), R - 80, y + 4, { width: 80, align: 'right' });
      doc.moveTo(L, y + 2).lineTo(R, y + 2).strokeColor('#cccccc').stroke();
      y += 22;
    }

    if (y > 710) { doc.addPage(); y = 50; }
    const netPositive = data.totals.netIncome >= 0n;
    doc.moveTo(L, y).lineTo(R, y).strokeColor('#888888').stroke();
    y += 8;
    doc.fontSize(10).font('Helvetica-Bold').fillColor(netPositive ? '#16a34a' : '#dc2626')
      .text('RESULTADO DEL PERÍODO', L + 10, y, { width: W - 90 });
    doc.text(copStr(data.totals.netIncome), R - 80, y, { width: 80, align: 'right' });

    writeFooter(doc, `Generado el ${data.generatedAt} · Conectia`, L);
    doc.end();
  });
}
