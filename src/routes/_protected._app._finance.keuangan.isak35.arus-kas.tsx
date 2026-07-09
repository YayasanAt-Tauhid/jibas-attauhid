import { createFileRoute } from "@tanstack/react-router";
import LaporanArusKasISAK35 from "@/pages/keuangan/LaporanArusKasISAK35";

export const Route = createFileRoute("/_protected/_app/_finance/keuangan/isak35/arus-kas")({
  component: LaporanArusKasISAK35,
});
