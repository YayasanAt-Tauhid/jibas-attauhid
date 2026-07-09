import { createFileRoute } from "@tanstack/react-router";
import LeggerNilai from "@/pages/akademik/LeggerNilai";

export const Route = createFileRoute("/_protected/_app/akademik/legger")({
  component: LeggerNilai,
});
