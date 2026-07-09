import { createFileRoute } from "@tanstack/react-router";
import BukuBesar from "@/pages/keuangan/BukuBesar";

export const Route = createFileRoute("/_protected/_app/_finance/keuangan/buku-besar")({
  component: BukuBesar,
});
