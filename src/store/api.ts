import {
  createApi,
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from "@reduxjs/toolkit/query/react";
import en from "@/i18n/messages/en";
import type {
  OrderStatus,
  PaymentRecordStatus,
  PaymentStatus,
} from "@/lib/commerce";
import type {
  AccessInfo,
  AppConfig,
  AppCredentials,
  AppItem,
  AppUser,
  Action,
  DashboardStats,
  Device,
  Order,
  OrderTemplate,
  OrderTemplateInput,
  PayLink,
  Payment,
  OrderDetail,
  OrderInput,
  ScopeArgs,
  ApiErrorBody,
  Me,
  PermissionCard,
  PermissionCatalog,
  PermissionUrl,
  Platform,
  PlatformOption,
  RoleItem,
  RoleOption,
  SmtpServer,
  SmtpServerInput,
  User,
} from "./types";

/**
 * The platform this tab shows (from /auth/me). Sent with every request so the API can
 * refuse work meant for a platform the session has since switched away from.
 */
let shownPlatformId: string | null = null;

const rawBaseQuery = fetchBaseQuery({
  baseUrl: "/api",
  credentials: "same-origin",
  prepareHeaders: (headers) => {
    if (shownPlatformId) headers.set("x-platform-id", shownPlatformId);
    return headers;
  },
});

// Sends the user back to login when the session is gone, or to the
// change-password screen when a temporary password must be replaced.
const baseQuery: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extra) => {
  const result = await rawBaseQuery(args, api, extra);
  const code = (result.error?.data as ApiErrorBody | undefined)?.error;
  const url = typeof args === "string" ? args : args.url;
  if (typeof window !== "undefined" && !url.startsWith("/auth/login")) {
    if (result.error?.status === 401) window.location.assign("/login");
    if (code === "PASSWORD_CHANGE_REQUIRED")
      window.location.assign("/change-password");
    // the platform was deactivated / removed while signed in: the server ended the session
    if (code === "PLATFORM_INACTIVE" || code === "NO_PLATFORM")
      window.location.assign(`/login?reason=${code}`);
    // switched platform in another tab: show this tab the platform it now works in
    if (code === "PLATFORM_CHANGED")
      window.setTimeout(() => window.location.reload(), 1500);
  }
  return result;
};

const userOf = (res: { user: User }) => res.user;

/** Query string without empty values. */
const clean = (params: object) =>
  Object.fromEntries(
    Object.entries(params).filter(
      ([, v]) => v !== undefined && v !== null && v !== "",
    ),
  );
type Msg = { message: string };

type GrantChange = { permissionId: number; actions: Action[] };

