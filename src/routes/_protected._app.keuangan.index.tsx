import { createFileRoute } from "@tanstack/react-router";
import Keuangan from "@/pages/Keuangan";

export const Route = createFileRoute("/_protected/_app/keuangan/")({
  component: Keuangan,
});
