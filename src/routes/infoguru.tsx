import { createFileRoute } from "@tanstack/react-router";
import InfoGuru from "@/pages/InfoGuru";

export const Route = createFileRoute("/infoguru")({
  component: InfoGuru,
});
