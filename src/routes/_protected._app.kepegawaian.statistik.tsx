import { createFileRoute } from "@tanstack/react-router";
import StatistikPegawai from "@/pages/kepegawaian/StatistikPegawai";

export const Route = createFileRoute("/_protected/_app/kepegawaian/statistik")({
  component: StatistikPegawai,
});
