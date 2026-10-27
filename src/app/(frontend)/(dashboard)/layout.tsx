import { cookies } from "next/headers";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/app/app-header";
import { AccessGuard } from "@/components/app/access-guard";
import { AppSidebar } from "@/components/app/app-sidebar";
import { Copyright } from "@/components/app/copyright";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // shadcn's sidebar persists its open/collapsed state in this cookie.
  const defaultOpen = (await cookies()).get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        <div className="flex-1 p-4 md:p-6">
          <AccessGuard>{children}</AccessGuard>
        </div>
        <footer className="border-t px-4 py-3 md:px-6">
          <Copyright />
        </footer>
      </SidebarInset>
    </SidebarProvider>
  );
}
