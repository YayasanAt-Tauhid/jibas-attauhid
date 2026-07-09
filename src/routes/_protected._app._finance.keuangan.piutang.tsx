import { createFileRoute } from "@tanstack/react-router";
import PiutangManajemen from "@/pages/keuangan/PiutangManajemen";

export const Route = createFileRoute("/_protected/_app/_finance/keuangan/piutang")({
  component: PiutangManajemen,
});
