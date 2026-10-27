import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { getConfig } from "./config";

// AES-256-GCM for secrets stored in the DB (e.g. SMTP passwords).
// Format: base64(iv[12] | tag[16] | ciphertext)
function key() {
  const { APP_ENCRYPTION_KEY, JWT_SECRET } = getConfig();
  return createHash("sha256")
    .update(APP_ENCRYPTION_KEY ?? `${JWT_SECRET}:encryption`)
    .digest();
}

export function encryptSecret(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
}

export function decryptSecret(encoded: string) {
  const raw = Buffer.from(encoded, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([
    decipher.update(raw.subarray(28)),
    decipher.final(),
  ]).toString("utf8");
}
