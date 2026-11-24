import Decimal from 'decimal.js';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { formatAED, formatINR, round2 } from '../lib/money.ts';

export type ReportCurrencyView = 'AED' | 'INR' | 'BOTH';

export interface ReportTransactionRow {
  id: number;
  date: string;
  accountName: string;
  accountNumber: string;
  type: string;
  originalAmount: string;
  originalCurrency: string;
  amount: string; // AED
  exchangeRate: string;
  convertedAmountInr: string;
  rateDate: string;
  rateSource: string;
  runningBalance: string;
  status: string;
  description: string;
  createdByName: string;
}

export interface ReportSummaryGroup {
  key: string;
  label: string;
  entryCount: number;
  creditsAed: string;
  debitsAed: string;
  netAed: string;
  creditsInr: string;
  debitsInr: string;
  netInr: string;
}

export interface ReportPayload {
  title: string;
  subtitle: string;
  dateRangeLabel: string;
  reportMode?: 'DETAILED' | 'DAILY' | 'MONTHLY' | 'ACCOUNT';
  currencyView: ReportCurrencyView;
  includeRateVariance?: boolean;
  currentReferenceRate?: string;
  summaryGroups?: ReportSummaryGroup[];
  rows: ReportTransactionRow[];
  totals: {
    totalCreditsAed: string;
    totalDebitsAed: string;
    netAed: string;
    totalCreditsInr: string;
    totalDebitsInr: string;
    netInr: string;
  };
}

function formatTotalsBanner(
  totals: ReportPayload['totals'],
  currencyView: ReportCurrencyView,
  usePdfInr: boolean
): string {
  const fmtInr = usePdfInr ? formatPdfInr : formatINR;
  if (currencyView === 'AED') {
    return `Credits: ${formatAED(totals.totalCreditsAed)}     |     Debits: ${formatAED(totals.totalDebitsAed)}     |     Net: ${formatAED(totals.netAed)}`;
  }
  if (currencyView === 'INR') {
    return `Credits: ${fmtInr(totals.totalCreditsInr)}     |     Debits: ${fmtInr(totals.totalDebitsInr)}     |     Net: ${fmtInr(totals.netInr)}`;
  }
  return `Credits: ${formatAED(totals.totalCreditsAed)} (${fmtInr(totals.totalCreditsInr)})     |     Debits: ${formatAED(totals.totalDebitsAed)} (${fmtInr(totals.totalDebitsInr)})     |     Net: ${formatAED(totals.netAed)} (${fmtInr(totals.netInr)})`;
}

