import { createFileRoute } from "@tanstack/react-router";
import PresensiSiswa from "@/pages/akademik/PresensiSiswa";

export const Route = createFileRoute("/_protected/_app/akademik/presensi")({
  component: PresensiSiswa,
});
