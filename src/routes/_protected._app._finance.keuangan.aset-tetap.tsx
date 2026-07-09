import { createFileRoute } from "@tanstack/react-router";
import AsetTetap from "@/pages/keuangan/AsetTetap";

export const Route = createFileRoute("/_protected/_app/_finance/keuangan/aset-tetap")({
  component: AsetTetap,
});
