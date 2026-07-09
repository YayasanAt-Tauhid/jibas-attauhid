import { createFileRoute } from "@tanstack/react-router";
import PortalNilai from "@/pages/portal/PortalNilai";

export const Route = createFileRoute("/_portalGuard/_portalLayout/portal/nilai")({
  component: PortalNilai,
});
