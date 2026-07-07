export interface TurnstileVerifyResult {
  success: boolean;
  errorCodes: string[];
}

/**
 * Verify a Cloudflare Turnstile token server-side.
 */
export async function verifyTurnstileToken(
  token: string,
  remoteIp?: string
): Promise<TurnstileVerifyResult> {
  const secret =
    process.env.TURNSTILE_SECRET_KEY ||
    process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY ||
    '';

  if (!secret) {
    if (process.env.NODE_ENV !== 'production') {
      return { success: true, errorCodes: [] };
    }
    return { success: false, errorCodes: ['missing-secret'] };
  }

  if (!token?.trim()) {
    return { success: false, errorCodes: ['missing-input-response'] };
  }

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set('remoteip', remoteIp);

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      return { success: false, errorCodes: [`http-${response.status}`] };
    }

    const data = (await response.json()) as {
      success?: boolean;
      'error-codes'?: string[];
    };

    return {
      success: Boolean(data.success),
      errorCodes: data['error-codes'] ?? [],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'network-error';
    return { success: false, errorCodes: [message] };
  }
}
