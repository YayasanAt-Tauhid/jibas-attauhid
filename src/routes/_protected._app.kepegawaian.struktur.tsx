import { createFileRoute } from "@tanstack/react-router";
import StrukturOrganisasi from "@/pages/kepegawaian/StrukturOrganisasi";

export const Route = createFileRoute("/_protected/_app/kepegawaian/struktur")({
  component: StrukturOrganisasi,
});
