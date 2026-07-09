import { createFileRoute } from "@tanstack/react-router";
import LaporanPengeluaran from "@/pages/keuangan/LaporanPengeluaran";

export const Route = createFileRoute("/_protected/_app/_finance/keuangan/laporan-pengeluaran")({
  component: LaporanPengeluaran,
});
