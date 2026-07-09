import { createFileRoute } from "@tanstack/react-router";
import DataPegawai from "@/pages/kepegawaian/DataPegawai";

export const Route = createFileRoute("/_protected/_app/kepegawaian/pegawai/")({
  component: DataPegawai,
});
