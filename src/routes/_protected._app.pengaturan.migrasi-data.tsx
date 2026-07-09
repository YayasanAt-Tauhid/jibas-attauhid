import { createFileRoute } from "@tanstack/react-router";
import MigrasiData from "@/pages/pengaturan/MigrasiData";

export const Route = createFileRoute("/_protected/_app/pengaturan/migrasi-data")({
  component: MigrasiData,
});
