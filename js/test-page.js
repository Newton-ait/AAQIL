// Surf AI — Test Dashboard
// postMessage protocol test harness
// Config received via sandbox_ready postMessage

const SANDBOX_URL = 'https://sb-sf.vercel.app';

let jwt = null, sessionReady = false, msgCount = 0, voiceCount = 0, sessionId = 'test-' + Date.now();
let lastRequestTime = 0;
let supabaseUrl = '', supabaseAnon = '';

const sandbox = document.getElementById('sandbox-iframe');

// ── Debug log ──────────────────────────────────────────────────────

function log(msg, type = 'info') {
    const el = document.getElementById('debug-log');
    const time = new Date().toLocaleTimeString();
    el.innerHTML += `<div class="log-line log-${type}">[${time}] ${msg}</div>`;
    el.scrollTop = el.scrollHeight;
}
function copyLog() {
    navigator.clipboard.writeText(document.getElementById('debug-log').textContent);
    log('Log copied', 'info');
}

// ── postMessage handler ────────────────────────────────────────────

window.addEventListener('message', (e) => {
    if (!e.origin.includes('sb-sf.vercel.app')) return;
    const msg = e.data;
    log(`← ${msg.type}${msg.action ? ':' + msg.action : ''}`, 'in');

    switch (msg.type) {
        case 'sandbox_ready':
            updateConnection(true);
            // Config included in sandbox_ready message
            if (msg.config && msg.config.SUPABASE_URL && msg.config.SUPABASE_ANON_KEY) {
                supabaseUrl = msg.config.SUPABASE_URL;
                supabaseAnon = msg.config.SUPABASE_ANON_KEY;
                log('✅ Config loaded from sandbox', 'info');
                document.getElementById('auth-status').textContent = 'Sandbox ready — login to continue';
            } else {
                document.getElementById('auth-status').textContent = 'Sandbox ready';
            }
            break;
        case 'token_received':
            document.getElementById('auth-status').textContent = '✅ Token accepted';
            break;
        case 'session_ready':
            sessionReady = true;
            document.getElementById('auth-status').textContent = '✅ Logged in';
            enableChat();
            break;
        case 'session_expired':
            sessionReady = false;
            document.getElementById('auth-status').textContent = '⚠️ Expired';
            break;
        case 'response':
            msgCount++;
            addMessage('ai', msg.text);
            if (lastRequestTime) {
                document.getElementById('latency').textContent = `(${Date.now() - lastRequestTime}ms)`;
            }
            updateStats();
            break;
        case 'response_token':
            appendToLastAI(msg.token);
            break;
        case 'transcript':
            msgCount++;
            voiceCount++;
            addMessage('user', '🎤 ' + msg.text);
            updateStats();
            break;
        case 'vad_status':
            log(`VAD: ${msg.phase}`, 'info');
            break;
        case 'error':
            log(`ERROR: ${msg.code} — ${msg.message}`, 'error');
            addMessage('system', `⚠️ ${msg.message}`);
            break;
        case 'voices':
            const vs = document.getElementById('voice-select');
            vs.innerHTML = '<option value="">Voice: Default</option>';
            (msg.voices || []).forEach(v => {
                vs.innerHTML += `<option value="${v.id || v}">${v.name || v}</option>`;
            });
            break;
        case 'models':
            const ms = document.getElementById('model-select');
            ms.innerHTML = '<option value="">Model: Default</option>';
            (msg.models || []).forEach(m => {
                ms.innerHTML += `<option value="${m.id || m.name}">${m.name || m.id}</option>`;
            });
            break;
        case 'sandbox_status':
            log(`Status: active=${msg.isActive}, session=${msg.sessionReady}`, 'info');
            break;
        case 'notes_updated':
            log(`Notes: ${(msg.notes || []).length}`, 'info');
            break;
    }
});

// ── Commands ───────────────────────────────────────────────────────

function postCommand(action, params = {}) {
    const msg = { type: 'extension_command', action, ...params };
    log(`→ ${action}`, 'out');
    sandbox.contentWindow.postMessage(msg, SANDBOX_URL);
}

function sendText() {
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    if (!text) return;
    addMessage('user', text);
    msgCount++;
    lastRequestTime = Date.now();
    postCommand('sendText', {
        text,
        system_prompt: document.getElementById('system-prompt').value,
        session_id: sessionId,
        model: document.getElementById('model-select').value || undefined
    });
    input.value = '';
    updateStats();
}

function startMic(mode) { postCommand('startMic', { mode }); }
function stopMic() { postCommand('stopMic'); }
function newChat() {
    sessionId = 'test-' + Date.now();
    msgCount = 0; voiceCount = 0;
    document.getElementById('chat-messages').innerHTML = '';
    updateStats();
    log('New session: ' + sessionId, 'info');
}
function exportChat() {
    const msgs = document.getElementById('chat-messages').innerText;
    const blob = new Blob([msgs], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `surf-chat-${sessionId}.txt`;
    a.click();
    log('Chat exported', 'info');
}
function upgrade(plan) {
    log(`Upgrade: ${plan} (Stripe not connected)`, 'info');
    addMessage('system', `💎 Upgrade to ${plan} — coming soon`);
}

// ── Auth ───────────────────────────────────────────────────────────

async function login() {
    if (!supabaseUrl || !supabaseAnon) {
        log('Config not received yet — wait for sandbox_ready', 'error');
        return;
    }
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    log(`Login: ${email}`, 'info');
    try {
        const r = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': supabaseAnon },
            body: JSON.stringify({ email, password })
        });
        if (r.ok) {
            jwt = (await r.json()).access_token;
            sandbox.contentWindow.postMessage({ type: 'auth_token', token: jwt, email }, SANDBOX_URL);
            log('JWT sent', 'info');
        } else {
            log('Auth failed', 'error');
        }
    } catch (e) { log('Auth error: ' + e.message, 'error'); }
}

function loginOAuth(provider) {
    log(`OAuth: ${provider} (redirect required)`, 'info');
}

// ── UI ─────────────────────────────────────────────────────────────

function addMessage(role, text) {
    const c = document.getElementById('chat-messages');
    const d = document.createElement('div');
    d.className = `chat-msg chat-${role}`;
    d.textContent = text;
    c.appendChild(d);
    c.scrollTop = c.scrollHeight;
}
function appendToLastAI(token) {
    const last = document.querySelector('#chat-messages .chat-ai:last-child');
    if (last) last.textContent += token;
    else addMessage('ai', token);
}
function enableChat() {
    document.getElementById('message-input').disabled = false;
    document.getElementById('send-btn').disabled = false;
}
function updateConnection(on) {
    const el = document.getElementById('conn-status');
    el.textContent = on ? '🟢 Connected' : '🔴 Disconnected';
    el.className = 'conn-status' + (on ? ' connected' : '');
}
function updateStats() {
    document.getElementById('session-id-display').textContent = 'Session: ' + sessionId;
    document.getElementById('msg-count').textContent = 'Messages: ' + msgCount;
    document.getElementById('voice-count').textContent = 'Voice: ' + voiceCount;
}

// ── Init ───────────────────────────────────────────────────────────

log('Dashboard loaded', 'info');
log('Sandbox: ' + SANDBOX_URL, 'info');
updateStats();