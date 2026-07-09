import { createFileRoute } from "@tanstack/react-router";
import AuditTrail from "@/pages/keuangan/AuditTrail";

export const Route = createFileRoute("/_protected/_app/_finance/keuangan/audit-trail")({
  component: AuditTrail,
});
