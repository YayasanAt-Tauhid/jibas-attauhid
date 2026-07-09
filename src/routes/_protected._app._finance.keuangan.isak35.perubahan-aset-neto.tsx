import { createFileRoute } from "@tanstack/react-router";
import LaporanPerubahanAsetNeto from "@/pages/keuangan/LaporanPerubahanAsetNeto";

export const Route = createFileRoute("/_protected/_app/_finance/keuangan/isak35/perubahan-aset-neto")({
  component: LaporanPerubahanAsetNeto,
});
