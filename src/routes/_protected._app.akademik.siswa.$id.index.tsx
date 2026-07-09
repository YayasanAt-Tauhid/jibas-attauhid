import { createFileRoute } from "@tanstack/react-router";
import DetailSiswa from "@/pages/akademik/DetailSiswa";

export const Route = createFileRoute("/_protected/_app/akademik/siswa/$id/")({
  component: DetailSiswa,
});
