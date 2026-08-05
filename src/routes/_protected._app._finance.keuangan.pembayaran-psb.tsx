import { createFileRoute, redirect } from "@tanstack/react-router";

// Legacy: rute "PSB" berganti nama jadi "PMB". Redirect supaya link lama tidak putus.
export const Route = createFileRoute("/_protected/_app/_finance/keuangan/pembayaran-psb")({
  beforeLoad: () => {
    throw redirect({ to: "/keuangan/pembayaran-pmb" });
  },
});
