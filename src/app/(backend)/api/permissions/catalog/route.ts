import { endpoints, grantableEndpointIds } from "@/server/api/endpoints";
import { route } from "@/server/api/route";
import { json } from "@/server/http";
import { grantablePages, menuGroups } from "@/utils/menu";

// pages in an untitled group (or outside the menu) are listed under "Main"
const groupOf = (href: string) =>
  menuGroups.find((g) => g.items.some((i) => i.href === href))?.title ??
  "menu.main";

/** Everything a permission card can grant: pages from the menu, endpoints from the API catalog. */
export const GET = route("permissions.catalog", async () => {
  return json({
    pages: grantablePages.map((p) => ({
      path: p.href,
      title: p.title,
      group: groupOf(p.href),
    })),
    endpoints: grantableEndpointIds.map((id) => {
      const def = endpoints[id];
      return {
        id,
        method: def.method,
        path: def.path,
        summary: def.summary,
        tag: def.tag,
      };
    }),
  });
});
