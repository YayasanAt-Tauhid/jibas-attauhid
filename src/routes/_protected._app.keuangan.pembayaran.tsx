import { createFileRoute } from "@tanstack/react-router";
import InputPembayaran from "@/pages/keuangan/InputPembayaran";

export const Route = createFileRoute("/_protected/_app/keuangan/pembayaran")({
  component: InputPembayaran,
});
