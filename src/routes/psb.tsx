import { createFileRoute } from "@tanstack/react-router";
import PSBDaftar from "@/pages/portal/PSBDaftar";

export const Route = createFileRoute("/psb")({
  component: PSBDaftar,
});
