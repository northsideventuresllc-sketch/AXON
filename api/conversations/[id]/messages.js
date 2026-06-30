import { messagesHandler } from '../../lib/dashboard-api.mjs';

export default function handler(req, res) {
  const id = req.query.id;
  return messagesHandler(req, res, id);
}
