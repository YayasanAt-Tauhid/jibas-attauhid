import { createFileRoute } from "@tanstack/react-router";
import TunggakanPembayaran from "@/pages/keuangan/TunggakanPembayaran";

export const Route = createFileRoute("/_protected/_app/keuangan/tunggakan")({
  component: TunggakanPembayaran,
});
