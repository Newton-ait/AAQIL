// Surf AI — Sandbox Test Page
const SANDBOX_URL = 'https://sb-sf.vercel.app';

let supabaseUrl = '', supabaseAnon = '', jwt = null, sessionReady = false;
let msgCount = 0, sessionId = 'test-' + Date.now();

const sandbox = document.getElementById('sandbox');
const log = (msg, type = 'info') => {
    const el = document.getElementById('chat-log');
    const time = new Date().toLocaleTimeString();
    el.innerHTML += `<div class="chat-msg log-${type}">[${time}] ${msg}</div>`;
    el.scrollTop = el.scrollHeight;
};

// ── postMessage handler ────────────────────────────────────────────

window.addEventListener('message', (e) => {
    if (!e.origin.includes('sb-sf.vercel.app')) return;
    const msg = e.data;
    log(`← ${msg.type}${msg.action ? ':' + msg.action : ''}`, 'in');

    switch (msg.type) {
        case 'sandbox_ready':
            updateConnection(true);
            document.getElementById('auth-status').textContent = 'Sandbox ready';
            if (msg.config && msg.config.SUPABASE_URL) {
                supabaseUrl = msg.config.SUPABASE_URL;
                supabaseAnon = msg.config.SUPABASE_ANON_KEY;
                log('✅ Config loaded', 'info');
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
            log(msg.text, 'ai');
            updateStats();
            break;
        case 'response_token':
            log(msg.token, 'ai');
            break;
        case 'transcript':
            msgCount++;
            log('🎤 ' + msg.text, 'out');
            updateStats();
            break;
        case 'vad_status':
            log(`VAD: ${msg.phase}`, 'info');
            break;
        case 'error':
            log(`ERROR: ${msg.code} — ${msg.message}`, 'error');
            break;
        case 'voices':
            const vs = document.getElementById('voice-select');
            vs.innerHTML = '<option value="">Voice: Default</option>';
            (msg.voices || []).forEach(v => vs.innerHTML += `<option value="${v.id || v}">${v.name || v}</option>`);
            break;
        case 'models':
            const ms = document.getElementById('model-select');
            ms.innerHTML = '<option value="">Model: Default</option>';
            (msg.models || []).forEach(m => ms.innerHTML += `<option value="${m.id || m.name}">${m.name || m.id}</option>`);
            break;
        case 'sandbox_status':
            log(`Status: active=${msg.isActive}, session=${msg.sessionReady}`, 'info');
            break;
        case 'stt_mode':
        case 'stt_mode_changed':
            document.getElementById('privacy-toggle').checked = msg.mode === 'local';
            break;
        case 'download_progress':
            log(`📥 Model download: ${msg.percent}%`, 'info');
            break;
        case 'download_complete':
            log('✅ Privacy mode ready', 'info');
            break;
        case 'stt_error':
            log(`Privacy error: ${msg.error}`, 'error');
            break;
    }
});

// ── Commands ───────────────────────────────────────────────────────

function postCommand(action, params = {}) {
    sandbox.contentWindow.postMessage({ type: 'extension_command', action, ...params }, SANDBOX_URL);
    log(`→ ${action}`, 'out');
}

function sendText() {
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    if (!text) return;
    log(text, 'user');
    msgCount++;
    postCommand('sendText', {
        text,
        session_id: sessionId,
        model: document.getElementById('model-select').value || undefined
    });
    input.value = '';
    updateStats();
}

function startMic(mode) { postCommand('startMic', { mode }); }
function stopMic() { postCommand('stopMic'); }
function getStatus() { postCommand('getStatus'); }
function togglePrivacy() {
    const mode = document.getElementById('privacy-toggle').checked ? 'local' : 'cloud';
    postCommand('setSTTMode', { mode });
}
function newChat() {
    sessionId = 'test-' + Date.now();
    msgCount = 0;
    document.getElementById('chat-log').innerHTML = '';
    updateStats();
    log('🔄 New session', 'info');
}

// ── Auth ───────────────────────────────────────────────────────────

async function login() {
    if (!supabaseUrl) {
        log('Waiting for sandbox config...', 'error');
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

// ── UI ─────────────────────────────────────────────────────────────

function enableChat() {
    document.getElementById('message-input').disabled = false;
    document.getElementById('send-btn').disabled = false;
}
function updateConnection(on) {
    document.getElementById('conn-dot').className = 'status-dot ' + (on ? 'dot-green' : 'dot-red');
    document.getElementById('conn-text').textContent = on ? 'Connected' : 'Disconnected';
}
function updateStats() {
    document.getElementById('session-status').textContent = 'Session: ' + sessionId;
    document.getElementById('msg-count').textContent = 'Messages: ' + msgCount;
}

// ── Init ───────────────────────────────────────────────────────────

log('Test page loaded', 'info');
updateStats();