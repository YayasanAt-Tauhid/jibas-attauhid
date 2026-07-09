import { createFileRoute } from "@tanstack/react-router";
import TabunganSiswa from "@/pages/keuangan/TabunganSiswa";

export const Route = createFileRoute("/_protected/_app/_finance/keuangan/tabungan")({
  component: TabunganSiswa,
});
