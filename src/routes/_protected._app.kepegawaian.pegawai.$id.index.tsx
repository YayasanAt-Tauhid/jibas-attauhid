import { createFileRoute } from "@tanstack/react-router";
import DetailPegawai from "@/pages/kepegawaian/DetailPegawai";

export const Route = createFileRoute("/_protected/_app/kepegawaian/pegawai/$id/")({
  component: DetailPegawai,
});
