import { createFileRoute } from "@tanstack/react-router";
import Simtaka from "@/pages/Simtaka";

export const Route = createFileRoute("/_protected/_app/simtaka/$tab")({
  component: Simtaka,
});
