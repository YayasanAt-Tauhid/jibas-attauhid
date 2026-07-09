import { createFileRoute } from "@tanstack/react-router";
import PSB from "@/pages/akademik/PSB";

export const Route = createFileRoute("/_protected/_app/akademik/psb")({
  component: PSB,
});
