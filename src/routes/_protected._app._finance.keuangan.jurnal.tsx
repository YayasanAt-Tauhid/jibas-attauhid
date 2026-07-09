import { createFileRoute } from "@tanstack/react-router";
import JurnalUmum from "@/pages/keuangan/JurnalUmum";

export const Route = createFileRoute("/_protected/_app/_finance/keuangan/jurnal")({
  component: JurnalUmum,
});
