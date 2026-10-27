import "server-only";
import { randomBytes } from "node:crypto";
import { decryptSecret } from "./crypto";

/** A platform's app: a website (by domain) or a mobile app (by app id). */
export interface AppRow {
  id: number;
  platform_id: string;
  name: string;
  kind: "domain" | "app_id";
  identifier: string;
  app_key: string;
  /** encrypted (crypto.ts) */
  app_secret: string;
  created_at: Date;
  updated_at: Date;
}

export interface AppCredentials {
  appKey: string;
  appSecret: string;
}

/** A new key (public id of the app) and secret (proves it's the app). */
export function generateCredentials(): AppCredentials {
  return {
    appKey: `ak_${randomBytes(16).toString("hex")}`,
    appSecret: `sk_${randomBytes(32).toString("base64url")}`,
  };
}

export function credentialsOf(row: AppRow): AppCredentials {
  return { appKey: row.app_key, appSecret: decryptSecret(row.app_secret) };
}

/** "••••a1b2": only the last characters, so a list never exposes the credentials. */
const mask = (value: string) => `••••${value.slice(-4)}`;

/** What lists and updates return: the key and secret masked. */
export function toPublicApp(row: AppRow) {
  const { app_key, app_secret, ...rest } = row;
  return {
    ...rest,
    app_key: mask(app_key),
    app_secret: mask(decryptSecret(app_secret)),
  };
}
