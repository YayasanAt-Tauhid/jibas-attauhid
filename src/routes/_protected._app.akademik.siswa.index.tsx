import { createFileRoute } from "@tanstack/react-router";
import DaftarSiswa from "@/pages/akademik/DaftarSiswa";

export const Route = createFileRoute("/_protected/_app/akademik/siswa/")({
  component: DaftarSiswa,
});
