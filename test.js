// Surf AI — Sandbox Test Page (Working Version)
const SANDBOX_URL = 'https://sb-sf.vercel.app';
let supabaseUrl = '', supabaseAnon = '', jwt = null;
let msgCount = 0, sessionId = 'test-' + Date.now();

const log = (msg, type = 'info') => {
    const el = document.getElementById('chat-log');
    const time = new Date().toLocaleTimeString();
    el.innerHTML += `<div class="chat-msg log-${type}">[${time}] ${msg}</div>`;
    el.scrollTop = el.scrollHeight;
};

// Update connection UI
function updateConnection(connected) {
    const dot = document.getElementById('conn-dot');
    const text = document.getElementById('conn-text');
    if (dot) dot.className = 'status-dot ' + (connected ? 'dot-green' : 'dot-red');
    if (text) text.textContent = connected ? 'Connected' : 'Disconnected';
}

// Message handler - THIS IS THE KEY FIX
window.addEventListener('message', (e) => {
    console.log('📨 Test page received:', e.origin, e.data);
    const msg = e.data;
    
    if (msg?.type === 'sandbox_ready') {
        console.log('✅ Sandbox is ready!');
        updateConnection(true);
        document.getElementById('auth-status').textContent = 'Sandbox ready';
        
        if (msg.config) {
            supabaseUrl = msg.config.SUPABASE_URL;
            supabaseAnon = msg.config.SUPABASE_ANON_KEY;
            log('Config loaded from sandbox', 'info');
        }
    }
    
    if (msg?.type === 'response') {
        msgCount++;
        log(msg.text, 'ai');
        updateStats();
    }
    
    if (msg?.type === 'transcript') {
        msgCount++;
        log('🎤 ' + msg.text, 'out');
        updateStats();
    }
    
    if (msg?.type === 'error') {
        log(`ERROR: ${msg.message}`, 'error');
    }
});

function postCommand(action, params = {}) {
    const iframe = document.getElementById('sandbox');
    if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'extension_command', action, ...params }, SANDBOX_URL);
        log(`→ ${action}`, 'out');
    }
}

function sendText() {
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    if (!text) return;
    log(text, 'user');
    msgCount++;
    postCommand('sendText', { text, session_id: sessionId });
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

async function login() {
    if (!supabaseUrl) {
        log('Waiting for sandbox config...', 'error');
        return;
    }
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    log(`Logging in: ${email}`, 'info');
    try {
        const r = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': supabaseAnon },
            body: JSON.stringify({ email, password })
        });
        if (r.ok) {
            jwt = (await r.json()).access_token;
            document.getElementById('sandbox').contentWindow.postMessage({ type: 'auth_token', token: jwt }, SANDBOX_URL);
            log('✅ JWT sent', 'info');
        } else {
            log('Auth failed', 'error');
        }
    } catch (e) { log('Auth error: ' + e.message, 'error'); }
}

function updateStats() {
    document.getElementById('session-status').textContent = 'Session: ' + sessionId;
    document.getElementById('msg-count').textContent = 'Messages: ' + msgCount;
}

function enableChat() {
    document.getElementById('message-input').disabled = false;
    document.getElementById('send-btn').disabled = false;
}

log('Test page loaded - waiting for sandbox...', 'info');
updateStats();
