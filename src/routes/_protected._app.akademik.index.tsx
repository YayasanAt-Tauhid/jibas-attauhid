import { createFileRoute } from "@tanstack/react-router";
import Akademik from "@/pages/Akademik";

export const Route = createFileRoute("/_protected/_app/akademik/")({
  component: Akademik,
});
