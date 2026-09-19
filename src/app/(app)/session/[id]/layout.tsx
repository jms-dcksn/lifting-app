import { createClient } from "@/lib/supabase/server";
import { RestTimerProvider } from "./rest-timer";

export default async function SessionLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;

  const [{ data: profile }, { data: session }] = userId
    ? await Promise.all([
        supabase.from("profile").select("rest_tone_enabled").eq("id", userId).maybeSingle(),
        supabase
          .from("workout_session")
          .select("finished_at")
          .eq("id", id)
          .eq("user_id", userId)
          .maybeSingle(),
      ])
    : [{ data: null }, { data: null }];

  return (
    <RestTimerProvider
      key={id}
      sessionId={id}
      toneEnabled={profile?.rest_tone_enabled ?? true}
      enabled={!session?.finished_at}
    >
      {children}
    </RestTimerProvider>
  );
}
