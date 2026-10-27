"use client";

import { Loader2 } from "lucide-react";
import { useEffect } from "react";

/** Shows a spinner for a moment, then goes to the app's page for this payment result. */
export function Redirecting({ url, label, linkLabel }: { url: string; label: string; linkLabel: string }) {
  useEffect(() => {
    const timer = setTimeout(() => window.location.replace(url), 1200);
    return () => clearTimeout(timer);
  }, [url]);

  return (
    <main className="grid min-h-svh place-items-center p-4">
      <div className="grid max-w-sm justify-items-center gap-3 text-center">
        <Loader2 className="size-10 animate-spin text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground" role="status">
          {label}
        </p>
        <a href={url} className="text-sm text-primary underline-offset-4 hover:underline">
          {linkLabel}
        </a>
      </div>
    </main>
  );
}
