import { createFileRoute } from "@tanstack/react-router";
import DUK from "@/pages/kepegawaian/DUK";

export const Route = createFileRoute("/_protected/_app/kepegawaian/duk")({
  component: DUK,
});
