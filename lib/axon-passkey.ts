import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from '@simplewebauthn/server';
import { DEFAULT_OPERATOR_ID } from '@/lib/axon-security-types';
import { getAuthRecord, updateAuthRecord } from '@/lib/axon-security';

function getRpId(): string {
  if (process.env.WEBAUTHN_RP_ID) return process.env.WEBAUTHN_RP_ID;
  const url = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
  if (url) {
    try {
      return new URL(url.startsWith('http') ? url : `https://${url}`).hostname;
    } catch {
      /* fall through */
    }
  }
  return 'localhost';
}

function getOrigin(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

export async function createPasskeyRegistrationOptions(operatorId = DEFAULT_OPERATOR_ID) {
  const auth = await getAuthRecord(operatorId);
  const options = await generateRegistrationOptions({
    rpName: 'NORTHSiDE AXON',
    rpID: getRpId(),
    userName: operatorId,
    userDisplayName: auth.displayName,
    attestationType: 'none',
    excludeCredentials: auth.passkeys.map((pk) => ({
      id: pk.id,
      transports: pk.transports as AuthenticatorTransportFuture[] | undefined,
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });

  await updateAuthRecord(operatorId, { webauthnChallenge: options.challenge });
  return options;
}

export async function verifyPasskeyRegistration(
  response: RegistrationResponseJSON,
  operatorId = DEFAULT_OPERATOR_ID
) {
  const auth = await getAuthRecord(operatorId);
  if (!auth.webauthnChallenge) {
    return { ok: false as const, error: 'No registration challenge' };
  }

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: auth.webauthnChallenge,
    expectedOrigin: getOrigin(),
    expectedRPID: getRpId(),
  });

  if (!verification.verified || !verification.registrationInfo) {
    return { ok: false as const, error: 'Passkey registration failed' };
  }

  const { credential } = verification.registrationInfo;
  const passkeys = [
    ...auth.passkeys,
    {
      id: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString('base64url'),
      counter: credential.counter,
      transports: response.response.transports,
    },
  ];

  await updateAuthRecord(operatorId, {
    passkeys,
    webauthnChallenge: null,
  });

  return { ok: true as const };
}

export async function createPasskeyLoginOptions(operatorId = DEFAULT_OPERATOR_ID) {
  const auth = await getAuthRecord(operatorId);
  const options = await generateAuthenticationOptions({
    rpID: getRpId(),
    allowCredentials: auth.passkeys.map((pk) => ({
      id: pk.id,
      transports: pk.transports as AuthenticatorTransportFuture[] | undefined,
    })),
    userVerification: 'preferred',
  });

  await updateAuthRecord(operatorId, { webauthnChallenge: options.challenge });
  return options;
}

export async function verifyPasskeyLogin(
  response: AuthenticationResponseJSON,
  operatorId = DEFAULT_OPERATOR_ID
) {
  const auth = await getAuthRecord(operatorId);
  if (!auth.webauthnChallenge) {
    return { ok: false as const, error: 'No authentication challenge' };
  }

  const passkey = auth.passkeys.find((pk) => pk.id === response.id);
  if (!passkey) {
    return { ok: false as const, error: 'Passkey not found' };
  }

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: auth.webauthnChallenge,
    expectedOrigin: getOrigin(),
    expectedRPID: getRpId(),
    credential: {
      id: passkey.id,
      publicKey: Buffer.from(passkey.publicKey, 'base64url'),
      counter: passkey.counter,
      transports: passkey.transports as AuthenticatorTransportFuture[] | undefined,
    },
  });

  if (!verification.verified) {
    return { ok: false as const, error: 'Passkey authentication failed' };
  }

  const passkeys = auth.passkeys.map((pk) =>
    pk.id === passkey.id
      ? { ...pk, counter: verification.authenticationInfo.newCounter }
      : pk
  );

  await updateAuthRecord(operatorId, {
    passkeys,
    webauthnChallenge: null,
  });

  return { ok: true as const, displayName: auth.displayName };
}

export { getRpId, getOrigin };
