import { createFileRoute } from "@tanstack/react-router";
import OnlinePayment from "@/pages/keuangan/OnlinePayment";

export const Route = createFileRoute("/_protected/_app/_finance/keuangan/online-payment")({
  component: OnlinePayment,
});
