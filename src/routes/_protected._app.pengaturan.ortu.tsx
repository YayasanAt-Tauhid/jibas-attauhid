import { createFileRoute } from "@tanstack/react-router";
import ManajemenOrtu from "@/pages/pengaturan/ManajemenOrtu";

export const Route = createFileRoute("/_protected/_app/pengaturan/ortu")({
  component: ManajemenOrtu,
});
