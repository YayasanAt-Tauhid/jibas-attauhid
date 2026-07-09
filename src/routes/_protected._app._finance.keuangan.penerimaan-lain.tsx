import { createFileRoute } from "@tanstack/react-router";
import LaporanPenerimaanLain from "@/pages/keuangan/LaporanPenerimaanLain";

export const Route = createFileRoute("/_protected/_app/_finance/keuangan/penerimaan-lain")({
  component: LaporanPenerimaanLain,
});
