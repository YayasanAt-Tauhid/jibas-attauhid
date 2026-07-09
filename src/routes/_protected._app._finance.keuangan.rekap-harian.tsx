import { createFileRoute } from "@tanstack/react-router";
import RekapHarian from "@/pages/keuangan/RekapHarian";

export const Route = createFileRoute("/_protected/_app/_finance/keuangan/rekap-harian")({
  component: RekapHarian,
});
