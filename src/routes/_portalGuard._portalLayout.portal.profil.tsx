import { createFileRoute } from "@tanstack/react-router";
import PortalProfil from "@/pages/portal/PortalProfil";

export const Route = createFileRoute("/_portalGuard/_portalLayout/portal/profil")({
  component: PortalProfil,
});
