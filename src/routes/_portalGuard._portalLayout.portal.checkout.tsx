import { createFileRoute } from "@tanstack/react-router";
import PortalCheckout from "@/pages/portal/PortalCheckout";

export const Route = createFileRoute("/_portalGuard/_portalLayout/portal/checkout")({
  component: PortalCheckout,
});
