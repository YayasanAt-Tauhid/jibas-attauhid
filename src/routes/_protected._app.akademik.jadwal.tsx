import { createFileRoute } from "@tanstack/react-router";
import JadwalPelajaran from "@/pages/akademik/JadwalPelajaran";

export const Route = createFileRoute("/_protected/_app/akademik/jadwal")({
  component: JadwalPelajaran,
});
