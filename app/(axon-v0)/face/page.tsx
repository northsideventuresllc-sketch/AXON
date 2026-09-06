/**
 * /face is where THE FACE lived for one day. It is the Dash home screen now, so anything
 * still pointing here — a bookmark, an old link — lands on `/` permanently.
 *
 * Done in the router rather than next.config.mjs because that config carries no redirects
 * block today and this repo already redirects this way (see app/(dashboard)/queue/page.tsx).
 */
import { permanentRedirect } from 'next/navigation';

export default function FaceRedirect() {
  permanentRedirect('/');
}
