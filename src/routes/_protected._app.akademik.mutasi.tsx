import { createFileRoute } from "@tanstack/react-router";
import MutasiSiswa from "@/pages/akademik/MutasiSiswa";

export const Route = createFileRoute("/_protected/_app/akademik/mutasi")({
  component: MutasiSiswa,
});
