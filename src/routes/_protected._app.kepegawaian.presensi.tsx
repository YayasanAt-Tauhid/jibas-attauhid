import { createFileRoute } from "@tanstack/react-router";
import PresensiPegawai from "@/pages/kepegawaian/PresensiPegawai";

export const Route = createFileRoute("/_protected/_app/kepegawaian/presensi")({
  component: PresensiPegawai,
});
