import { createFileRoute } from "@tanstack/react-router";
import Kepegawaian from "@/pages/Kepegawaian";

export const Route = createFileRoute("/_protected/_app/kepegawaian/")({
  component: Kepegawaian,
});
