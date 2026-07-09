import { createFileRoute } from "@tanstack/react-router";
import FormSiswa from "@/pages/akademik/FormSiswa";

export const Route = createFileRoute("/_protected/_app/akademik/siswa/tambah")({
  component: FormSiswa,
});
