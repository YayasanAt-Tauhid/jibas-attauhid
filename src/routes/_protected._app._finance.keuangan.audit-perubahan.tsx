import { createFileRoute } from "@tanstack/react-router";
import AuditPerubahanData from "@/pages/keuangan/AuditPerubahanData";

export const Route = createFileRoute("/_protected/_app/_finance/keuangan/audit-perubahan")({
  component: AuditPerubahanData,
});
