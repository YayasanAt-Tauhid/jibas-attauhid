import { createFileRoute } from "@tanstack/react-router";
import PengakuanPendapatan from "@/pages/keuangan/PengakuanPendapatan";

export const Route = createFileRoute("/_protected/_app/_finance/keuangan/pengakuan-pendapatan")({
  component: PengakuanPendapatan,
});
