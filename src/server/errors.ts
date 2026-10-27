import type { Messages } from "@/i18n/config";

/** Every API error code must have a translation under `errors` — enforced by this type. */
export type ErrorCode = keyof Messages["errors"];

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: ErrorCode,
    public details?: unknown,
  ) {
    super(code);
  }
}
