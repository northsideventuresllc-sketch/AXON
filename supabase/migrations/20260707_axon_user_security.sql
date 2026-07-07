-- AXON passcode security: operator credentials, recovery answers, passkeys, tokens.
-- NI-Brain project: kxijunwgbrlfzvgkhklo

-- ---------------------------------------------------------------------------
-- axon_user_security — per-operator passcode, lockout, 2FA, device fingerprints
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.axon_user_security (
  operator_id TEXT PRIMARY KEY,
  passcode_hash TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  email TEXT,
  lockout_phase SMALLINT NOT NULL DEFAULT 0 CHECK (lockout_phase BETWEEN 0 AND 4),
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  tries_remaining_in_phase INTEGER NOT NULL DEFAULT 7,
  security_questions_set_at TIMESTAMPTZ,
  last_security_verify_at TIMESTAMPTZ,
  two_fa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  two_fa_secret TEXT,
  device_fingerprints JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_axon_user_security_email
  ON public.axon_user_security (email)
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_axon_user_security_locked_until
  ON public.axon_user_security (locked_until)
  WHERE locked_until IS NOT NULL;

-- ---------------------------------------------------------------------------
-- axon_security_answers — hashed answers for recovery questions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.axon_security_answers (
  operator_id TEXT NOT NULL REFERENCES public.axon_user_security (operator_id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  answer_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (operator_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_axon_security_answers_operator
  ON public.axon_security_answers (operator_id);

-- ---------------------------------------------------------------------------
-- axon_passkeys — WebAuthn credentials (future passkey login)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.axon_passkeys (
  operator_id TEXT NOT NULL REFERENCES public.axon_user_security (operator_id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL,
  public_key TEXT NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  transports TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (operator_id, credential_id)
);

CREATE INDEX IF NOT EXISTS idx_axon_passkeys_operator
  ON public.axon_passkeys (operator_id);

-- ---------------------------------------------------------------------------
-- axon_security_tokens — one-time recovery / setup tokens
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.axon_security_tokens (
  token TEXT PRIMARY KEY,
  operator_id TEXT NOT NULL REFERENCES public.axon_user_security (operator_id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('recovery', 'email_verify', 'two_fa_setup', 'password_reset', 'webauthn_challenge')),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  metadata TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_axon_security_tokens_operator
  ON public.axon_security_tokens (operator_id);

CREATE INDEX IF NOT EXISTS idx_axon_security_tokens_expires
  ON public.axon_security_tokens (expires_at)
  WHERE used_at IS NULL;

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.axon_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_axon_user_security_updated ON public.axon_user_security;
CREATE TRIGGER trg_axon_user_security_updated
  BEFORE UPDATE ON public.axon_user_security
  FOR EACH ROW
  EXECUTE FUNCTION public.axon_touch_updated_at();

DROP TRIGGER IF EXISTS trg_axon_security_answers_updated ON public.axon_security_answers;
CREATE TRIGGER trg_axon_security_answers_updated
  BEFORE UPDATE ON public.axon_security_answers
  FOR EACH ROW
  EXECUTE FUNCTION public.axon_touch_updated_at();

DROP TRIGGER IF EXISTS trg_axon_passkeys_updated ON public.axon_passkeys;
CREATE TRIGGER trg_axon_passkeys_updated
  BEFORE UPDATE ON public.axon_passkeys
  FOR EACH ROW
  EXECUTE FUNCTION public.axon_touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — service role only (API routes use SUPABASE_SERVICE_KEY)
-- ---------------------------------------------------------------------------
ALTER TABLE public.axon_user_security ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.axon_security_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.axon_passkeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.axon_security_tokens ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.axon_user_security IS 'AXON operator passcode auth, lockout state, 2FA, and known devices';
COMMENT ON TABLE public.axon_security_answers IS 'Hashed security question answers for AXON account recovery';
COMMENT ON TABLE public.axon_passkeys IS 'WebAuthn passkey credentials for AXON operators';
COMMENT ON TABLE public.axon_security_tokens IS 'One-time AXON security tokens (recovery, 2FA setup, etc.)';
