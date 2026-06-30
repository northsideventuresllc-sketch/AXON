export const BOT_COMMANDS = [
  { command: 'start', description: 'Say hello and see what AXON can do' },
  { command: 'help', description: 'Show commands and how to chat' },
  { command: 'status', description: 'Pipeline summary — drafts, wins, totals' },
  { command: 'approve', description: 'Send approved email or mark LinkedIn approved' },
  { command: 'reject', description: 'Remove a lead from the pipeline' },
  { command: 'sent_li', description: 'Mark a LinkedIn DM as sent' },
  { command: 'new', description: 'Start a fresh chat thread' },
];

export function welcomeMessage() {
  return [
    "Hey JB — AXON here. I'm your NORTHSiDE outreach assistant.",
    '',
    'Talk to me like a normal chat. Ask about leads, strategy, or what is on your mind. I will keep it plain — no tech jargon unless you want it.',
    '',
    'Quick commands when you need them:',
    '/status — how the pipeline looks right now',
    '/approve <id> — send an approved email (or OK a LinkedIn draft)',
    '/reject <id> — pass on a lead',
    '/sent_li <id> — you sent the LinkedIn DM manually',
    '/new — fresh conversation',
    '',
    'New outreach drafts land here after the nightly run. Nothing goes out without your say-so.',
    '',
    'Full chat history: AXON dashboard (northsideintelligence.com/axon)',
  ].join('\n');
}

export function statusMessage(summary) {
  const { total, pending, won, counts } = summary;
  const lines = [
    "Here's where things stand:",
    '',
    `Total leads in the system: ${total}`,
    `Waiting for your approval: ${pending}`,
    `Clients closed: ${won} of 4 goal`,
  ];

  if (total === 0) {
    lines.push('', 'No drafts yet. The outreach run happens nightly, or you can trigger it manually in GitHub Actions.');
  } else if (pending > 0) {
    lines.push('', `You have ${pending} draft${pending === 1 ? '' : 's'} to review. Check the messages above or open the dashboard.`);
  } else {
    lines.push('', 'Nothing waiting on you right now. All caught up.');
  }

  if (total > 0) {
    const breakdown = Object.entries(counts)
      .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
      .join(' · ');
    lines.push('', breakdown);
  }

  return lines.join('\n');
}
