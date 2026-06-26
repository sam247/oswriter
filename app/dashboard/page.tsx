import { isAuthed } from "@/lib/server/auth";
import { WriterApp } from "@/components/writer-app";

export default async function DashboardPage() {
  return <WriterApp initialAuthed={await isAuthed()} />;
}
