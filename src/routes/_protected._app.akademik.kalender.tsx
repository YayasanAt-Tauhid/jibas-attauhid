import { createFileRoute } from "@tanstack/react-router";
import KalenderAkademik from "@/pages/akademik/KalenderAkademik";

export const Route = createFileRoute("/_protected/_app/akademik/kalender")({
  component: KalenderAkademik,
});
