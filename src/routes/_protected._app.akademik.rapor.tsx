import { createFileRoute } from "@tanstack/react-router";
import CetakRapor from "@/pages/akademik/CetakRapor";

export const Route = createFileRoute("/_protected/_app/akademik/rapor")({
  component: CetakRapor,
});
