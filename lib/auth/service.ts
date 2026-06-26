import { randomInt, randomUUID } from "node:crypto";
import { DEFAULT_PROJECT_ID, createDefaultWorkspacePreferences } from "@/lib/defaults";
import { renderOtpMail, type MailService, getMailService } from "@/lib/mail/service";
import { type TenantSeed, NeonStorageProvider } from "@/lib/storage/neon";
import { MemoryStorageAdapter } from "@/lib/storage/memory";
import { WorkspaceStore } from "@/lib/storage/storage";
import {
  type AuthIdentity,
  type AuthOtpPurpose,
  type AuthSessionRecord,
  getAuthStore,
  hashRequestIp,
  hashSensitiveValue,
  normalizeAuthEmail
} from "@/lib/auth/store";

export interface VerifiedAuthSession {
  sessionId: string;
  token: string;
  userId: string;
  organisationId: string;
  email: string;
  name: string | null;
  organisationName: string;
  organisationSlug: string;
}

const OTP_EXPIRY_MINUTES = 10;
const OTP_WINDOW_MINUTES = 10;
const SESSION_TTL_DAYS = 30;
const MAX_OTP_REQUESTS_PER_WINDOW = 5;

export async function requestOtp(input: {
  email: string;
  purpose: AuthOtpPurpose;
  requestIp?: string | null;
  mail?: MailService;
}) {
  const store = getAuthStore();
  const email = normalizeAuthEmail(input.email);
  const existing = await store.findUserByEmail(email);
  if (input.purpose === "signup" && existing) {
    throw new AuthError("An account already exists for this email.", 409);
  }
  if (input.purpose === "login" && !existing) {
    throw new AuthError("No account exists for this email yet.", 404);
  }
  const now = new Date();
  const recentCount = await store.countRecentOtpRequests(
    email,
    hashRequestIp(input.requestIp ?? null),
    new Date(now.getTime() - OTP_WINDOW_MINUTES * 60_000).toISOString()
  );
  if (recentCount >= MAX_OTP_REQUESTS_PER_WINDOW) {
    throw new AuthError("Too many codes requested. Please wait a few minutes and try again.", 429);
  }
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const createdAt = now.toISOString();
  await store.replaceOtp({
    id: randomUUID(),
    email,
    purpose: input.purpose,
    codeHash: hashSensitiveValue(`${email}:${input.purpose}:${code}`),
    expiresAt: new Date(now.getTime() + OTP_EXPIRY_MINUTES * 60_000).toISOString(),
    createdAt,
    consumedAt: null,
    requestIpHash: hashRequestIp(input.requestIp ?? null)
  });
  await (input.mail ?? getMailService()).send(renderOtpMail({
    email,
    code,
    purpose: input.purpose,
    expiresInMinutes: OTP_EXPIRY_MINUTES
  }));
  return { ok: true, email, code };
}

export async function verifyOtp(input: {
  email: string;
  code: string;
  purpose: AuthOtpPurpose;
}) {
  const store = getAuthStore();
  const email = normalizeAuthEmail(input.email);
  const challenge = await store.findActiveOtp(email, input.purpose);
  if (!challenge) {
    throw new AuthError("This code has expired. Request a new code and try again.", 410);
  }
  const expectedHash = hashSensitiveValue(`${email}:${input.purpose}:${input.code.trim()}`);
  if (challenge.codeHash !== expectedHash) {
    throw new AuthError("Incorrect code.", 401);
  }
  const consumedAt = new Date().toISOString();
  await store.consumeOtp(challenge.id, consumedAt);
  const identity = input.purpose === "signup"
    ? await bootstrapAccount(email)
    : await existingIdentity(email);
  const token = randomUUID();
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60_000).toISOString();
  const sessionRecord: AuthSessionRecord = {
    id: sessionId,
    userId: identity.userId,
    organisationId: identity.organisationId,
    email: identity.email,
    name: identity.name,
    tokenHash: hashSensitiveValue(token),
    createdAt: consumedAt,
    expiresAt,
    lastSeenAt: consumedAt,
    revokedAt: null
  };
  await store.createSession(sessionRecord);
  return {
    sessionId,
    token,
    userId: identity.userId,
    organisationId: identity.organisationId,
    email: identity.email,
    name: identity.name,
    organisationName: identity.organisationName,
    organisationSlug: identity.organisationSlug
  } satisfies VerifiedAuthSession;
}

export async function getSessionByToken(token: string) {
  const session = await getAuthStore().getSessionByTokenHash(hashSensitiveValue(token));
  if (!session) return null;
  await getAuthStore().touchSession(session.id, new Date().toISOString());
  const identity = await getAuthStore().getOrganisationOwner(session.organisationId);
  return {
    sessionId: session.id,
    token,
    userId: session.userId,
    organisationId: session.organisationId,
    email: session.email,
    name: session.name,
    organisationName: identity?.organisationName ?? "QueueWrite Workspace",
    organisationSlug: identity?.organisationSlug ?? "queuewrite"
  } satisfies VerifiedAuthSession;
}

export async function revokeSession(token: string) {
  const session = await getAuthStore().getSessionByTokenHash(hashSensitiveValue(token));
  if (!session) return;
  await getAuthStore().revokeSession(session.id, new Date().toISOString());
}

export function authTenantFromSession(session: VerifiedAuthSession): TenantSeed {
  return {
    organisationId: session.organisationId,
    organisationName: session.organisationName,
    organisationSlug: session.organisationSlug,
    userId: session.userId,
    userEmail: session.email,
    userName: session.name
  };
}

async function existingIdentity(email: string) {
  const identity = await getAuthStore().findUserByEmail(email);
  if (!identity) {
    throw new AuthError("No account exists for this email yet.", 404);
  }
  return identity;
}

async function bootstrapAccount(email: string): Promise<AuthIdentity> {
  const identity = await getAuthStore().createUserAccount({ email });
  await bootstrapWorkspace(identity);
  return identity;
}

async function bootstrapWorkspace(identity: AuthIdentity) {
  const store = createScopedWorkspaceStore(identity);
  await store.ensureProject(DEFAULT_PROJECT_ID);
  const preferences = await store.ensureWorkspacePreferences();
  await store.saveWorkspacePreferences({
    ...preferences,
    organisationId: identity.organisationId,
    userId: identity.userId,
    account: {
      name: identity.name ?? "",
      email: identity.email,
      workspaceName: identity.organisationName
    },
    notifications: {
      ...createDefaultWorkspacePreferences().notifications,
      ...preferences.notifications
    },
    updatedAt: new Date().toISOString()
  });
}

function createScopedWorkspaceStore(identity: AuthIdentity) {
  if (process.env.STORAGE_BACKEND === "neon") {
    return new WorkspaceStore(new NeonStorageProvider({ tenant: {
      organisationId: identity.organisationId,
      organisationName: identity.organisationName,
      organisationSlug: identity.organisationSlug,
      userId: identity.userId,
      userEmail: identity.email,
      userName: identity.name
    } }));
  }
  return new WorkspaceStore(new MemoryStorageAdapter({ sharedKey: identity.organisationId }));
}

export class AuthError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}
