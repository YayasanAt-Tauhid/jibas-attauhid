import { createFileRoute } from "@tanstack/react-router";
import ProtectedPortalRoute from "@/components/auth/ProtectedPortalRoute";

export const Route = createFileRoute("/_portalGuard")({
  component: ProtectedPortalRoute,
});
