import { createFileRoute } from "@tanstack/react-router";
import PortalTagihan from "@/pages/portal/PortalTagihan";

export const Route = createFileRoute("/_portalGuard/_portalLayout/portal/tagihan")({
  component: PortalTagihan,
});
