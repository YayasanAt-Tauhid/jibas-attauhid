import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { TopNavbar } from "./TopNavbar";
import { Outlet } from "@/lib/router-compat";

export function AppLayout() {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full print:block print:min-h-0">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0 print:block">
          <TopNavbar />
          <main className="flex-1 p-4 md:p-6 overflow-auto print:overflow-visible print:h-auto print:p-0">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
