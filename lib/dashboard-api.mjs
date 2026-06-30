import { createSupabaseClient } from './supabase.mjs';
import { listConversations, listMessages } from './telegram-conversations.mjs';

function sendJson(res, status, body) {
  res.status(status).json(body);
}

function checkAuth(req) {
  const token = process.env.AXON_DASHBOARD_TOKEN;
  if (!token) return true;
  const auth = req.headers.authorization || '';
  if (auth === `Bearer ${token}`) return true;
  return req.query?.token === token;
}

function unauthorized(res) {
  sendJson(res, 401, { error: 'Unauthorized' });
}

export async function conversationsHandler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
  if (!checkAuth(req)) return unauthorized(res);

  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return sendJson(res, 503, { error: 'Database not configured' });

  try {
    const sb = createSupabaseClient(key);
    const conversations = await listConversations(sb.sbSelect, 50);
    return sendJson(res, 200, { conversations: conversations || [] });
  } catch (err) {
    return sendJson(res, 500, { error: err.message });
  }
}

export async function messagesHandler(req, res, conversationId) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
  if (!checkAuth(req)) return unauthorized(res);
  if (!conversationId) return sendJson(res, 400, { error: 'Conversation ID required' });

  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return sendJson(res, 503, { error: 'Database not configured' });

  try {
    const sb = createSupabaseClient(key);
    const messages = await listMessages(sb.sbSelect, conversationId, 300);
    return sendJson(res, 200, { messages: messages || [] });
  } catch (err) {
    sendJson(res, 500, { error: err.message });
  }
}
