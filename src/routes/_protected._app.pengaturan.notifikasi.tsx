import { createFileRoute } from "@tanstack/react-router";
import NotifikasiGateway from "@/pages/pengaturan/NotifikasiGateway";

export const Route = createFileRoute("/_protected/_app/pengaturan/notifikasi")({
  component: NotifikasiGateway,
});
