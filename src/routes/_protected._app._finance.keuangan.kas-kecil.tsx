import { createFileRoute } from "@tanstack/react-router";
import KasKecil from "@/pages/keuangan/KasKecil";

export const Route = createFileRoute("/_protected/_app/_finance/keuangan/kas-kecil")({
  component: KasKecil,
});
