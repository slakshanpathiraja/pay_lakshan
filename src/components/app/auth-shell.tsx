"use client";

import {
  CalendarRange,
  Coins,
  CreditCard,
  Languages,
  LayoutGrid,
  ShieldCheck,
  ShoppingCart,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/config";
import { BrandLogo } from "./brand-logo";
import { Copyright } from "./copyright";
import { LanguageSwitcher } from "./language-switcher";
import { ThemeToggle } from "./theme-toggle";

interface Feature {
  icon: LucideIcon;
  title: TranslationKey;
  text: TranslationKey;
}

const featureSections: { title: TranslationKey; items: Feature[] }[] = [
  {
    title: "features.management",
    items: [
      {
        icon: ShieldCheck,
        title: "features.rolesTitle",
        text: "features.rolesText",
      },
      { icon: Users, title: "features.usersTitle", text: "features.usersText" },
      {
        icon: ShoppingCart,
        title: "features.ordersTitle",
        text: "features.ordersText",
      },
      {
        icon: CalendarRange,
        title: "features.monthlyTitle",
        text: "features.monthlyText",
      },
    ],
  },
  {
    title: "features.platform",
    items: [
      {
        icon: LayoutGrid,
        title: "features.appsTitle",
        text: "features.appsText",
      },
      {
        icon: Coins,
        title: "features.currencyTitle",
        text: "features.currencyText",
      },
      {
        icon: CreditCard,
        title: "features.paymentsTitle",
        text: "features.paymentsText",
      },
      {
        icon: Languages,
        title: "features.languagesTitle",
        text: "features.languagesText",
      },
    ],
  },
];

/** Split-screen layout for the login / forced password change screens. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  const t = useT();

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      {/* Brand panel */}
      <aside className="relative hidden overflow-hidden bg-zinc-100 p-10 text-zinc-900 lg:flex lg:flex-col dark:bg-zinc-950 dark:text-white">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 -left-32 size-[28rem] rounded-full bg-indigo-400/25 blur-3xl dark:bg-indigo-600/30" />
          <div className="absolute -right-24 bottom-0 size-[26rem] rounded-full bg-emerald-400/20 blur-3xl dark:bg-emerald-500/20" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgb(0_0_0/0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgb(0_0_0/0.04)_1px,transparent_1px)] bg-[size:48px_48px] dark:bg-[linear-gradient(to_right,rgb(255_255_255/0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.04)_1px,transparent_1px)]" />
        </div>

        <BrandLogo className="relative" />

        <div className="relative my-auto max-w-xl py-8">
          <h2 className="text-4xl leading-tight font-semibold tracking-tight">
            {t("login.heroTitle")}
          </h2>
          <p className="mt-4 text-base text-zinc-600 dark:text-zinc-300">
            {t("login.heroSubtitle")}
          </p>

          <div className="mt-10 grid gap-8">
            {featureSections.map((section) => (
              <section key={section.title}>
                <h3 className="mb-4 text-xs font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400">
                  {t(section.title)}
                </h3>
                <ul className="grid gap-x-6 gap-y-5 xl:grid-cols-2">
                  {section.items.map(({ icon: Icon, title, text }) => (
                    <li key={title} className="flex gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-zinc-900/10 bg-white/70 shadow-sm dark:border-white/10 dark:bg-white/5">
                        <Icon className="size-4 text-emerald-600 dark:text-emerald-400" />
                      </span>
                      <div>
                        <p className="text-sm font-medium">{t(title)}</p>
                        <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                          {t(text)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </aside>

      {/* Form panel */}
      <main className="flex flex-col p-6 md:p-10">
        <div className="flex items-center justify-between">
          <BrandLogo className="lg:invisible" />
          <div className="flex items-center gap-1">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>

        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <Copyright />
          <nav className="flex gap-4 text-xs text-muted-foreground">
            <a href="#" className="hover:text-foreground">
              {t("common.privacy")}
            </a>
            <a href="#" className="hover:text-foreground">
              {t("common.terms")}
            </a>
            <a href="#" className="hover:text-foreground">
              {t("common.support")}
            </a>
          </nav>
        </div>
      </main>
    </div>
  );
}
