import { createFileRoute } from "@tanstack/react-router";
import PortalOAuthCallback from "@/pages/portal/PortalOAuthCallback";

export const Route = createFileRoute("/portal/oauth-callback")({
  component: PortalOAuthCallback,
});
