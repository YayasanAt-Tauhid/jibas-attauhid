import { createFileRoute, redirect } from "@tanstack/react-router";

// Legacy: rute "PSB" berganti nama jadi "PMB". Redirect supaya link lama
// (mis. sudah dibagikan ke calon wali murid) tidak putus.
export const Route = createFileRoute("/psb")({
  beforeLoad: () => {
    throw redirect({ to: "/pmb" });
  },
});
