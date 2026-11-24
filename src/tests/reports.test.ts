import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import {
  generateExcelReport,
  generatePdfReport,
  type ReportCurrencyView,
  type ReportPayload,
} from '../server/reports.ts';

function buildSampleReport(overrides: Partial<ReportPayload> = {}): ReportPayload {
  const summaryGroups = Array.from({ length: 35 }, (_, idx) => {
    const day = String((idx % 28) + 1).padStart(2, '0');
    return {
      key: `2026-10-${day}-${idx}`,
      label: `2026-10-${day} (Group ${idx + 1})`,
      entryCount: 2,
      creditsAed: '1500.00',
      debitsAed: '500.00',
      netAed: '1000.00',
      creditsInr: '34500.00',
      debitsInr: '11500.00',
      netInr: '23000.00',
    };
  });

  return {
    title: 'Ledger Transactions Report',
    subtitle: 'All Active Accounts',
    dateRangeLabel: '2026-10-01 to 2026-11-24',
    reportMode: 'DAILY',
    currencyView: 'BOTH',
    includeRateVariance: true,
    currentReferenceRate: '23.100000',
    summaryGroups,
    rows: [
      {
        id: 1,
        date: '2026-11-20',
        accountName: 'Emirates Trading LLC',
        accountNumber: 'ACC-1001',
        type: 'CREDIT',
        originalAmount: '1000.00',
        originalCurrency: 'AED',
        amount: '1000.00',
        exchangeRate: '22.900000',
        convertedAmountInr: '22900.00',
        rateDate: '2026-11-20',
        rateSource: 'API',
        runningBalance: '1000.00',
        status: 'ACTIVE',
        description: 'Invoice settlement',
        createdByName: 'Staff One',
      },
      {
        id: 2,
        date: '2026-11-21',
        accountName: 'Emirates Trading LLC',
        accountNumber: 'ACC-1001',
        type: 'DEBIT',
        originalAmount: '5000.00',
        originalCurrency: 'INR',
        amount: '217.39',
        exchangeRate: '23.000000',
        convertedAmountInr: '5000.00',
        rateDate: '2026-11-21',
        rateSource: 'MANUAL',
        runningBalance: '782.61',
        status: 'ACTIVE',
        description: 'Vendor payout',
        createdByName: 'Admin User',
      },
    ],
    totals: {
      totalCreditsAed: '1000.00',
      totalDebitsAed: '217.39',
      netAed: '782.61',
      totalCreditsInr: '22900.00',
      totalDebitsInr: '5000.00',
      netInr: '17900.00',
    },
    ...overrides,
  };
}

describe('WebX PDF & Excel Report Generation', () => {
  const views: ReportCurrencyView[] = ['AED', 'INR', 'BOTH'];

  for (const view of views) {
    it(`generates valid PDF and Excel buffers for currencyView=${view} with variance and multi-page summary`, async () => {
      const payload = buildSampleReport({ currencyView: view });

      const pdfBuf = await generatePdfReport(payload);
      expect(pdfBuf.subarray(0, 5).toString('utf8')).toBe('%PDF-');
      expect(pdfBuf.length).toBeGreaterThan(1500);

      const xlsxBuf = await generateExcelReport(payload);
      expect(xlsxBuf.subarray(0, 2).toString('utf8')).toBe('PK');

      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(xlsxBuf as any);
      const summarySheet = wb.getWorksheet('Summary Statement');
      const ledgerSheet = wb.getWorksheet('Ledger Report');
      expect(summarySheet).toBeDefined();
      expect(ledgerSheet).toBeDefined();

      const summaryHeaders = (summarySheet!.getRow(4).values as any[]).filter(Boolean);
      const ledgerHeaders = (ledgerSheet!.getRow(5).values as any[]).filter(Boolean);

      if (view === 'AED') {
        expect(summaryHeaders).toContain('Credits (AED)');
        expect(summaryHeaders).not.toContain('Credits (INR)');
        expect(ledgerHeaders).toContain('Amount (AED)');
        expect(ledgerHeaders).not.toContain('Equivalent (INR)');
      } else if (view === 'INR') {
        expect(summaryHeaders).toContain('Credits (INR)');
        expect(summaryHeaders).not.toContain('Credits (AED)');
        expect(ledgerHeaders).toContain('Equivalent (INR)');
        expect(ledgerHeaders).not.toContain('Amount (AED)');
      } else {
        expect(summaryHeaders).toContain('Credits (AED)');
        expect(summaryHeaders).toContain('Credits (INR)');
        expect(ledgerHeaders).toContain('Amount (AED)');
        expect(ledgerHeaders).toContain('Equivalent (INR)');
      }

      expect(ledgerHeaders).toContain('Rate Variance (INR)');
    });
  }

  it('handles empty rows and no summaryGroups cleanly without throwing', async () => {
    const emptyPayload = buildSampleReport({
      reportMode: 'DETAILED',
      summaryGroups: undefined,
      includeRateVariance: false,
      rows: [],
      totals: {
        totalCreditsAed: '0.00',
        totalDebitsAed: '0.00',
        netAed: '0.00',
        totalCreditsInr: '0.00',
        totalDebitsInr: '0.00',
        netInr: '0.00',
      },
    });

    const pdfBuf = await generatePdfReport(emptyPayload);
    expect(pdfBuf.subarray(0, 5).toString('utf8')).toBe('%PDF-');

    const xlsxBuf = await generateExcelReport(emptyPayload);
    expect(xlsxBuf.subarray(0, 2).toString('utf8')).toBe('PK');
  });
});
