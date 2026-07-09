import { createFileRoute } from "@tanstack/react-router";
import Penilaian from "@/pages/akademik/Penilaian";

export const Route = createFileRoute("/_protected/_app/akademik/penilaian")({
  component: Penilaian,
});
