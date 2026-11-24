import { db } from '../db/index.ts';
import { activityLogs } from '../db/schema.ts';

export interface LogActivityParams {
  userId: number | null;
  action: string;
  entity: string;
  entityId: string | number;
  beforeSnapshot?: unknown;
  afterSnapshot?: unknown;
  reason?: string | null;
}

export async function logActivity(
  params: LogActivityParams,
  executor: Pick<typeof db, 'insert'> = db
): Promise<void> {
  try {
    await executor.insert(activityLogs).values({
      userId: params.userId,
      action: params.action,
      entity: params.entity,
      entityId: String(params.entityId),
      beforeSnapshot: params.beforeSnapshot ?? null,
      afterSnapshot: params.afterSnapshot ?? null,
      reason: params.reason ?? null,
    });
  } catch (error) {
    console.error('Failed to write activity log:', error);
    throw new Error('Failed to record audit trail entry.', { cause: error });
  }
}
