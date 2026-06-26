import { createHash, randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";

export type AuthOtpPurpose = "login" | "signup";

export interface AuthIdentity {
  userId: string;
  email: string;
  name: string | null;
  organisationId: string;
  organisationName: string;
  organisationSlug: string;
  createdAt: string;
}

export interface AuthOtpRecord {
  id: string;
  email: string;
  purpose: AuthOtpPurpose;
  codeHash: string;
  expiresAt: string;
  createdAt: string;
  consumedAt: string | null;
  requestIpHash: string | null;
}

export interface AuthSessionRecord {
  id: string;
  userId: string;
  organisationId: string;
  email: string;
  name: string | null;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
}

export interface AuthStore {
  findUserByEmail(email: string): Promise<AuthIdentity | null>;
  createUserAccount(input: { email: string; name?: string | null; workspaceName?: string | null }): Promise<AuthIdentity>;
  replaceOtp(record: AuthOtpRecord): Promise<void>;
  findActiveOtp(email: string, purpose: AuthOtpPurpose, nowIso?: string): Promise<AuthOtpRecord | null>;
  consumeOtp(id: string, consumedAt: string): Promise<void>;
  countRecentOtpRequests(email: string, requestIpHash: string | null, sinceIso: string): Promise<number>;
  createSession(record: AuthSessionRecord): Promise<void>;
  getSessionByTokenHash(tokenHash: string, nowIso?: string): Promise<AuthSessionRecord | null>;
  touchSession(id: string, seenAt: string): Promise<void>;
  revokeSession(id: string, revokedAt: string): Promise<void>;
  getOrganisationOwner(organisationId: string): Promise<AuthIdentity | null>;
}

type NeonSql = ReturnType<typeof neon>;

class MemoryAuthStore implements AuthStore {
  async findUserByEmail(email: string) {
    return memory.usersByEmail.get(email) ?? null;
  }

  async createUserAccount(input: { email: string; name?: string | null; workspaceName?: string | null }) {
    const existing = memory.usersByEmail.get(input.email);
    if (existing) return existing;
    const createdAt = new Date().toISOString();
    const workspaceName = input.workspaceName?.trim() || defaultWorkspaceName(input.email);
    const identity: AuthIdentity = {
      userId: randomUUID(),
      email: input.email,
      name: input.name?.trim() || emailName(input.email),
      organisationId: randomUUID(),
      organisationName: workspaceName,
      organisationSlug: `${slugify(workspaceName)}-${randomUUID().slice(0, 8)}`,
      createdAt
    };
    memory.usersByEmail.set(identity.email, identity);
    memory.usersByOrganisation.set(identity.organisationId, identity);
    return identity;
  }

  async replaceOtp(record: AuthOtpRecord) {
    memory.otps = memory.otps.filter((otp) => !(otp.email === record.email && otp.purpose === record.purpose && otp.consumedAt === null));
    memory.otps.push(record);
  }

  async findActiveOtp(email: string, purpose: AuthOtpPurpose, nowIso = new Date().toISOString()) {
    return memory.otps.find((otp) => (
      otp.email === email &&
      otp.purpose === purpose &&
      otp.consumedAt === null &&
      otp.expiresAt > nowIso
    )) ?? null;
  }

  async consumeOtp(id: string, consumedAt: string) {
    memory.otps = memory.otps.map((otp) => otp.id === id ? { ...otp, consumedAt } : otp);
  }

  async countRecentOtpRequests(email: string, requestIpHash: string | null, sinceIso: string) {
    return memory.otps.filter((otp) => (
      otp.createdAt >= sinceIso &&
      (otp.email === email || (requestIpHash && otp.requestIpHash === requestIpHash))
    )).length;
  }

  async createSession(record: AuthSessionRecord) {
    memory.sessions.push(record);
  }

  async getSessionByTokenHash(tokenHash: string, nowIso = new Date().toISOString()) {
    return memory.sessions.find((session) => (
      session.tokenHash === tokenHash &&
      session.revokedAt === null &&
      session.expiresAt > nowIso
    )) ?? null;
  }

  async touchSession(id: string, seenAt: string) {
    memory.sessions = memory.sessions.map((session) => session.id === id ? { ...session, lastSeenAt: seenAt } : session);
  }

  async revokeSession(id: string, revokedAt: string) {
    memory.sessions = memory.sessions.map((session) => session.id === id ? { ...session, revokedAt } : session);
  }

  async getOrganisationOwner(organisationId: string) {
    return memory.usersByOrganisation.get(organisationId) ?? null;
  }
}

class NeonAuthStore implements AuthStore {
  constructor(private readonly sql: NeonSql) {}

  async findUserByEmail(email: string) {
    const found = rows(await this.sql`
      select u.id as user_id, u.email, u.name, u.created_at, o.id as organisation_id, o.name as organisation_name, o.slug as organisation_slug
      from users u
      join organisation_users ou on ou.user_id = u.id
      join organisations o on o.id = ou.organisation_id
      where lower(u.email) = lower(${email})
      order by ou.created_at asc
      limit 1
    `);
    return found[0] ? identityFromRow(found[0]) : null;
  }

  async createUserAccount(input: { email: string; name?: string | null; workspaceName?: string | null }) {
    const existing = await this.findUserByEmail(input.email);
    if (existing) return existing;
    const createdAt = new Date().toISOString();
    const userId = randomUUID();
    const organisationId = randomUUID();
    const name = input.name?.trim() || emailName(input.email);
    const workspaceName = input.workspaceName?.trim() || defaultWorkspaceName(input.email);
    const organisationSlug = `${slugify(workspaceName)}-${userId.slice(0, 8)}`;
    await this.sql`
      insert into organisations (id, name, slug, created_at, updated_at)
      values (${organisationId}, ${workspaceName}, ${organisationSlug}, ${createdAt}::timestamptz, ${createdAt}::timestamptz)
    `;
    await this.sql`
      insert into organisation_settings (organisation_id, settings, created_at, updated_at)
      values (${organisationId}, '{}'::jsonb, ${createdAt}::timestamptz, ${createdAt}::timestamptz)
    `;
    await this.sql`
      insert into users (id, auth_subject, email, name, created_at, updated_at)
      values (${userId}, ${`email:${input.email}`}, ${input.email}, ${name}, ${createdAt}::timestamptz, ${createdAt}::timestamptz)
    `;
    await this.sql`
      insert into organisation_users (organisation_id, user_id, role, created_at, updated_at)
      values (${organisationId}, ${userId}, 'owner', ${createdAt}::timestamptz, ${createdAt}::timestamptz)
    `;
    await this.sql`
      insert into billing_accounts (organisation_id, created_at, updated_at)
      values (${organisationId}, ${createdAt}::timestamptz, ${createdAt}::timestamptz)
      on conflict (organisation_id) do nothing
    `;
    return {
      userId,
      email: input.email,
      name,
      organisationId,
      organisationName: workspaceName,
      organisationSlug,
      createdAt
    };
  }

  async replaceOtp(record: AuthOtpRecord) {
    await this.sql`
      update auth_otp_codes
      set consumed_at = now()
      where lower(email) = lower(${record.email})
        and purpose = ${record.purpose}
        and consumed_at is null
    `;
    await this.sql`
      insert into auth_otp_codes (
        id, email, purpose, code_hash, expires_at, created_at, consumed_at, request_ip_hash
      ) values (
        ${record.id}, ${record.email}, ${record.purpose}, ${record.codeHash},
        ${record.expiresAt}::timestamptz, ${record.createdAt}::timestamptz, null, ${record.requestIpHash}
      )
    `;
  }

  async findActiveOtp(email: string, purpose: AuthOtpPurpose, nowIso = new Date().toISOString()) {
    const found = rows(await this.sql`
      select id, email, purpose, code_hash, expires_at, created_at, consumed_at, request_ip_hash
      from auth_otp_codes
      where lower(email) = lower(${email})
        and purpose = ${purpose}
        and consumed_at is null
        and expires_at > ${nowIso}::timestamptz
      order by created_at desc
      limit 1
    `);
    return found[0] ? otpFromRow(found[0]) : null;
  }

  async consumeOtp(id: string, consumedAt: string) {
    await this.sql`
      update auth_otp_codes
      set consumed_at = ${consumedAt}::timestamptz
      where id = ${id}
    `;
  }

  async countRecentOtpRequests(email: string, requestIpHash: string | null, sinceIso: string) {
    const emailRows = rows(await this.sql`
      select count(*)::int as count
      from auth_otp_codes
      where created_at >= ${sinceIso}::timestamptz
        and lower(email) = lower(${email})
    `);
    const emailCount = Number(emailRows[0]?.count ?? 0);
    if (!requestIpHash) return emailCount;
    const ipRows = rows(await this.sql`
      select count(*)::int as count
      from auth_otp_codes
      where created_at >= ${sinceIso}::timestamptz
        and request_ip_hash = ${requestIpHash}
    `);
    return Math.max(emailCount, Number(ipRows[0]?.count ?? 0));
  }

  async createSession(record: AuthSessionRecord) {
    await this.sql`
      insert into auth_sessions (
        id, user_id, organisation_id, email, name, token_hash, created_at, expires_at, last_seen_at, revoked_at
      ) values (
        ${record.id}, ${record.userId}, ${record.organisationId}, ${record.email}, ${record.name},
        ${record.tokenHash}, ${record.createdAt}::timestamptz, ${record.expiresAt}::timestamptz,
        ${record.lastSeenAt}::timestamptz, null
      )
    `;
  }

  async getSessionByTokenHash(tokenHash: string, nowIso = new Date().toISOString()) {
    const found = rows(await this.sql`
      select id, user_id, organisation_id, email, name, token_hash, created_at, expires_at, last_seen_at, revoked_at
      from auth_sessions
      where token_hash = ${tokenHash}
        and revoked_at is null
        and expires_at > ${nowIso}::timestamptz
      limit 1
    `);
    return found[0] ? sessionFromRow(found[0]) : null;
  }

  async touchSession(id: string, seenAt: string) {
    await this.sql`
      update auth_sessions
      set last_seen_at = ${seenAt}::timestamptz
      where id = ${id}
    `;
  }

  async revokeSession(id: string, revokedAt: string) {
    await this.sql`
      update auth_sessions
      set revoked_at = ${revokedAt}::timestamptz
      where id = ${id}
    `;
  }

  async getOrganisationOwner(organisationId: string) {
    const found = rows(await this.sql`
      select u.id as user_id, u.email, u.name, u.created_at, o.id as organisation_id, o.name as organisation_name, o.slug as organisation_slug
      from organisation_users ou
      join users u on u.id = ou.user_id
      join organisations o on o.id = ou.organisation_id
      where ou.organisation_id = ${organisationId}
      order by case when ou.role = 'owner' then 0 else 1 end, ou.created_at asc
      limit 1
    `);
    return found[0] ? identityFromRow(found[0]) : null;
  }
}

type MemoryAuthState = {
  usersByEmail: Map<string, AuthIdentity>;
  usersByOrganisation: Map<string, AuthIdentity>;
  otps: AuthOtpRecord[];
  sessions: AuthSessionRecord[];
};

const memory = memoryState();

let singleton: AuthStore | null = null;

export function getAuthStore() {
  singleton ??= createAuthStore();
  return singleton;
}

export function createAuthStore(): AuthStore {
  const backend = authBackend();
  if (backend === "neon") {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL is required when AUTH_BACKEND=neon.");
    }
    return new NeonAuthStore(neon(url));
  }
  return new MemoryAuthStore();
}

