import "server-only";

import { canEnterAxonPortal } from "@/lib/axon/access";
import { getUserBillingState } from "@/lib/billing/entitlements";
import { createServerAuthClient } from "@/lib/supabase/server-auth";

/** Portal username used as AXON operator_id in NI-Brain tables. */
export async function resolveAxonOperatorId(): Promise<string | null> {
  const supabase = await createServerAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const allowed = await canEnterAxonPortal(user.id);
  if (!allowed) return null;

  const { data: profile } = await supabase
    .from("ni_portal_profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();

  return profile?.username?.trim().toLowerCase() ?? null;
}

export async function requireAxonOperatorId(): Promise<string> {
  const operatorId = await resolveAxonOperatorId();
  if (!operatorId) {
    throw new Error("AXON access denied");
  }
  return operatorId;
}

/**
 * Stricter than requireAxonOperatorId: checks isMasterAccount directly rather
 * than through canEnterAxonPortal, which is documented as a pre-launch gate
 * that widens to entitled purchasers later. Use for genuinely operator-only
 * actions (e.g. the global halt / kill switch) that must stay master-only
 * even after that gate opens.
 */
export async function requireAxonMasterOperatorId(): Promise<string> {
  const supabase = await createServerAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("AXON access denied");

  const state = await getUserBillingState(user.id);
  if (!state.isMasterAccount) throw new Error("AXON access denied");

  const operatorId = await resolveAxonOperatorId();
  if (!operatorId) throw new Error("AXON access denied");
  return operatorId;
}
