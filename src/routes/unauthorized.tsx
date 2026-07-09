import { createFileRoute } from "@tanstack/react-router";
import Unauthorized from "@/pages/Unauthorized";

export const Route = createFileRoute("/unauthorized")({
  component: Unauthorized,
});