export async function generateExcelReport(report: ReportPayload): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'WebX Bookkeeping';
  workbook.created = new Date();

  const showAed = report.currencyView === 'AED' || report.currencyView === 'BOTH';
  const showInr = report.currencyView === 'INR' || report.currencyView === 'BOTH';
  const showVariance = Boolean(report.includeRateVariance && report.currentReferenceRate);

  if (report.summaryGroups && report.summaryGroups.length > 0) {
    const summarySheet = workbook.addWorksheet('Summary Statement', {
      views: [{ state: 'frozen', ySplit: 4 }],
    });

    const sHeaders: string[] = [
      report.reportMode === 'ACCOUNT'
        ? 'Account'
        : report.reportMode === 'MONTHLY'
          ? 'Month (GST)'
          : 'Date (GST)',
      'Entries',
    ];
    if (showAed) {
      sHeaders.push('Credits (AED)', 'Debits (AED)', 'Net (AED)');
    }
    if (showInr) {
      sHeaders.push('Credits (INR)', 'Debits (INR)', 'Net (INR)');
    }

    const sLastCol = String.fromCharCode(64 + Math.min(26, sHeaders.length));
    summarySheet.mergeCells(`A1:${sLastCol}1`);
    const sTitle = summarySheet.getCell('A1');
    sTitle.value = `WebX — ${report.title} (Summary)`;
    sTitle.font = { size: 14, bold: true, color: { argb: 'FF1E3A8A' } };
    summarySheet.mergeCells(`A2:${sLastCol}2`);
    summarySheet.getCell('A2').value = `${report.subtitle} | Range: ${report.dateRangeLabel} | View: ${report.currencyView}`;
    summarySheet.getCell('A2').font = { size: 10, color: { argb: 'FF475569' } };

    const sHeaderRow = summarySheet.getRow(4);
    sHeaderRow.values = sHeaders;
    sHeaderRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
      cell.font = { bold: true, color: { argb: 'FF1E3A8A' }, size: 10 };
    });

    report.summaryGroups.forEach((g) => {
      const rowVals: Array<string | number> = [g.label, g.entryCount];
      if (showAed) {
        rowVals.push(Number(g.creditsAed), Number(g.debitsAed), Number(g.netAed));
      }
      if (showInr) {
        rowVals.push(Number(g.creditsInr), Number(g.debitsInr), Number(g.netInr));
      }
      summarySheet.addRow(rowVals);
    });

    summarySheet.columns.forEach((col) => {
      col.width = 20;
    });
  }

  const sheet = workbook.addWorksheet('Ledger Report', {
    views: [{ state: 'frozen', ySplit: 5 }],
  });

  const headers: string[] = [
    'Entry #',
    'Date (GST)',
    'Account',
    'Account No.',
    'Type',
    'Original Entry',
  ];
  if (showAed) {
    headers.push('Amount (AED)');
  }
  headers.push('Rate Applied (1 AED = INR)', 'Rate Date');
  if (showInr) {
    headers.push('Equivalent (INR)');
  }
  if (showVariance) {
    headers.push('INR at Current Rate', 'Rate Variance (INR)');
  }
  headers.push('Running Bal (AED)', 'Status', 'Staff', 'Description');

  const lastCol = String.fromCharCode(64 + Math.min(26, headers.length));
  sheet.mergeCells(`A1:${lastCol}1`);
  const titleCell = sheet.getCell('A1');
  titleCell.value = `WebX — ${report.title}`;
  titleCell.font = { size: 15, bold: true, color: { argb: 'FF1E3A8A' } };

  sheet.mergeCells(`A2:${lastCol}2`);
  sheet.getCell('A2').value = `${report.subtitle} | Range: ${report.dateRangeLabel} | Timezone: Asia/Dubai (GST) | View: ${report.currencyView}`;
  sheet.getCell('A2').font = { size: 10, color: { argb: 'FF475569' } };

  sheet.mergeCells(`A3:${lastCol}3`);
  sheet.getCell('A3').value = formatTotalsBanner(report.totals, report.currencyView, false).replace(/\s{2,}\|/g, '  |');
  sheet.getCell('A3').font = { size: 10, bold: true, color: { argb: 'FF0F172A' } };

  const headerRow = sheet.getRow(5);
  headerRow.values = headers;
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFDBEAFE' },
    };
    cell.font = { bold: true, color: { argb: 'FF1E3A8A' }, size: 10 };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FF93C5FD' } },
    };
  });

  report.rows.forEach((row, index) => {
    const rowValues: Array<string | number> = [
      row.id,
      row.date,
      row.accountName,
      row.accountNumber,
      row.type,
      `${row.originalCurrency} ${row.originalAmount}`,
    ];
    if (showAed) {
      rowValues.push(Number(row.amount));
    }
    rowValues.push(Number(row.exchangeRate), row.rateDate);
    if (showInr) {
      rowValues.push(Number(row.convertedAmountInr));
    }
    if (showVariance && report.currentReferenceRate) {
      const currentInr = new Decimal(row.amount)
        .mul(new Decimal(report.currentReferenceRate))
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const variance = currentInr.minus(new Decimal(row.convertedAmountInr));
      rowValues.push(Number(currentInr.toFixed(2)), Number(variance.toFixed(2)));
    }
    rowValues.push(Number(row.runningBalance), row.status, row.createdByName, row.description);

    const added = sheet.addRow(rowValues);
    if (index % 2 === 1) {
      added.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8FAFC' },
        };
      });
    }
  });

  sheet.columns.forEach((col) => {
    col.width = 18;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function formatPdfInr(val: string | number): string {
  const num = Number(round2(val));
  const absFormatted = Math.abs(num).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return num < 0 ? `-Rs. ${absFormatted}` : `Rs. ${absFormatted}`;
}

export async function generatePdfReport(report: ReportPayload): Promise<Buffer> {
  return await new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 36,
      size: 'A4',
      layout: 'landscape',
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const showAed = report.currencyView === 'AED' || report.currencyView === 'BOTH';
    const showInr = report.currencyView === 'INR' || report.currencyView === 'BOTH';
    const showVariance = Boolean(report.includeRateVariance && report.currentReferenceRate);

    // Header
    doc.fillColor('#1E3A8A').fontSize(18).text(`WebX - ${report.title}`);
    doc
      .fillColor('#475569')
      .fontSize(9.5)
      .text(
        `${report.subtitle}  |  Range: ${report.dateRangeLabel}  |  Timezone: Asia/Dubai (GST)  |  View: ${report.currencyView}`
      );
    doc.moveDown(0.5);

    // Summary Box
    doc
      .rect(36, doc.y, 770, 36)
      .fillAndStroke('#EFF6FF', '#BFDBFE');
    const summaryY = doc.y + 11;
    doc
      .fillColor('#0F172A')
      .fontSize(9.5)
      .text(formatTotalsBanner(report.totals, report.currencyView, true), 46, summaryY);
    doc.y = summaryY + 32;

    if (report.summaryGroups && report.summaryGroups.length > 0) {
      const groupLabelTitle =
        report.reportMode === 'ACCOUNT'
          ? 'Account'
          : report.reportMode === 'MONTHLY'
            ? 'Month'
            : 'Date (GST)';

      let sColTitles: string[];
      let sColWidths: number[];
      if (report.currencyView === 'AED') {
        sColTitles = [groupLabelTitle, 'Entries', 'Credits (AED)', 'Debits (AED)', 'Net (AED)'];
        sColWidths = [280, 65, 140, 140, 145];
      } else if (report.currencyView === 'INR') {
        sColTitles = [groupLabelTitle, 'Entries', 'Credits (INR)', 'Debits (INR)', 'Net (INR)'];
        sColWidths = [280, 65, 140, 140, 145];
      } else {
        sColTitles = [
          groupLabelTitle,
          'Entries',
          'Credits (AED)',
          'Debits (AED)',
          'Net (AED)',
          'Net (INR)',
        ];
        sColWidths = [210, 60, 125, 125, 125, 125];
      }

      const drawSummaryHeader = (yPos: number) => {
        doc.rect(36, yPos, 770, 20).fill('#DBEAFE');
        let sx = 40;
        doc.fillColor('#1E3A8A').fontSize(8.5);
        sColTitles.forEach((t, i) => {
          doc.text(t, sx, yPos + 6, { width: sColWidths[i] - 4, ellipsis: true });
          sx += sColWidths[i];
        });
        return yPos + 22;
      };

      let sy = drawSummaryHeader(doc.y);
      report.summaryGroups.forEach((g, idx) => {
        if (sy > 530) {
          doc.addPage({ margin: 36, size: 'A4', layout: 'landscape' });
          sy = drawSummaryHeader(36);
        }
        if (idx % 2 === 1) {
          doc.rect(36, sy - 2, 770, 20).fill('#F8FAFC');
        }
        let gx = 40;
        const vals =
          report.currencyView === 'AED'
            ? [
                g.label,
                String(g.entryCount),
                formatAED(g.creditsAed),
                formatAED(g.debitsAed),
                formatAED(g.netAed),
              ]
            : report.currencyView === 'INR'
              ? [
                  g.label,
                  String(g.entryCount),
                  formatPdfInr(g.creditsInr),
                  formatPdfInr(g.debitsInr),
                  formatPdfInr(g.netInr),
                ]
              : [
                  g.label,
                  String(g.entryCount),
                  formatAED(g.creditsAed),
                  formatAED(g.debitsAed),
                  formatAED(g.netAed),
                  formatPdfInr(g.netInr),
                ];

        doc.fillColor('#0F172A').fontSize(8);
        vals.forEach((v, i) => {
          doc.text(v, gx, sy + 4, { width: sColWidths[i] - 4, ellipsis: true });
          gx += sColWidths[i];
        });
        sy += 20;
      });
      doc.y = sy + 14;
      if (doc.y > 490) {
        doc.addPage({ margin: 36, size: 'A4', layout: 'landscape' });
      }
    }

    // Detail Table Columns (widths sum to 770pt cleanly across all combinations)
    let colTitles: string[];
    let colWidths: number[];
    if (showVariance) {
      if (report.currencyView === 'AED') {
        colTitles = [
          'ID',
          'Date',
          'Account',
          'Type',
          'AED Amt',
          'Rate Used',
          'Curr INR',
          'Variance',
          'Run Bal',
          'Status',
          'Staff',
        ];
        colWidths = [38, 64, 116, 44, 76, 92, 78, 78, 76, 48, 60];
      } else if (report.currencyView === 'INR') {
        colTitles = [
          'ID',
          'Date',
          'Account',
          'Type',
          'Rate Used',
          'INR Equiv',
          'Curr INR',
          'Variance',
          'Run Bal',
          'Status',
          'Staff',
        ];
        colWidths = [38, 64, 116, 44, 92, 76, 78, 78, 76, 48, 60];
      } else {
        colTitles = [
          'ID',
          'Date',
          'Account',
          'Type',
          'AED Amt',
          'Rate Used',
          'INR Equiv',
          'Curr INR',
          'Variance',
          'Run Bal',
          'Status',
          'Staff',
        ];
        colWidths = [36, 60, 94, 42, 70, 82, 74, 74, 74, 70, 44, 50];
      }
    } else if (report.currencyView === 'AED') {
      colTitles = ['ID', 'Date', 'Account', 'Type', 'AED Amt', 'Rate Used', 'Run Bal (AED)', 'Status', 'Staff'];
      colWidths = [42, 72, 165, 50, 96, 118, 96, 54, 77];
    } else if (report.currencyView === 'INR') {
      colTitles = ['ID', 'Date', 'Account', 'Type', 'Rate Used', 'INR Equiv', 'Run Bal (AED)', 'Status', 'Staff'];
      colWidths = [42, 72, 165, 50, 118, 96, 96, 54, 77];
    } else {
      colTitles = [
        'ID',
        'Date',
        'Account',
        'Type',
        'AED Amt',
        'Rate Used',
        'INR Equiv',
        'Run Bal (AED)',
        'Status',
        'Staff',
      ];
      colWidths = [42, 68, 125, 48, 86, 98, 96, 86, 52, 69];
    }

    const typeColIndex = colTitles.indexOf('Type');
    const varianceColIndex = colTitles.indexOf('Variance');

    const drawHeader = (yPos: number) => {
      doc.rect(36, yPos, 770, 20).fill('#DBEAFE');
      let x = 40;
      doc.fillColor('#1E3A8A').fontSize(8.5);
      colTitles.forEach((title, idx) => {
        doc.text(title, x, yPos + 6, { width: colWidths[idx] - 4, ellipsis: true });
        x += colWidths[idx];
      });
      return yPos + 22;
    };

    let y = drawHeader(doc.y);

    if (report.rows.length === 0) {
      doc
        .fillColor('#64748B')
        .fontSize(9.5)
        .text('No ledger entries match the selected reporting filters.', 40, y + 10);
    }

    report.rows.forEach((row, idx) => {
      if (y > 530) {
        doc.addPage({ margin: 36, size: 'A4', layout: 'landscape' });
        y = drawHeader(36);
      }

      if (idx % 2 === 1) {
        doc.rect(36, y - 2, 770, 22).fill('#F8FAFC');
      }

      let x = 40;
      const rateDisplay = `1 AED = Rs.${Number(row.exchangeRate).toFixed(2)} (${row.rateDate})`;
      const values: string[] = [`#${row.id}`, row.date, row.accountName, row.type];

      if (showAed) {
        values.push(formatAED(row.amount));
      }
      values.push(rateDisplay);
      if (showInr) {
        values.push(formatPdfInr(row.convertedAmountInr));
      }

      let variancePositive = true;
      if (showVariance && report.currentReferenceRate) {
        const currentInr = new Decimal(row.amount)
          .mul(new Decimal(report.currentReferenceRate))
          .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        const variance = currentInr.minus(new Decimal(row.convertedAmountInr));
        variancePositive = variance.greaterThanOrEqualTo(0);
        values.push(formatPdfInr(currentInr.toFixed(2)), formatPdfInr(variance.toFixed(2)));
      }

      values.push(formatAED(row.runningBalance), row.status, row.createdByName);

      doc.fontSize(8);
      values.forEach((val, cIdx) => {
        if (cIdx === typeColIndex) {
          doc.fillColor(row.type === 'CREDIT' ? '#15803D' : '#B91C1C');
        } else if (cIdx === varianceColIndex) {
          doc.fillColor(variancePositive ? '#15803D' : '#B91C1C');
        } else {
          doc.fillColor('#0F172A');
        }
        doc.text(val, x, y + 4, { width: colWidths[cIdx] - 4, ellipsis: true });
        x += colWidths[cIdx];
      });

      y += 22;
    });

    doc.end();
  });
}
