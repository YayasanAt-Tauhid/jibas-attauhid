import { createFileRoute } from "@tanstack/react-router";
import ManajemenPengguna from "@/pages/pengaturan/ManajemenPengguna";

export const Route = createFileRoute("/_protected/_app/pengaturan/pengguna")({
  component: ManajemenPengguna,
});
