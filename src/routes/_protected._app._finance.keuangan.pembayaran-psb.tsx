import { createFileRoute } from "@tanstack/react-router";
import PembayaranPSB from "@/pages/keuangan/PembayaranPSB";

export const Route = createFileRoute("/_protected/_app/_finance/keuangan/pembayaran-psb")({
  component: PembayaranPSB,
});
