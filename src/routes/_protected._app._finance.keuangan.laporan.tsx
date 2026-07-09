import { createFileRoute } from "@tanstack/react-router";
import LaporanKeuangan from "@/pages/keuangan/LaporanKeuangan";

export const Route = createFileRoute("/_protected/_app/_finance/keuangan/laporan")({
  component: LaporanKeuangan,
});
