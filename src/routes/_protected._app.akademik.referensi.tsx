import { createFileRoute } from "@tanstack/react-router";
import ReferensiAkademik from "@/pages/akademik/ReferensiAkademik";

export const Route = createFileRoute("/_protected/_app/akademik/referensi")({
  component: ReferensiAkademik,
});
