import {
  AppWindow,
  BadgeCheck,
  BookOpen,
  Landmark,
  Play,
  LogIn,
  RefreshCw,
  Building,
  CreditCard,
  Building2,
  KeyRound,
  LayoutDashboard,
  LayoutTemplate,
  ShoppingCart,
  Smartphone,
  Mail,
  Settings,
  Settings2,
  ShieldCheck,
  UserRound,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import type { TranslationKey } from "@/i18n/config";
import { hasAccess, type AccessInfo } from "@/lib/access";

export interface MenuItem {
  key: string;
  /** translation key for the label */
  title: TranslationKey;
  /** unique page URL — also what permission cards grant */
  href: string;
  icon: LucideIcon;
  /** who can open the page; "permission" pages must be granted via a role */
  access: "authenticated" | "permission";
}

export interface MenuGroup {
  key: string;
  /** heading in the side menu; omit for a group shown without one */
  title?: TranslationKey;
  items: MenuItem[];
}

// Side navigation definition. Add new pages here — each needs a unique href.
// Every menu page is granted through a permission card (see seedDefaultPermissions).
export const menuGroups: MenuGroup[] = [
  {
    key: "main",
    items: [
      {
        key: "dashboard",
        title: "menu.dashboard",
        href: "/",
        icon: LayoutDashboard,
        access: "permission",
      },
      // an app's customers and what they buy
      {
        key: "users",
        title: "menu.users",
        href: "/users",
        icon: UsersRound,
        access: "permission",
      },
      {
        key: "devices",
        title: "menu.devices",
        href: "/devices",
        icon: Smartphone,
        access: "permission",
      },
      {
        key: "orders",
        title: "menu.orders",
        href: "/orders",
        icon: ShoppingCart,
        access: "permission",
      },
      {
        key: "order-templates",
        title: "menu.orderTemplates",
        href: "/order-templates",
        icon: LayoutTemplate,
        access: "permission",
      },
      {
        key: "payments",
        title: "menu.payments",
        href: "/payments",
        icon: CreditCard,
        access: "permission",
      },
    ],
  },
  {
    key: "administration",
    title: "menu.administration",
    items: [
      {
        key: "managers",
        title: "menu.managers",
        href: "/managers",
        icon: Users,
        access: "permission",
      },
      {
        key: "roles",
        title: "menu.roles",
        href: "/roles",
        icon: ShieldCheck,
        access: "permission",
      },
      {
        key: "permissions",
        title: "menu.permissions",
        href: "/permissions",
        icon: KeyRound,
        access: "permission",
      },
      {
        key: "platforms",
        title: "menu.platforms",
        href: "/platforms",
        icon: Building2,
        access: "permission",
      },
      {
        key: "apps",
        title: "menu.apps",
        href: "/apps",
        icon: AppWindow,
        access: "permission",
      },
      {
        key: "smtp-servers",
        title: "menu.smtpServers",
        href: "/smtp-servers",
        icon: Mail,
        access: "permission",
      },
    ],
  },
  // The App API (/api/webhooks/*): docs, guide and a playground per endpoint. Open to every
  // signed-in member (no permission card) — the playground signs with keys the user enters.
  {
    key: "webhooks",
    title: "menu.webhooks",
    items: [
      {
        key: "webhook-user",
        title: "menu.webhookUser",
        href: "/webhooks/user",
        icon: LogIn,
        access: "authenticated",
      },
      {
        key: "webhook-device",
        title: "menu.webhookDevice",
        href: "/webhooks/device",
        icon: Smartphone,
        access: "authenticated",
      },
      {
        key: "webhook-order",
        title: "menu.webhookOrder",
        href: "/webhooks/order",
        icon: ShoppingCart,
        access: "authenticated",
      },
      {
        key: "webhook-verify",
        title: "menu.webhookVerify",
        href: "/webhooks/verify",
        icon: BadgeCheck,
        access: "authenticated",
      },
      {
        key: "webhook-refresh",
        title: "menu.webhookRefresh",
        href: "/webhooks/refresh",
        icon: RefreshCw,
        access: "authenticated",
      },
      {
        key: "webhook-stripe",
        title: "menu.webhookStripe",
        href: "/webhooks/stripe",
        icon: Landmark,
        access: "authenticated",
      },
      {
        key: "webhook-google-play",
        title: "menu.webhookGooglePlay",
        href: "/webhooks/google-play",
        icon: Play,
        access: "authenticated",
      },
    ],
  },
  // Guides to the payment providers, for everyone who works with them (no permission card)
  {
    key: "docs",
    title: "menu.docs",
    items: [
      {
        key: "doc-stripe",
        title: "menu.docStripe",
        href: "/docs/stripe",
        icon: BookOpen,
        access: "authenticated",
      },
      {
        key: "doc-google-play",
        title: "menu.docGooglePlay",
        href: "/docs/google-play",
        icon: BookOpen,
        access: "authenticated",
      },
      {
        key: "doc-app-webhooks",
        title: "menu.docAppWebhooks",
        href: "/docs/app-webhooks",
        icon: BookOpen,
        access: "authenticated",
      },
    ],
  },
];

// Items in the user menu at the bottom of the sidebar (opened by clicking your profile).
// They are about the signed-in user themself, so every user has them (no permission card).
export const userMenuItems: MenuItem[] = [
  {
    key: "profile",
    title: "menu.profile",
    href: "/profile",
    icon: UserRound,
    access: "authenticated",
  },
  {
    key: "settings",
    title: "menu.settings",
    href: "/settings",
    icon: Settings,
    access: "authenticated",
  },
];

// Pages reached from elsewhere (not listed in the side menu).
// "My platform" is opened from the platform switcher; every member can see their own platform.
// "App config" (/apps/config/{id}) is opened from an app on the Apps page.
export const otherPages: MenuItem[] = [
  {
    key: "my-platform",
    title: "menu.myPlatform",
    href: "/my-platform",
    icon: Building,
    access: "authenticated",
  },
  {
    key: "app-config",
    title: "menu.appConfig",
    href: "/apps/config",
    icon: Settings2,
    access: "permission",
  },
];

/** Every page in the app. */
export const allPages: MenuItem[] = [
  ...menuGroups.flatMap((g) => g.items),
  ...userMenuItems,
  ...otherPages,
];

// Fail fast if two pages share a URL — permissions are granted by URL.
const seen = new Set<string>();
for (const page of allPages) {
  if (seen.has(page.href))
    throw new Error(`Duplicate page URL in menu: ${page.href}`);
  seen.add(page.href);
}

/** Pages a role can be granted (the rest are open to everyone or super admin only). */
export const grantablePages = allPages.filter((p) => p.access === "permission");

export function canOpenPage(
  page: MenuItem,
  access: AccessInfo | null | undefined,
) {
  return hasAccess(page.access, access, { page: page.href });
}

/** Menu groups filtered to what the user may open; empty groups are dropped. */
export function menuForAccess(
  access: AccessInfo | null | undefined,
): MenuGroup[] {
  return menuGroups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => canOpenPage(i, access)),
    }))
    .filter((g) => g.items.length > 0);
}

/** The page matching a path (longest href wins). */
export function activeMenuItem(pathname: string): MenuItem | undefined {
  return allPages
    .filter((i) =>
      i.href === "/"
        ? pathname === "/"
        : pathname === i.href || pathname.startsWith(`${i.href}/`),
    )
    .sort((a, b) => b.href.length - a.href.length)[0];
}
