import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { canEnterAxonPortal } from '@/lib/axon/access';
import { axonPublicPath } from '@/lib/axon/paths';
import {
  AXON_SESSION_COOKIE,
  readAxonSessionFromCookieValue,
} from '@/lib/axon/session';
import { createServerAuthClient } from '@/lib/supabase/server-auth';

/** Enforce NI portal auth + AXON session for all /axon/u/[username]/* routes. */
export async function requireAxonPortalUser(username: string) {
  const normalized = username.trim().toLowerCase();
  const supabase = await createServerAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth/signin?next=${axonPublicPath(normalized, '/dashboard')}`);
  }

  const { data: profile } = await supabase
    .from('ni_portal_profiles')
    .select('username')
    .eq('id', user.id)
    .maybeSingle();

  const portalUsername = profile?.username?.trim().toLowerCase() ?? '';
  if (portalUsername !== normalized) redirect('/axon');

  const allowed = await canEnterAxonPortal(user.id);
  if (!allowed) redirect('/axon');

  const sessionToken = cookies().get(AXON_SESSION_COOKIE)?.value;
  if (!readAxonSessionFromCookieValue(sessionToken, user.id)) {
    redirect(`/api/axon/bootstrap?username=${encodeURIComponent(normalized)}`);
  }

  return { user, username: normalized, operatorId: normalized };
}
