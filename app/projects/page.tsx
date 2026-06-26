import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/server/auth";

export default async function ProjectsPage() {
  if (!await getAuthSession()) redirect("/login");
  redirect("/");
}
