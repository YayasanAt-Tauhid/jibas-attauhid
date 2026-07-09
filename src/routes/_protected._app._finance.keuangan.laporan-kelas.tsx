import { createFileRoute } from "@tanstack/react-router";
import LaporanBayarKelas from "@/pages/keuangan/LaporanBayarKelas";

export const Route = createFileRoute("/_protected/_app/_finance/keuangan/laporan-kelas")({
  component: LaporanBayarKelas,
});
