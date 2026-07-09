import { createFileRoute } from "@tanstack/react-router";
import StatistikSiswa from "@/pages/akademik/StatistikSiswa";

export const Route = createFileRoute("/_protected/_app/akademik/statistik")({
  component: StatistikSiswa,
});
