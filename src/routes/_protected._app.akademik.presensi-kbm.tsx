import { createFileRoute } from "@tanstack/react-router";
import PresensiKBM from "@/pages/akademik/PresensiKBM";

export const Route = createFileRoute("/_protected/_app/akademik/presensi-kbm")({
  component: PresensiKBM,
});
