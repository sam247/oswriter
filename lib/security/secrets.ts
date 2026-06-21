import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

interface EncryptedPayload {
  v: 1;
  iv: string;
  tag: string;
  data: string;
}

export function encryptSecret(value: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error("A secret value is required.");
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, secretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(normalized, "utf8"), cipher.final()]);
  const payload: EncryptedPayload = {
    v: 1,
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    data: encrypted.toString("base64url")
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decryptSecret(value: string) {
  const payload = parseEncryptedPayload(value);
  const decipher = createDecipheriv(
    ALGORITHM,
    secretKey(),
    Buffer.from(payload.iv, "base64url")
  );
  decipher.setAuthTag(Buffer.from(payload.tag, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.data, "base64url")),
    decipher.final()
  ]);
  return decrypted.toString("utf8");
}

function parseEncryptedPayload(value: string): EncryptedPayload {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<EncryptedPayload>;
    if (parsed.v !== 1 || !parsed.iv || !parsed.tag || !parsed.data) {
      throw new Error("Invalid payload.");
    }
    return parsed as EncryptedPayload;
  } catch {
    throw new Error("Stored secret could not be decrypted.");
  }
}

function secretKey() {
  // `OSW_SECRETS_KEY` is the preferred production secret. The workspace
  // password fallback keeps local development usable without extra setup.
  const source = process.env.OSW_SECRETS_KEY ?? process.env.WORKSPACE_PASSWORD ?? "oswriter";
  return createHash("sha256").update(source).digest();
}
