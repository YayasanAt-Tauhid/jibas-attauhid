import { createFileRoute } from "@tanstack/react-router";
import PortalPresensi from "@/pages/portal/PortalPresensi";

export const Route = createFileRoute("/_portalGuard/_portalLayout/portal/presensi")({
  component: PortalPresensi,
});
