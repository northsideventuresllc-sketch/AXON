/** Typed wrapper — see lib/axon-account-keys.mjs for the runtime and why it's plain .mjs. */
export {
  CHAIN_PROVIDERS,
  getAccountKey,
  setAccountKey,
  deleteAccountKey,
  listAccountKeyStatus,
  last4Of,
} from './axon-account-keys.mjs';

export type ChainProvider = 'openrouter' | 'gemini' | 'anthropic' | 'runpod';

export interface AccountKeyStatus {
  last4: string | null;
  updatedAt: string;
}
