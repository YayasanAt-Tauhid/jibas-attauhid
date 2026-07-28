import { createFileRoute } from "@tanstack/react-router";
import DiskonSiswa from "@/pages/keuangan/DiskonSiswa";

export const Route = createFileRoute("/_protected/_app/keuangan/diskon-siswa")({
  component: DiskonSiswa,
});
