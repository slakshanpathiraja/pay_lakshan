import type { TFunction } from "@/i18n";
import type { User } from "@/store/types";

/** The user's role name; the built-in roles are translated. */
export function roleLabel(
  t: TFunction,
  user: Pick<User, "role_key" | "role_name">,
) {
  return roleName(t, { key: user.role_key, name: user.role_name });
}

/** A role's display name; the built-in roles are translated. */
export function roleName(
  t: TFunction,
  role: { key: string | null; name: string | null },
) {
  if (role.key === "super_admin") return t("roles.super_admin");
  if (role.key === "manager") return t("roles.manager");
  return role.name ?? "";
}

export const isSuperAdminUser = (user: Pick<User, "role_key">) =>
  user.role_key === "super_admin";
