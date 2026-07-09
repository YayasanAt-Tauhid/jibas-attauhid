import { createFileRoute } from "@tanstack/react-router";
import JadwalPegawai from "@/pages/kepegawaian/JadwalPegawai";

export const Route = createFileRoute("/_protected/_app/kepegawaian/jadwal")({
  component: JadwalPegawai,
});
