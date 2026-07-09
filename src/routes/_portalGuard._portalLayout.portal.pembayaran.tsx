import { createFileRoute } from "@tanstack/react-router";
import PortalRiwayat from "@/pages/portal/PortalRiwayat";

export const Route = createFileRoute("/_portalGuard/_portalLayout/portal/pembayaran")({
  component: PortalRiwayat,
});
