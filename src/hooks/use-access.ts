"use client";

import { useCallback } from "react";
import { hasAccess } from "@/lib/access";
import { useMeQuery } from "@/store/api";
import type { EndpointId } from "@/store/types";
import { canOpenPage, type MenuItem } from "@/utils/menu";
import { endpointAccess } from "@/utils/endpoint-access";

/**
 * What the signed-in user may do, from GET /api/auth/me. Use it to hide UI the user
 * can't use — the API enforces the same rules on every request regardless.
 */
export function useAccess() {
  const { data: me, isLoading } = useMeQuery();
  const access = me?.access;

  const can = useCallback(
    (endpoint: EndpointId) =>
      hasAccess(endpointAccess[endpoint], access, { endpoint }),
    [access],
  );
  const canPage = useCallback(
    (page: MenuItem) => canOpenPage(page, access),
    [access],
  );

  return {
    me,
    access,
    isLoading,
    isSuperAdmin: !!access?.superAdmin,
    can,
    canPage,
  };
}
