import { createFileRoute } from "@tanstack/react-router";
import BackupExport from "@/pages/pengaturan/BackupExport";

export const Route = createFileRoute("/_protected/_app/pengaturan/backup")({
  component: BackupExport,
});
