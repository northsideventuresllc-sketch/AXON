import { redirect } from 'next/navigation';

export default function FollowUpRedirectPage() {
  redirect('/tools/ni-outreach?tab=follow-up');
}
