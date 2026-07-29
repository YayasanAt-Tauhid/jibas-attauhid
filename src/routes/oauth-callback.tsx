import { createFileRoute } from "@tanstack/react-router";
import OAuthCallback from "@/pages/OAuthCallback";

export const Route = createFileRoute("/oauth-callback")({
  component: OAuthCallback,
});
