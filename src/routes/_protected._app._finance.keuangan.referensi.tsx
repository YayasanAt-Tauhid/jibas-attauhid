import { createFileRoute } from "@tanstack/react-router";
import ReferensiKeuangan from "@/pages/keuangan/ReferensiKeuangan";

export const Route = createFileRoute("/_protected/_app/_finance/keuangan/referensi")({
  component: ReferensiKeuangan,
});
