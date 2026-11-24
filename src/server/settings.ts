import { db } from '../db/index.ts';
import { settings } from '../db/schema.ts';

export interface SystemSettings {
  defaultCurrency: 'AED' | 'INR';
  reportingCurrency: 'INR' | 'AED';
  rateRefreshMode: 'AUTO' | 'MANUAL';
  rateRefreshSchedule: string;
  rateMarkup: string;
  timezone: string;
  staffCanViewReports: boolean;
  staffCanExport: boolean;
  staffCanAddAccounts: boolean;
  staffCanDownloadBackups: boolean;
}

export const DEFAULT_SETTINGS: SystemSettings = {
  defaultCurrency: 'AED',
  reportingCurrency: 'INR',
  rateRefreshMode: 'AUTO',
  rateRefreshSchedule: '09:00',
  rateMarkup: '0',
  timezone: 'Asia/Dubai',
  staffCanViewReports: true,
  staffCanExport: true,
  staffCanAddAccounts: false,
  staffCanDownloadBackups: true,
};

export async function getSystemSettings(): Promise<SystemSettings> {
  try {
    const rows = await db.select().from(settings);
    const map = new Map<string, string>();
    for (const r of rows) {
      map.set(r.key, r.value);
    }
    return {
      defaultCurrency:
        (map.get('defaultCurrency') as 'AED' | 'INR') || DEFAULT_SETTINGS.defaultCurrency,
      reportingCurrency:
        (map.get('reportingCurrency') as 'INR' | 'AED') || DEFAULT_SETTINGS.reportingCurrency,
      rateRefreshMode:
        (map.get('rateRefreshMode') as 'AUTO' | 'MANUAL') || DEFAULT_SETTINGS.rateRefreshMode,
      rateRefreshSchedule:
        map.get('rateRefreshSchedule') || DEFAULT_SETTINGS.rateRefreshSchedule,
      rateMarkup: map.get('rateMarkup') ?? DEFAULT_SETTINGS.rateMarkup,
      timezone: map.get('timezone') || DEFAULT_SETTINGS.timezone,
      staffCanViewReports:
        map.has('staffCanViewReports')
          ? map.get('staffCanViewReports') === 'true'
          : DEFAULT_SETTINGS.staffCanViewReports,
      staffCanExport:
        map.has('staffCanExport')
          ? map.get('staffCanExport') === 'true'
          : DEFAULT_SETTINGS.staffCanExport,
      staffCanAddAccounts:
        map.has('staffCanAddAccounts')
          ? map.get('staffCanAddAccounts') === 'true'
          : DEFAULT_SETTINGS.staffCanAddAccounts,
      staffCanDownloadBackups:
        map.has('staffCanDownloadBackups')
          ? map.get('staffCanDownloadBackups') === 'true'
          : DEFAULT_SETTINGS.staffCanDownloadBackups,
    };
  } catch (error) {
    console.error('Failed to read system settings:', error);
    throw new Error('Failed to load system settings.', { cause: error });
  }
}

export async function upsertSettings(updates: Record<string, string>): Promise<SystemSettings> {
  try {
    for (const [key, value] of Object.entries(updates)) {
      await db
        .insert(settings)
        .values({ key, value, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value, updatedAt: new Date() },
        });
    }
    return await getSystemSettings();
  } catch (error) {
    console.error('Failed to update system settings:', error);
    throw new Error('Failed to update system settings.', { cause: error });
  }
}
