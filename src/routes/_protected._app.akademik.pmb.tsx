import { createFileRoute } from "@tanstack/react-router";
import PMB from "@/pages/akademik/PMB";

export const Route = createFileRoute("/_protected/_app/akademik/pmb")({
  component: PMB,
});
