const listEl = document.getElementById('conversation-list');
const messagesEl = document.getElementById('messages');
const threadEmpty = document.getElementById('thread-empty');
const threadActive = document.getElementById('thread-active');
const threadTitle = document.getElementById('thread-title');
const threadMeta = document.getElementById('thread-meta');
const refreshBtn = document.getElementById('refresh-btn');

let activeId = null;

function apiBase() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  return token ? `?token=${encodeURIComponent(token)}` : '';
}

function authHeaders() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchJson(path) {
  const r = await fetch(`${path}${apiBase()}`, { headers: authHeaders() });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function labelForType(type, role) {
  if (type === 'draft_notification') return 'Outreach draft';
  if (type === 'command') return role === 'user' ? 'Command' : 'AXON';
  return role === 'user' ? 'JB' : 'AXON';
}

function renderMessages(messages) {
  messagesEl.innerHTML = '';
  if (!messages.length) {
    messagesEl.innerHTML = '<p class="loading">No messages yet.</p>';
    return;
  }

  for (const m of messages) {
    const div = document.createElement('div');
    const cls = m.message_type === 'chat' ? m.role : m.message_type;
    div.className = `msg ${cls}`;

    const label = document.createElement('div');
    label.className = 'msg-label';
    label.textContent = labelForType(m.message_type, m.role);

    const body = document.createElement('div');
    body.textContent = m.content;

    const time = document.createElement('div');
    time.className = 'msg-time';
    time.textContent = formatTime(m.created_at);

    div.append(label, body, time);
    messagesEl.appendChild(div);
  }

  messagesEl.scrollTop = messagesEl.scrollHeight;
}

async function selectConversation(conv) {
  activeId = conv.id;
  threadEmpty.classList.add('hidden');
  threadActive.classList.remove('hidden');
  threadTitle.textContent = conv.title || 'Telegram';
  threadMeta.textContent = `Updated ${formatTime(conv.updated_at)} · Chat ${conv.chat_id}`;

  document.querySelectorAll('.conversation-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.id === conv.id);
  });

  messagesEl.innerHTML = '<p class="loading">Loading…</p>';
  try {
    const data = await fetchJson(`/api/conversations/${conv.id}/messages`);
    renderMessages(data.messages || []);
  } catch (err) {
    messagesEl.innerHTML = `<p class="error">Could not load messages: ${err.message}</p>`;
  }
}

async function loadConversations() {
  listEl.innerHTML = '<li class="loading">Loading…</li>';
  try {
    const data = await fetchJson('/api/conversations');
    const convs = data.conversations || [];
    listEl.innerHTML = '';

    if (!convs.length) {
      listEl.innerHTML = '<li class="loading">No conversations yet. Message AXON on Telegram to start.</li>';
      return;
    }

    for (const conv of convs) {
      const li = document.createElement('li');
      li.className = 'conversation-item';
      li.dataset.id = conv.id;
      li.innerHTML = `
        <div class="title">${conv.title || 'Telegram'}</div>
        <div class="time">${formatTime(conv.updated_at)}</div>
      `;
      li.addEventListener('click', () => selectConversation(conv));
      listEl.appendChild(li);
    }

    if (!activeId && convs[0]) {
      await selectConversation(convs[0]);
    } else if (activeId) {
      const current = convs.find((c) => c.id === activeId);
      if (current) await selectConversation(current);
    }
  } catch (err) {
    listEl.innerHTML = `<li class="error">${err.message}</li>`;
  }
}

refreshBtn.addEventListener('click', loadConversations);
loadConversations();
setInterval(loadConversations, 30000);
