/**
 * TELEGRAM-CHAT-GROUNDED-0906 — the one entry point for free text JB types in
 * his private Telegram chat.
 *
 * Three routes, in this order:
 *   1. "What needs me?" — answered from the rows themselves, no model involved.
 *      That question is exactly what got invented on 2026-09-06, so it is never
 *      left to a model again.
 *   2. A plain instruction — filed as one real job for the owning agent, and
 *      JB is told who has it. No promises of a plan.
 *   3. Anything else — the model answers, grounded in the same live snapshot,
 *      through the locked router.
 */
import { axonChatReply, buildPipelineContext } from './axon-telegram-chat.mjs';
import {
  answerWhatNeedsJb,
  asksWhatNeedsJb,
  buildJbChatContext,
} from './axon-jb-chat-context.mjs';
import { CLARIFY_REPLY, classifyJbMessage, fileJbInstruction } from './axon-jb-instruction.mjs';

/**
 * @param {object} cfg
 * @param {{ sbSelect: Function, sbInsert: Function }} sb
 * @param {{ userMessage: string, history?: Array, now?: Date, generate?: Function }} opts
 */
export async function answerJbChatMessage(cfg, sb, { userMessage, history = [], now = new Date(), generate }) {
  const { sbSelect, sbInsert } = sb;

  let pipelineContext = '';
  try {
    pipelineContext = await buildPipelineContext(sbSelect);
  } catch {
    pipelineContext = '';
  }
  const facts = await buildJbChatContext(sbSelect, { now, pipelineContext });

  if (asksWhatNeedsJb(userMessage)) {
    return { reply: answerWhatNeedsJb(facts), route: 'needs-jb', facts };
  }

  const kind = classifyJbMessage(userMessage);
  if (kind === 'instruction') {
    const { row, reply } = await fileJbInstruction(sbInsert, userMessage, { now });
    return { reply, route: 'filed', dispatch: row, facts };
  }
  if (kind === 'clarify') {
    return { reply: CLARIFY_REPLY, route: 'clarify', facts };
  }

  const reply = await axonChatReply(cfg, {
    userMessage,
    history,
    context: facts.text,
    sbSelect,
    ...(generate ? { generate } : {}),
  });
  return { reply, route: 'model', facts };
}
