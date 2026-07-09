import { createFileRoute } from "@tanstack/react-router";
import PortalDashboard from "@/pages/portal/PortalDashboard";

export const Route = createFileRoute("/_portalGuard/_portalLayout/portal/")({
  component: PortalDashboard,
});
