import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AxonChangeCodeForm } from "@/components/axon/AxonChangeCodeForm";
import { AxonAmbientBg } from "@/components/axon-ui/axon-ambient-bg";
import { AxonInterface } from "@/components/axon-ui/axon-interface";
import { Sidebar } from "@/components/axon-ui/sidebar";
import { ToolPanel } from "@/components/axon-ui/tool-panel";
import { canEnterAxonPortal } from "@/lib/axon/access";
import { fetchChatHistory, getOperatorProfile } from "@/lib/axon/axon-profile";
import { getPreferences } from "@/lib/axon/axon-preferences";
import { AXON_TOOLS } from "@/lib/axon/axon-types";
import { getWorkspace } from "@/lib/axon/axon-workspace";
import { fetchPipelineStats } from "@/lib/axon/leads";
import { axonPublicPath } from "@/lib/axon/paths";
import {
  AXON_SESSION_COOKIE,
  readAxonSessionFromCookieValue,
} from "@/lib/axon/session";
import { createServerAuthClient } from "@/lib/supabase/server-auth";
import "@/styles/axon.css";

export const metadata: Metadata = {
  title: "AXON Command | Northside Intelligence",
};

export const dynamic = "force-dynamic";

export default async function AxonUserDashboardPage({
  params,
}: {
  params: { username: string };
}) {
  const username = params.username.trim().toLowerCase();
  const supabase = await createServerAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/auth/signin?next=${axonPublicPath(username, "/dashboard")}`);

  const { data: profile } = await supabase
    .from("ni_portal_profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();

  const portalUsername = profile?.username?.trim().toLowerCase() ?? "";
  if (portalUsername !== username) redirect("/axon");

  const allowed = await canEnterAxonPortal(user.id);
  if (!allowed) redirect("/axon");

  const sessionToken = cookies().get(AXON_SESSION_COOKIE)?.value;
  if (!readAxonSessionFromCookieValue(sessionToken, user.id)) {
    redirect(`/api/axon/bootstrap?username=${encodeURIComponent(username)}`);
  }

  const operatorId = username;
  const [operatorProfile, messages, stats, workspace, preferences] = await Promise.all([
    getOperatorProfile(operatorId),
    fetchChatHistory(operatorId, 30),
    fetchPipelineStats().catch(() => null),
    getWorkspace(operatorId),
    getPreferences(operatorId),
  ]);

  const metrics: Record<string, string | number> = {};
  if (stats) metrics["ni-services-outreach"] = stats.pending;

  return (
    <main className="relative min-h-screen overflow-hidden bg-axon-bg text-axon-text">
      <div className="relative flex min-h-screen">
        <AxonAmbientBg />
        <Sidebar basePath={axonPublicPath(username)} />
        <div className="axon-grid-bg relative z-10 flex-1 overflow-auto">
          <div className="mx-auto max-w-[1600px] px-6 py-8">
            <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-axon-blue-glow">
                  Northside Intelligence
                </p>
                <h1 className="mt-2 text-2xl font-semibold axon-gradient-text sm:text-3xl">AXON</h1>
                <p className="mt-2 text-sm text-axon-muted">Operator: @{username}</p>
              </div>
              <Link href="/" className="text-sm text-axon-blue-glow hover:underline">
                Back to Portal
              </Link>
            </header>

            <AxonInterface
              basePath={axonPublicPath(username)}
              initialMessages={messages}
              initialWorkspace={workspace}
              initialPreferences={preferences}
              initialProfile={{
                input_mode: operatorProfile.input_mode,
                read_aloud: operatorProfile.read_aloud,
                voice_id: operatorProfile.voice_id,
                tone_preset: operatorProfile.tone_preset,
              }}
            />

            <ToolPanel tools={AXON_TOOLS} metrics={metrics} />

            <AxonChangeCodeForm />
          </div>
        </div>
      </div>
    </main>
  );
}
