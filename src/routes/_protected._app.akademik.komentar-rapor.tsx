import { createFileRoute } from "@tanstack/react-router";
import KomentarRapor from "@/pages/akademik/KomentarRapor";

export const Route = createFileRoute("/_protected/_app/akademik/komentar-rapor")({
  component: KomentarRapor,
});