export const api = createApi({
  reducerPath: "api",
  baseQuery,
  tagTypes: [
    "Me",
    "Users",
    "Roles",
    "Permissions",
    "Platforms",
    "Apps",
    "Smtp",
    "AppUsers",
    "Devices",
    "Orders",
    "Payments",
    "OrderTemplates",
  ],
  endpoints: (build) => ({
    // --- own account ---
    me: build.query<Me, void>({
      query: () => "/auth/me",
      transformResponse: (res: {
        user: User;
        access: AccessInfo;
        platforms: PlatformOption[];
      }) => ({
        ...res.user,
        access: res.access,
        platforms: res.platforms,
      }),
      async onQueryStarted(_arg, { queryFulfilled }) {
        const { data } = await queryFulfilled.catch(() => ({ data: null }));
        if (data) shownPlatformId = data.platform_id;
      },
      providesTags: ["Me"],
    }),
    login: build.mutation<User, { username: string; password: string }>({
      query: (body) => ({ url: "/auth/login", method: "POST", body }),
      transformResponse: userOf,
      invalidatesTags: ["Me"],
    }),
    /** Switches the active platform; every cached query is dropped (data is per platform). */
    switchPlatform: build.mutation<void, string>({
      query: (platformId) => ({
        url: "/auth/platform",
        method: "POST",
        body: { platformId },
      }),
      async onQueryStarted(platformId, { dispatch, queryFulfilled }) {
        await queryFulfilled;
        shownPlatformId = platformId;
        dispatch(api.util.resetApiState());
      },
    }),
    logout: build.mutation<void, void>({
      query: () => ({ url: "/auth/logout", method: "POST" }),
    }),
    changePassword: build.mutation<
      User,
      { currentPassword: string; newPassword: string }
    >({
      query: (body) => ({ url: "/auth/change-password", method: "POST", body }),
      transformResponse: userOf,
      invalidatesTags: ["Me"],
    }),
    completeSetup: build.mutation<User, { email: string; newPassword: string }>(
      {
        query: (body) => ({
          url: "/auth/complete-setup",
          method: "POST",
          body,
        }),
        transformResponse: userOf,
        invalidatesTags: ["Me"],
      },
    ),
    updateProfile: build.mutation<User, { fullName: string; email: string }>({
      query: (body) => ({ url: "/auth/profile", method: "PATCH", body }),
      transformResponse: userOf,
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        const { data } = await queryFulfilled;
        dispatch(
          api.util.updateQueryData("me", undefined, (draft) =>
            Object.assign(draft, data),
          ),
        );
      },
    }),

    // --- users (managers) ---
    users: build.query<User[], void>({
      query: () => "/managers",
      transformResponse: (res: { users: User[] }) => res.users,
      providesTags: ["Users"],
    }),
    createManager: build.mutation<
      { user: User; temporaryPassword: string | null; addedExisting: boolean },
      { username: string; roleId: number; platformId?: string }
    >({
      query: (body) => ({ url: "/managers", method: "POST", body }),
      invalidatesTags: ["Users", "Roles"],
    }),
    updateUserRole: build.mutation<User, { id: number; roleId: number }>({
      query: ({ id, roleId }) => ({
        url: `/managers/${id}/role`,
        method: "PATCH",
        body: { roleId },
      }),
      transformResponse: userOf,
      invalidatesTags: ["Users", "Roles"],
    }),
    resetManagerPassword: build.mutation<
      { user: User; temporaryPassword: string },
      { id: number; password?: string }
    >({
      query: ({ id, password }) => ({
        url: `/managers/${id}/reset-password`,
        method: "POST",
        body: { password },
      }),
      invalidatesTags: ["Users"],
    }),
    setManagerStatus: build.mutation<
      { user: User; message: string },
      { id: number; isActive: boolean }
    >({
      query: ({ id, isActive }) => ({
        url: `/managers/${id}/status`,
        method: "PATCH",
        body: { isActive },
      }),
      invalidatesTags: ["Users"],
    }),
    deleteManager: build.mutation<void, number>({
      query: (id) => ({ url: `/managers/${id}`, method: "DELETE" }),
      invalidatesTags: ["Users", "Roles"],
    }),

    // --- roles ---
    roleOptions: build.query<RoleOption[], string | undefined>({
      query: (platformId) =>
        platformId
          ? `/roles/options?platformId=${platformId}`
          : "/roles/options",
      transformResponse: (res: { roles: RoleOption[] }) => res.roles,
      providesTags: ["Roles"],
    }),
    roles: build.query<RoleItem[], void>({
      query: () => "/roles",
      transformResponse: (res: { roles: RoleItem[] }) => res.roles,
      providesTags: ["Roles"],
    }),
    /** Create sends all `grants`; update sends only the changes (`add` / `remove`). */
    saveRole: build.mutation<
      RoleItem,
      | { id?: undefined; name: string; grants: GrantChange[] }
      | { id: number; name: string; add: GrantChange[]; remove: GrantChange[] }
    >({
      query: ({ id, ...body }) => ({
        url: id ? `/roles/${id}` : "/roles",
        method: id ? "PUT" : "POST",
        body,
      }),
      transformResponse: (res: { role: RoleItem }) => res.role,
      invalidatesTags: ["Roles", "Permissions", "Users", "Me"],
    }),
    // status changes return the item plus a `message` from the backend, shown as is
    setRoleStatus: build.mutation<
      { role: RoleItem; message: string },
      { id: number; isActive: boolean }
    >({
      query: ({ id, isActive }) => ({
        url: `/roles/${id}/status`,
        method: "PATCH",
        body: { isActive },
      }),
      invalidatesTags: ["Roles", "Me"],
    }),
    deleteRole: build.mutation<void, number>({
      query: (id) => ({ url: `/roles/${id}`, method: "DELETE" }),
      invalidatesTags: ["Roles", "Permissions"],
    }),

    // --- permission cards ---
    permissionCatalog: build.query<PermissionCatalog, void>({
      query: () => "/permissions/catalog",
    }),
    permissions: build.query<PermissionCard[], void>({
      query: () => "/permissions",
      transformResponse: (res: { permissions: PermissionCard[] }) =>
        res.permissions,
      providesTags: ["Permissions"],
    }),
    savePermission: build.mutation<
      PermissionCard,
      {
        id?: number;
        key?: string;
        name: string;
        parentId: number | null;
        urls: PermissionUrl[];
      }
    >({
      query: ({ id, ...body }) => ({
        url: id ? `/permissions/${id}` : "/permissions",
        method: id ? "PUT" : "POST",
        body,
      }),
      transformResponse: (res: { permission: PermissionCard }) =>
        res.permission,
      invalidatesTags: ["Permissions", "Roles", "Me"],
    }),
    deletePermission: build.mutation<void, number>({
      query: (id) => ({ url: `/permissions/${id}`, method: "DELETE" }),
      invalidatesTags: ["Permissions", "Roles", "Me"],
    }),

    // --- platforms ---
    platforms: build.query<Platform[], void>({
      query: () => "/platforms",
      transformResponse: (res: { platforms: Platform[] }) => res.platforms,
      providesTags: ["Platforms"],
    }),
    /** Creating also returns the platform's first account (shown once in an invite). */
    currentPlatform: build.query<
      {
        platform: Platform;
        role: { id: number | null; key: string | null; name: string | null };
        platformCount: number;
      },
      void
    >({
      query: () => "/platforms/current",
      providesTags: ["Platforms"],
    }),
    /** Renames the platform you're working in (needs the "Own platform update" card). */
    renameOwnPlatform: build.mutation<
      { platform: Platform; message: string },
      string
    >({
      query: (name) => ({
        url: "/platforms/current",
        method: "PUT",
        body: { name },
      }),
      invalidatesTags: ["Platforms", "Me"],
    }),
    savePlatform: build.mutation<
      {
        platform: Platform;
        account?: { username: string; temporaryPassword: string };
      },
      { id?: string; name: string }
    >({
      query: ({ id, name }) => ({
        url: id ? `/platforms/${id}` : "/platforms",
        method: id ? "PUT" : "POST",
        body: { name },
      }),
      invalidatesTags: ["Platforms", "Me"],
    }),
    setPlatformStatus: build.mutation<
      { platform: Platform; message: string },
      { id: string; isActive: boolean }
    >({
      query: ({ id, isActive }) => ({
        url: `/platforms/${id}/status`,
        method: "PATCH",
        body: { isActive },
      }),
      invalidatesTags: ["Platforms", "Me"],
    }),
    deletePlatform: build.mutation<void, string>({
      query: (id) => ({ url: `/platforms/${id}`, method: "DELETE" }),
      invalidatesTags: ["Platforms", "Me", "Users", "Roles"],
    }),

    // --- apps (active platform) ---
    apps: build.query<AppItem[], void>({
      query: () => "/apps",
      transformResponse: (res: { apps: AppItem[] }) => res.apps,
      providesTags: ["Apps"],
    }),
    saveApp: build.mutation<
      // credentials: only when created (the full key and secret)
      { app: AppItem; credentials?: AppCredentials; message: string },
      { id?: number; name: string; kind: AppItem["kind"]; identifier: string }
    >({
      query: ({ id, ...body }) => ({
        url: id ? `/apps/${id}` : "/apps",
        method: id ? "PUT" : "POST",
        body,
      }),
      invalidatesTags: ["Apps"],
    }),
    // fetched each time it's opened, never kept around
    appCredentials: build.query<
      { app: Pick<AppItem, "id" | "name">; credentials: AppCredentials },
      number
    >({
      query: (id) => `/apps/${id}/credentials`,
      keepUnusedDataFor: 0,
    }),
    appConfig: build.query<AppConfig, number>({
      query: (id) => `/apps/${id}/config`,
      providesTags: (_r, _e, id) => [{ type: "Apps", id: `config-${id}` }],
    }),
    saveAppConfig: build.mutation<
      AppConfig & { message: string },
      {
        id: number;
        webhooks: AppConfig["webhooks"];
        redirects: AppConfig["redirects"];
      }
    >({
      query: ({ id, ...body }) => ({
        url: `/apps/${id}/config`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "Apps", id: `config-${id}` },
      ],
    }),
    deleteApp: build.mutation<void, number>({
      query: (id) => ({ url: `/apps/${id}`, method: "DELETE" }),
      invalidatesTags: ["Apps"],
    }),

    // --- an app's users (customers) ---
    appUsers: build.query<AppUser[], ScopeArgs & { search?: string }>({
      query: (args) => ({ url: "/users", params: clean(args) }),
      transformResponse: (res: { users: AppUser[] }) => res.users,
      providesTags: ["AppUsers"],
    }),
    saveAppUser: build.mutation<
      Msg & { user?: AppUser },
      ScopeArgs & {
        id?: number;
        name: string;
        email: string;
        phone: { country: string; number: string } | null;
        /** only when creating — changed later with setAppUserMaxDevices */
        maxDevices?: number;
        maxPendingOrders?: number;
      }
    >({
      query: ({ id, appId, ...body }) =>
        id
          ? { url: `/users/${id}`, method: "PUT", body }
          : { url: "/users", method: "POST", body: { ...body, appId } },
      invalidatesTags: ["AppUsers"],
    }),
    setAppUserStatus: build.mutation<Msg, { id: number; isActive: boolean }>({
      query: ({ id, isActive }) => ({
        url: `/users/${id}/status`,
        method: "PATCH",
        body: { isActive },
      }),
      invalidatesTags: ["AppUsers"],
    }),
    setAppUserMaxDevices: build.mutation<
      Msg,
      { id: number; maxDevices: number }
    >({
      query: ({ id, maxDevices }) => ({
        url: `/users/${id}/max-devices`,
        method: "PATCH",
        body: { maxDevices },
      }),
      invalidatesTags: ["AppUsers"],
    }),
    setAppUserMaxPendingOrders: build.mutation<Msg, { id: number; maxPendingOrders: number }>({
      query: ({ id, maxPendingOrders }) => ({
        url: `/users/${id}/max-pending-orders`,
        method: "PATCH",
        body: { maxPendingOrders },
      }),
      invalidatesTags: ["AppUsers"],
    }),
    deleteAppUser: build.mutation<void, { id: number }>({
      query: ({ id }) => ({ url: `/users/${id}`, method: "DELETE" }),
      invalidatesTags: ["AppUsers", "Devices"],
    }),

    // --- devices ---
    devices: build.query<Device[], ScopeArgs & { appUserId?: number }>({
      query: (args) => ({ url: "/devices", params: clean(args) }),
      transformResponse: (res: { devices: Device[] }) => res.devices,
      providesTags: ["Devices"],
    }),
    saveDevice: build.mutation<
      Msg,
      ScopeArgs & {
        id?: number;
        appUserId: number | null;
        deviceUid: string;
        fingerprint: string;
        os: Device["os"];
        model: string;
      }
    >({
      query: ({ id, appId, ...body }) =>
        id
          ? { url: `/devices/${id}`, method: "PUT", body }
          : { url: "/devices", method: "POST", body: { ...body, appId } },
      invalidatesTags: ["Devices", "AppUsers"],
    }),
    setDeviceStatus: build.mutation<Msg, { id: number; isActive: boolean }>({
      query: ({ id, isActive }) => ({
        url: `/devices/${id}/status`,
        method: "PATCH",
        body: { isActive },
      }),
      invalidatesTags: ["Devices", "AppUsers"],
    }),
    deleteDevice: build.mutation<void, { id: number }>({
      query: ({ id }) => ({ url: `/devices/${id}`, method: "DELETE" }),
      invalidatesTags: ["Devices", "AppUsers"],
    }),

    // --- orders ---
    orders: build.query<
      Order[],
      ScopeArgs & {
        appUserId?: number;
        payment?: PaymentStatus;
        status?: OrderStatus;
      }
    >({
      query: (args) => ({ url: "/orders", params: clean(args) }),
      transformResponse: (res: { orders: Order[] }) => res.orders,
      providesTags: ["Orders"],
    }),
    order: build.query<OrderDetail, { id: number }>({
      query: ({ id }) => ({ url: `/orders/${id}` }),
      transformResponse: (res: { order: OrderDetail }) => res.order,
      providesTags: ["Orders"],
    }),
    orderTemplates: build.query<OrderTemplate[], ScopeArgs & { active?: "true" | "false" }>({
      query: (args) => ({ url: "/order-templates", params: clean(args) }),
      transformResponse: (res: { templates: OrderTemplate[] }) => res.templates,
      providesTags: ["OrderTemplates"],
    }),
    saveOrderTemplate: build.mutation<Msg, OrderTemplateInput & ScopeArgs & { id?: number }>({
      query: ({ id, appId, ...body }) =>
        id
          ? { url: `/order-templates/${id}`, method: "PUT", body }
          : { url: "/order-templates", method: "POST", body: { ...body, appId } },
      invalidatesTags: ["OrderTemplates"],
    }),
    setOrderTemplateStatus: build.mutation<Msg, { id: number; isActive: boolean }>({
      query: ({ id, isActive }) => ({ url: `/order-templates/${id}/status`, method: "PATCH", body: { isActive } }),
      invalidatesTags: ["OrderTemplates"],
    }),
    deleteOrderTemplate: build.mutation<void, { id: number }>({
      query: ({ id }) => ({ url: `/order-templates/${id}`, method: "DELETE" }),
      invalidatesTags: ["OrderTemplates"],
    }),
    createOrder: build.mutation<
      Msg & {
        order: { id: number; order_number: string };
        /** the Stripe payment link, when the platform has connected Stripe */
        checkout: PayLink | null;
        /** why no link was made (the order was still created) */
        checkoutError: string | null;
      },
      OrderInput
    >({
      query: (body) => ({ url: "/orders", method: "POST", body }),
      invalidatesTags: ["Orders", "AppUsers", "OrderTemplates"],
    }),
    createPayLink: build.mutation<Msg & PayLink, { id: number }>({
      query: ({ id }) => ({ url: `/orders/${id}/checkout`, method: "POST" }),
      invalidatesTags: ["Orders"],
    }),
    setOrderPayment: build.mutation<Msg, { id: number; status: PaymentStatus }>(
      {
        query: ({ id, status }) => ({
          url: `/orders/${id}/payment-status`,
          method: "PATCH",
          body: { status },
        }),
        invalidatesTags: ["Orders"],
      },
    ),
    setOrderStatus: build.mutation<Msg, { id: number; status: OrderStatus }>({
      query: ({ id, status }) => ({
        url: `/orders/${id}/order-status`,
        method: "PATCH",
        body: { status },
      }),
      invalidatesTags: ["Orders"],
    }),
    renewOrder: build.mutation<Msg, { id: number }>({
      query: ({ id }) => ({ url: `/orders/${id}/renew`, method: "POST" }),
      invalidatesTags: ["Orders"],
    }),
    deleteOrder: build.mutation<void, { id: number }>({
      query: ({ id }) => ({ url: `/orders/${id}`, method: "DELETE" }),
      invalidatesTags: ["Orders", "AppUsers"],
    }),

    // --- payments (Stripe) ---
    payments: build.query<
      Payment[],
      ScopeArgs & {
        orderId?: number;
        status?: PaymentRecordStatus;
        search?: string;
      }
    >({
      query: (args) => ({ url: "/payments", params: clean(args) }),
      transformResponse: (res: { payments: Payment[] }) => res.payments,
      providesTags: ["Payments", "Orders"],
    }),

    // --- dashboard ---
    dashboardStats: build.query<
      DashboardStats,
      ScopeArgs & { currency?: string; range?: string }
    >({
      query: (args) => ({ url: "/dashboard/stats", params: clean(args) }),
      transformResponse: (res: { stats: DashboardStats }) => res.stats,
      providesTags: ["Orders", "Payments", "Devices", "AppUsers", "Apps"],
    }),

    // --- SMTP servers ---
    smtpServers: build.query<SmtpServer[], void>({
      query: () => "/smtp-servers",
      transformResponse: (res: { servers: SmtpServer[] }) => res.servers,
      providesTags: ["Smtp"],
    }),
    saveSmtpServer: build.mutation<
      SmtpServer,
      SmtpServerInput & { id?: number }
    >({
      query: ({ id, ...body }) => ({
        url: id ? `/smtp-servers/${id}` : "/smtp-servers",
        method: id ? "PUT" : "POST",
        body,
      }),
      transformResponse: (res: { server: SmtpServer }) => res.server,
      invalidatesTags: ["Smtp"],
    }),
    setSmtpStatus: build.mutation<
      { server: SmtpServer; message: string },
      { id: number; isActive: boolean }
    >({
      query: ({ id, isActive }) => ({
        url: `/smtp-servers/${id}/status`,
        method: "PATCH",
        body: { isActive },
      }),
      invalidatesTags: ["Smtp"],
    }),
    deleteSmtpServer: build.mutation<void, number>({
      query: (id) => ({ url: `/smtp-servers/${id}`, method: "DELETE" }),
      invalidatesTags: ["Smtp"],
    }),
    testSmtpServer: build.mutation<
      { ok: boolean; sent: boolean },
      { id: number; to?: string }
    >({
      query: ({ id, to }) => ({
        url: `/smtp-servers/${id}/test`,
        method: "POST",
        body: { to },
      }),
    }),
  }),
});

