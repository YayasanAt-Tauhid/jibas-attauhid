import { createFileRoute } from "@tanstack/react-router";
import LaporanKomprehensif from "@/pages/keuangan/LaporanKomprehensif";

export const Route = createFileRoute("/_protected/_app/_finance/keuangan/isak35/komprehensif")({
  component: LaporanKomprehensif,
});
