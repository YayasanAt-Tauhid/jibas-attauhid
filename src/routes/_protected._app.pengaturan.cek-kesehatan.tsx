import { createFileRoute } from "@tanstack/react-router";
import CekKesehatan from "@/pages/pengaturan/CekKesehatan";

export const Route = createFileRoute("/_protected/_app/pengaturan/cek-kesehatan")({
  component: CekKesehatan,
});