export const {
  useMeQuery,
  useLoginMutation,
  useLogoutMutation,
  useSwitchPlatformMutation,
  useChangePasswordMutation,
  useCompleteSetupMutation,
  useUpdateProfileMutation,
  useUsersQuery,
  useCreateManagerMutation,
  useUpdateUserRoleMutation,
  useResetManagerPasswordMutation,
  useSetManagerStatusMutation,
  useDeleteManagerMutation,
  useRoleOptionsQuery,
  useRolesQuery,
  useSaveRoleMutation,
  useDeleteRoleMutation,
  useSetRoleStatusMutation,
  usePermissionCatalogQuery,
  usePermissionsQuery,
  useSavePermissionMutation,
  useDeletePermissionMutation,
  usePlatformsQuery,
  useCurrentPlatformQuery,
  useRenameOwnPlatformMutation,
  useSavePlatformMutation,
  useDeletePlatformMutation,
  useSetPlatformStatusMutation,
  useAppsQuery,
  useAppUsersQuery,
  useSaveAppUserMutation,
  useSetAppUserMaxDevicesMutation,
  useSetAppUserMaxPendingOrdersMutation,
  useSetAppUserStatusMutation,
  useDeleteAppUserMutation,
  useDevicesQuery,
  useSaveDeviceMutation,
  useSetDeviceStatusMutation,
  useDeleteDeviceMutation,
  useOrdersQuery,
  useOrderQuery,
  useCreateOrderMutation,
  useSetOrderPaymentMutation,
  useSetOrderStatusMutation,
  useRenewOrderMutation,
  useDeleteOrderMutation,
  useCreatePayLinkMutation,
  useOrderTemplatesQuery,
  useSaveOrderTemplateMutation,
  useSetOrderTemplateStatusMutation,
  useDeleteOrderTemplateMutation,
  usePaymentsQuery,
  useDashboardStatsQuery,
  useSaveAppMutation,
  useAppCredentialsQuery,
  useLazyAppCredentialsQuery,
  useAppConfigQuery,
  useSaveAppConfigMutation,
  useDeleteAppMutation,
  useSmtpServersQuery,
  useSaveSmtpServerMutation,
  useDeleteSmtpServerMutation,
  useSetSmtpStatusMutation,
  useTestSmtpServerMutation,
} = api;

type ErrorCode = keyof typeof en.errors;

/**
 * Extracts the API error code (e.g. "INVALID_CREDENTIALS") from an RTK Query error.
 * Unknown codes fall back to INTERNAL_ERROR so the UI never shows an untranslated key.
 */
export function errorCode(error: unknown): ErrorCode {
  if (error && typeof error === "object" && "status" in error) {
    const e = error as FetchBaseQueryError;
    if (e.status === "FETCH_ERROR") return "NETWORK";
    const code = (e.data as ApiErrorBody | undefined)?.error;
    if (code && code in en.errors) return code as ErrorCode;
  }
  return "INTERNAL_ERROR";
}

/** The API's technical detail for an error (e.g. the SMTP server's reply), if any. */
export function errorDetails(error: unknown): string | null {
  const details = (error as { data?: ApiErrorBody } | undefined)?.data?.details;
  return typeof details === "string" ? details : null;
}
