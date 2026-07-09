import { createFileRoute } from "@tanstack/react-router";
import Anjungan from "@/pages/Anjungan";

export const Route = createFileRoute("/anjungan")({
  component: Anjungan,
});
