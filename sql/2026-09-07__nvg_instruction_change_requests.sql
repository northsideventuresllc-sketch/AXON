-- nvg_instruction_change_requests — STAGED FOR JB APPROVAL, do not auto-apply.
--
-- BPA-B4-TELEGRAM-ROUNDTRIP-0906: table did not exist as of 2026-09-07
-- (`select column_name from information_schema.columns where
-- table_name='nvg_instruction_change_requests'` on kxijunwgbrlfzvgkhklo returned
-- zero rows). lib/instruction-change-requests.mjs is written to work whether or
-- not this migration has been applied — every table access is wrapped and logs
-- a clear line instead of throwing when the table is absent. Apply this only
-- when JB confirms the shape below is what he wants; nothing in this PR runs it.
--
-- Round trip this table supports: close-outs -> ARCEUS -> council produces a
-- request row -> one Telegram message to JB with Approve / Deny / Reply ->
-- a tap or a reply writes back onto this row -> approval re-fires the
-- requester_agent via an open agent_bus row.

create table if not exists nvg_instruction_change_requests (
  id uuid primary key default gen_random_uuid(),
  requester_agent text not null,       -- agent_bus-style agent name the change would apply to / came from
  target_agent text not null,          -- who the instruction change actually changes behavior for
  summary text not null,               -- one or two lines JB reads in the Telegram message
  diff_url text,                       -- link to the proposed diff (PR, gist, vault note)
  status text not null default 'pending',   -- pending | approved | denied
  decided_at timestamptz,
  jb_note text,                        -- captured from JB's reply-flow text, if he used Reply
  -- minimal reply-capture state — this repo has no persistent multi-step
  -- await-state store (see lib/content-machine-telegram.mjs's /content_edit
  -- comment), so the "waiting for JB's next message" flag lives on the row
  -- itself rather than a new table.
  awaiting_reply boolean not null default false,
  awaiting_reply_chat_id text,
  awaiting_reply_thread_id text,
  telegram_message_id bigint,          -- message_id of the ic: card, so its keyboard can be cleared
  created_at timestamptz not null default now()
);

create index if not exists nvg_instruction_change_requests_status
  on nvg_instruction_change_requests (status, created_at);

create index if not exists nvg_instruction_change_requests_awaiting_reply
  on nvg_instruction_change_requests (awaiting_reply)
  where awaiting_reply = true;
