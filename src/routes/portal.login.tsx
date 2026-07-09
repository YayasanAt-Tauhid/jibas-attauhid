import { createFileRoute } from "@tanstack/react-router";
import PortalLogin from "@/pages/portal/PortalLogin";

export const Route = createFileRoute("/portal/login")({
  component: PortalLogin,
});
