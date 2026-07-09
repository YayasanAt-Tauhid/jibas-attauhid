import { createFileRoute } from "@tanstack/react-router";
import PortalLayout from "@/components/layout/PortalLayout";

export const Route = createFileRoute("/_portalGuard/_portalLayout")({
  component: PortalLayout,
});
