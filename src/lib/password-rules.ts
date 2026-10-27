import type { TranslationKey } from "@/i18n/config";

export interface PasswordRule {
  key: string;
  /** checklist label */
  label: TranslationKey;
  /** error shown when the rule fails */
  error: TranslationKey;
  test: (password: string) => boolean;
}

// Mirrors passwordSchema in src/server/schemas.ts — keep both in sync.
export const passwordRules: PasswordRule[] = [
  {
    key: "length",
    label: "password.ruleLength",
    error: "validation.passwordMin",
    test: (p) => p.length >= 8,
  },
  {
    key: "lower",
    label: "password.ruleLower",
    error: "validation.passwordLower",
    test: (p) => /[a-z]/.test(p),
  },
  {
    key: "upper",
    label: "password.ruleUpper",
    error: "validation.passwordUpper",
    test: (p) => /[A-Z]/.test(p),
  },
  {
    key: "number",
    label: "password.ruleNumber",
    error: "validation.passwordNumber",
    test: (p) => /[0-9]/.test(p),
  },
  {
    key: "symbol",
    label: "password.ruleSymbol",
    error: "validation.passwordSymbol",
    test: (p) => /[^A-Za-z0-9]/.test(p),
  },
];

const levels: TranslationKey[] = [
  "password.strengthWeak",
  "password.strengthWeak",
  "password.strengthFair",
  "password.strengthGood",
  "password.strengthStrong",
  "password.strengthVeryStrong",
];

/** Live strength analysis: which rules pass and the overall percentage. */
export function passwordStrength(password: string) {
  const results = passwordRules.map((rule) => ({
    rule,
    passed: rule.test(password),
  }));
  const passedCount = results.filter((r) => r.passed).length;
  return {
    results,
    passedCount,
    percent: Math.round((passedCount / passwordRules.length) * 100),
    level: levels[passedCount],
    isStrong: passedCount === passwordRules.length,
  };
}

/** First failing rule's error, or null when the password meets every rule. */
export function passwordError(password: string): TranslationKey | null {
  return passwordRules.find((r) => !r.test(password))?.error ?? null;
}
