import { createFileRoute } from "@tanstack/react-router";
import DataAlumni from "@/pages/akademik/DataAlumni";

export const Route = createFileRoute("/_protected/_app/akademik/alumni")({
  component: DataAlumni,
});
