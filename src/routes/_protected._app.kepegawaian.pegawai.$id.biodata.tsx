import { createFileRoute } from "@tanstack/react-router";
import CetakBiodata from "@/pages/kepegawaian/CetakBiodata";

export const Route = createFileRoute("/_protected/_app/kepegawaian/pegawai/$id/biodata")({
  component: CetakBiodata,
});