export function resetMemoryAuthStore() {
  memory.usersByEmail.clear();
  memory.usersByOrganisation.clear();
  memory.otps = [];
  memory.sessions = [];
  singleton = null;
}

export function hashSensitiveValue(value: string) {
  return createHash("sha256")
    .update(`${authSecret()}:${value}`)
    .digest("hex");
}

export function hashRequestIp(value: string | null) {
  return value ? hashSensitiveValue(value) : null;
}

export function normalizeAuthEmail(value: string) {
  return value.trim().toLowerCase();
}

export function authBackend() {
  if (process.env.AUTH_BACKEND) return process.env.AUTH_BACKEND;
  if (process.env.NODE_ENV === "test") return "memory";
  return process.env.DATABASE_URL ? "neon" : "memory";
}

function memoryState() {
  const scope = globalThis as typeof globalThis & {
    __queuewriteMemoryAuthState__?: MemoryAuthState;
  };
  scope.__queuewriteMemoryAuthState__ ??= {
    usersByEmail: new Map<string, AuthIdentity>(),
    usersByOrganisation: new Map<string, AuthIdentity>(),
    otps: [],
    sessions: []
  };
  return scope.__queuewriteMemoryAuthState__;
}

function authSecret() {
  return process.env.AUTH_SECRET ?? process.env.OSW_SECRETS_KEY ?? process.env.WORKSPACE_PASSWORD ?? "oswriter";
}

