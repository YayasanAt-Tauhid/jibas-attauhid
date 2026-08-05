import { createFileRoute } from "@tanstack/react-router";
import PMBDaftar from "@/pages/portal/PMBDaftar";

export const Route = createFileRoute("/pmb")({
  component: PMBDaftar,
});
