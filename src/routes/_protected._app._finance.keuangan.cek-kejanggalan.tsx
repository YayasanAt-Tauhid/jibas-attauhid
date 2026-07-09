import { createFileRoute } from "@tanstack/react-router";
import CekKejanggalan from "@/pages/keuangan/CekKejanggalan";

export const Route = createFileRoute("/_protected/_app/_finance/keuangan/cek-kejanggalan")({
  component: CekKejanggalan,
});
