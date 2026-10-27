"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useT } from "@/i18n";
import { useSwitchPlatformMutation } from "@/store/api";

/** Switches the active platform, then reloads the dashboard with that platform's role. */
export function useSwitchPlatform(currentId: string | null | undefined) {
  const t = useT();
  const router = useRouter();
  const [switchPlatform, { isLoading, originalArgs }] =
    useSwitchPlatformMutation();

  const select = async (platformId: string, name: string) => {
    if (platformId === currentId) return;
    try {
      await switchPlatform(platformId).unwrap();
      toast.success(t("platforms.switched", { name }));
      router.replace("/");
      router.refresh();
    } catch {
      // the API error middleware shows the error
    }
  };

  /** id of the platform being switched to, while the request runs */
  const pendingId = isLoading ? originalArgs : undefined;
  return { select, pendingId };
}