function emailName(email: string) {
  const local = email.split("@")[0] ?? email;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ") || email;
}

function defaultWorkspaceName(email: string) {
  return `${emailName(email)} Workspace`;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "queuewrite";
}

function identityFromRow(row: Record<string, unknown>): AuthIdentity {
  return {
    userId: String(row.user_id),
    email: String(row.email),
    name: row.name ? String(row.name) : null,
    organisationId: String(row.organisation_id),
    organisationName: String(row.organisation_name),
    organisationSlug: String(row.organisation_slug),
    createdAt: toIso(row.created_at)
  };
}

function otpFromRow(row: Record<string, unknown>): AuthOtpRecord {
  return {
    id: String(row.id),
    email: String(row.email),
    purpose: row.purpose === "signup" ? "signup" : "login",
    codeHash: String(row.code_hash),
    expiresAt: toIso(row.expires_at),
    createdAt: toIso(row.created_at),
    consumedAt: row.consumed_at ? toIso(row.consumed_at) : null,
    requestIpHash: row.request_ip_hash ? String(row.request_ip_hash) : null
  };
}

function sessionFromRow(row: Record<string, unknown>): AuthSessionRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    organisationId: String(row.organisation_id),
    email: String(row.email),
    name: row.name ? String(row.name) : null,
    tokenHash: String(row.token_hash),
    createdAt: toIso(row.created_at),
    expiresAt: toIso(row.expires_at),
    lastSeenAt: toIso(row.last_seen_at),
    revokedAt: row.revoked_at ? toIso(row.revoked_at) : null
  };
}

function toIso(value: unknown) {
  return value instanceof Date ? value.toISOString() : String(value);
}

function rows(value: unknown) {
  return value as Array<Record<string, unknown>>;
}
