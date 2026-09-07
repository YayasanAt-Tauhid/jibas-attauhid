import { createFileRoute } from "@tanstack/react-router";
import JurnalUmumDesktopLayout from "@/pages/keuangan/JurnalUmumDesktopLayout";

export const Route = createFileRoute("/_protected/_app/_finance/keuangan/jurnal")({
  component: JurnalUmumDesktopLayout,
});
