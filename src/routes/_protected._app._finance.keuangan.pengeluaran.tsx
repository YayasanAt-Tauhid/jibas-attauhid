import { createFileRoute } from "@tanstack/react-router";
import InputPengeluaran from "@/pages/keuangan/InputPengeluaran";

export const Route = createFileRoute("/_protected/_app/_finance/keuangan/pengeluaran")({
  component: InputPengeluaran,
});
