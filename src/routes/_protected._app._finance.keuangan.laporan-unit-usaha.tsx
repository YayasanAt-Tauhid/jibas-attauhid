import { createFileRoute } from "@tanstack/react-router";
import LaporanUnitUsaha from "@/pages/keuangan/LaporanUnitUsaha";

export const Route = createFileRoute("/_protected/_app/_finance/keuangan/laporan-unit-usaha")({
  component: LaporanUnitUsaha,
});
