import { createFileRoute } from "@tanstack/react-router";
import LaporanPosisiKeuangan from "@/pages/keuangan/LaporanPosisiKeuangan";

export const Route = createFileRoute("/_protected/_app/_finance/keuangan/isak35/posisi-keuangan")({
  component: LaporanPosisiKeuangan,
});
