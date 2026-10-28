"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";

/** Previous / next for a list read a page (25 rows) at a time. Hidden when there's one page. */
export function Pager({
  page,
  hasMore,
  onChange,
  busy,
}: {
  page: number;
  hasMore: boolean;
  onChange: (page: number) => void;
  busy?: boolean;
}) {
  const t = useT();
  if (page === 1 && !hasMore) return null;
  return (
    <div className="flex items-center justify-end gap-2">
      {busy && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />}
      <span className="text-sm text-muted-foreground">{t("common.pageNumber", { page })}</span>
      <Button variant="outline" size="sm" disabled={page <= 1 || busy} onClick={() => onChange(page - 1)}>
        <ChevronLeft /> {t("common.previousPage")}
      </Button>
      <Button variant="outline" size="sm" disabled={!hasMore || busy} onClick={() => onChange(page + 1)}>
        {t("common.nextPage")} <ChevronRight />
      </Button>
    </div>
  );
}

/**
 * The page number of a list, back to 1 whenever `filters` (anything that changes what the
 * list shows, e.g. JSON of app + search) change.
 */
export function usePage(filters: string) {
  const [state, setState] = useState({ filters, page: 1 });
  const page = state.filters === filters ? state.page : 1;
  return [page, (next: number) => setState({ filters, page: next })] as const;
}
