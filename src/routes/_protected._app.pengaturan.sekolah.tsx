import { createFileRoute } from "@tanstack/react-router";
import ProfilYayasan from "@/pages/pengaturan/ProfilYayasan";

export const Route = createFileRoute("/_protected/_app/pengaturan/sekolah")({
  component: ProfilYayasan,
});
