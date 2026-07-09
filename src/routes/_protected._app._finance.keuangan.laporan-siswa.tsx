import { createFileRoute } from "@tanstack/react-router";
import LaporanBayarSiswa from "@/pages/keuangan/LaporanBayarSiswa";

export const Route = createFileRoute("/_protected/_app/_finance/keuangan/laporan-siswa")({
  component: LaporanBayarSiswa,
});
