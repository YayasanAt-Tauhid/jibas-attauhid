import { createFileRoute } from "@tanstack/react-router";
import RPP from "@/pages/akademik/RPP";

export const Route = createFileRoute("/_protected/_app/akademik/rpp")({
  component: RPP,
});
