/** Operator defaults */
export const DEFAULT_OPERATOR_ID = 'default';
export const MASTER_PASSCODE = 'jobo0602';
export const MASTER_DISPLAY_NAME = 'JB';

/** Lockout policy */
export const MAX_PASSCODE_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 15;
export const SECURITY_VERIFY_INTERVAL_DAYS = 30;
export const RECOVERY_TOKEN_TTL_HOURS = 24;

/** Lockout escalation phase (0 = initial, 4 = locked until security questions answered). */
export type LockoutPhase = 0 | 1 | 2 | 3 | 4;

export interface DeviceFingerprint {
  device_id: string;
  user_agent?: string;
  first_seen: string;
  last_seen: string;
}

export interface AxonUserSecurity {
  operator_id: string;
  passcode_hash: string;
  display_name: string;
  email: string | null;
  lockout_phase: LockoutPhase;
  failed_attempts: number;
  locked_until: string | null;
  tries_remaining_in_phase: number;
  security_questions_set_at: string | null;
  last_security_verify_at: string | null;
  two_fa_enabled: boolean;
  two_fa_secret: string | null;
  device_fingerprints: DeviceFingerprint[];
  created_at: string;
  updated_at: string;
}

export interface SecurityQuestionAnswer {
  question_id: string;
  answer_hash: string;
}

export interface AxonSecurityAnswerRow extends SecurityQuestionAnswer {
  operator_id: string;
  created_at: string;
  updated_at: string;
}

export interface AxonPasskeyRow {
  operator_id: string;
  credential_id: string;
  public_key: string;
  counter: number;
  transports: string[] | null;
  created_at: string;
  updated_at: string;
}

export type SecurityTokenType =
  | 'recovery'
  | 'email_verify'
  | 'two_fa_setup'
  | 'password_reset';

export interface AxonSecurityTokenRow {
  token: string;
  operator_id: string;
  type: SecurityTokenType;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

/** Signed AXON session cookie payload. */
export interface SessionPayload {
  operatorId: string;
  displayName: string;
  issuedAt: number;
  lastActivity: number;
  deviceId: string;
  securityVerified?: boolean;
  totpVerified?: boolean;
}

export interface LockoutState {
  locked: boolean;
  lockout_phase: LockoutPhase;
  tries_remaining_in_phase: number;
  locked_until: string | null;
  requires_security_questions: boolean;
  /** Convenience alias for API responses */
  attemptsRemaining?: number;
  failedAttempts?: number;
}

export interface FailedAttemptResult extends LockoutState {
  failed_attempts: number;
  email_sent?: boolean;
}

export interface AuthStatus {
  needsSecuritySetup: boolean;
  needsSecurityVerify: boolean;
  displayName: string;
  lockout: LockoutState;
  totpEnabled: boolean;
  hasPasskeys: boolean;
}

export interface VerifyPasscodeResult {
  ok: boolean;
  needsSecuritySetup: boolean;
  needsSecurityVerify: boolean;
  displayName: string;
  lockout?: LockoutState;
  error?: string;
}

/** In-memory auth view used by passkey helpers */
export interface AuthRecordView {
  operatorId: string;
  displayName: string;
  securitySetupComplete: boolean;
  totpEnabled: boolean;
  totpSecret: string | null;
  passkeys: Array<{
    id: string;
    publicKey: string;
    counter: number;
    transports?: string[];
  }>;
  webauthnChallenge: string | null;
}
