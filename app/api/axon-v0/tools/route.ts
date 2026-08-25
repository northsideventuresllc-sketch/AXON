import { NextResponse } from 'next/server';
import { AXON_USER_TOOLS } from '@/lib/axon-user-tools';

// Lightweight per-account custom-tool store. Deliberately NOT persisted to
// NI-Brain / ni_platform_secrets — this mirrors lib/axon-v0/store.ts's
// in-memory globalThis singleton fallback so the Toolkit slice runs standalone.

const ACCOUNT_ID = '00000000-0000-0000-0000-000000000001'; // JB; multi-tenant callers pass their own later

export interface CustomTool {
  slug: string;
  name: string;
  sourceType: 'custom';
  notes: string;
  icon: string;
  createdAt: string;
}

interface ToolAccount {
  custom: CustomTool[];
  hidden: string[]; // built-in AXON_USER_TOOLS slugs the account has hidden/deleted
}

interface ToolStore {
  accounts: Record<string, ToolAccount>;
}

const g = globalThis as unknown as { __axonV0Tools?: ToolStore };
function store(): ToolStore {
  if (!g.__axonV0Tools) g.__axonV0Tools = { accounts: {} };
  return g.__axonV0Tools;
}
function account(id = ACCOUNT_ID): ToolAccount {
  const s = store();
  if (!s.accounts[id]) s.accounts[id] = { custom: [], hidden: [] };
  return s.accounts[id];
}

function slugify(name: string): string {
  const base = String(name || 'tool')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base || 'tool'}-${suffix}`;
}

const BUILTIN_SLUGS = new Set(AXON_USER_TOOLS.map((t) => t.slug));

function ok(acc: ToolAccount) {
  return NextResponse.json({ tools: acc.custom, hidden: acc.hidden });
}

// Echo a structured tool spec from a free-text prompt. No external calls —
// this is a deterministic v0 stub; runtime codegen is a later build.
function draftFromPrompt(prompt: string) {
  const clean = String(prompt || '').trim();
  const firstLine = clean.split(/[.\n]/)[0]?.trim() || 'New AXON Tool';
  const name = firstLine.replace(/^(build|make|create|i want|a tool that|tool that)\s+/i, '').trim() || 'New AXON Tool';
  const title = name.length > 48 ? `${name.slice(0, 48)}…` : name;
  return {
    slug: slugify(title),
    name: title.replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 60),
    sourceType: 'custom' as const,
    icon: '🛠',
    summary: clean
      ? `A custom AXON tool that ${clean.charAt(0).toLowerCase()}${clean.slice(1)}`
      : 'A custom AXON tool.',
    steps: [
      'Reads its inputs from your NI-Brain workspace',
      'Runs the described logic on demand or on a schedule',
      'Writes results back and respects the FIRE/HOLD gate before any send',
    ],
    notes: clean,
  };
}

export async function GET() {
  try {
    return ok(account());
  } catch {
    return NextResponse.json({ tools: [], hidden: [] });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      prompt?: string;
      name?: string;
      notes?: string;
      slug?: string;
      icon?: string;
    };
    const acc = account();
    const action = body.action || '';

    if (action === 'draft') {
      return NextResponse.json({ draft: draftFromPrompt(body.prompt || '') });
    }

    if (action === 'create' || action === 'from_it') {
      const name = (body.name || '').trim() || 'Untitled Tool';
      const tool: CustomTool = {
        slug: (body.slug || '').trim() || slugify(name),
        name: name.slice(0, 60),
        sourceType: 'custom',
        notes: (body.notes || '').trim() || (action === 'from_it' ? 'Registered from an IT / existing tool.' : ''),
        icon: body.icon || (action === 'from_it' ? '🧬' : '🛠'),
        createdAt: new Date().toISOString(),
      };
      // de-dupe by slug
      acc.custom = acc.custom.filter((t) => t.slug !== tool.slug).concat(tool);
      return ok(acc);
    }

    if (action === 'delete') {
      const slug = (body.slug || '').trim();
      if (slug) {
        if (BUILTIN_SLUGS.has(slug)) {
          if (!acc.hidden.includes(slug)) acc.hidden.push(slug);
        } else {
          acc.custom = acc.custom.filter((t) => t.slug !== slug);
          // also un-hide in case a slug collided
          acc.hidden = acc.hidden.filter((s) => s !== slug);
        }
      }
      return ok(acc);
    }

    if (action === 'restore') {
      const slug = (body.slug || '').trim();
      acc.hidden = acc.hidden.filter((s) => s !== slug);
      return ok(acc);
    }

    // Unknown action — never 500, just echo current state.
    return ok(acc);
  } catch {
    return NextResponse.json({ tools: [], hidden: [] });
  }
}
