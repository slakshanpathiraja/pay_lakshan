"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useT } from "@/i18n";
import { api, useLogoutMutation } from "@/store/api";
import { useAppDispatch } from "@/store/hooks";

export function useLogout() {
  const t = useT();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const [logout, { isLoading }] = useLogoutMutation();

  const run = async () => {
    await logout()
      .unwrap()
      .catch(() => {});
    dispatch(api.util.resetApiState());
    toast.success(t("common.loggedOut"));
    router.replace("/login");
    router.refresh();
  };

  return { logout: run, isLoading };
}
