import { createFileRoute } from "@tanstack/react-router";
import Pengaturan from "@/pages/Pengaturan";

export const Route = createFileRoute("/_protected/_app/pengaturan/$tab")({
  component: Pengaturan,
});
