export function logOutreachSendSignal(
  sbInsert: (table: string, row: Record<string, unknown>) => Promise<unknown>,
  leadId: string,
  options?: {
    channel?: string;
    payload?: Record<string, unknown> | string;
    operatorId?: string;
  }
): Promise<void>;
