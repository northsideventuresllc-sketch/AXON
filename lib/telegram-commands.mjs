export function welcomeMessage() {
  return [
    'AXON is online — NORTHSiDE NI services outreach.',
    '',
    'Commands:',
    '/status — pipeline summary',
    '/approve <id> — send approved email',
    '/reject <id> — kill lead',
    '/sent_li <id> — mark LinkedIn sent',
    '',
    'Drafts land here after the outreach run (nightly + manual).',
    'Portal: northsideintelligence.com/axon',
  ].join('\n');
}
