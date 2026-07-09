import { createFileRoute } from "@tanstack/react-router";
import CBE from "@/pages/CBE";

export const Route = createFileRoute("/_protected/_app/cbe/$tab")({
  component: CBE,
});
