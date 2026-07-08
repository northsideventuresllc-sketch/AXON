export function resendSend(
  cfg: { resendKey?: string; resendFrom?: string; dryRun?: boolean },
  options: {
    to: string;
    subject: string;
    html: string;
    from?: string;
    replyTo?: string;
  }
): Promise<{ id: string }>;
