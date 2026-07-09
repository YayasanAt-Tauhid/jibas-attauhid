import { createFileRoute } from "@tanstack/react-router";
import TabunganPegawai from "@/pages/keuangan/TabunganPegawai";

export const Route = createFileRoute("/_protected/_app/_finance/keuangan/tabungan-pegawai")({
  component: TabunganPegawai,
});
