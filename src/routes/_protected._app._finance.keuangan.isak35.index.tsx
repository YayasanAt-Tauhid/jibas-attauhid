import { createFileRoute } from "@tanstack/react-router";
import RingkasanISAK35 from "@/pages/keuangan/RingkasanISAK35";

export const Route = createFileRoute("/_protected/_app/_finance/keuangan/isak35/")({
  component: RingkasanISAK35,
});
