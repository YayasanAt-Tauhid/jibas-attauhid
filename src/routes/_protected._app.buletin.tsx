import { createFileRoute } from "@tanstack/react-router";
import Buletin from "@/pages/Buletin";

export const Route = createFileRoute("/_protected/_app/buletin")({
  component: Buletin,
});
