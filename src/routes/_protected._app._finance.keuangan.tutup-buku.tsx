import { createFileRoute } from "@tanstack/react-router";
import TutupBuku from "@/pages/keuangan/TutupBuku";

export const Route = createFileRoute("/_protected/_app/_finance/keuangan/tutup-buku")({
  component: TutupBuku,
});
