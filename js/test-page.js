// Surf AI — Sandbox Test Page
// postMessage protocol test harness

const SANDBOX_URL = 'https://sb-sf.vercel.app';
const SUPABASE_URL = 'https://ljksgzttnufecxohwtwm.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxqa3NnenR0bnVmZWN4b2h3dHdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTc1NzQsImV4cCI6MjA5MTc3MzU3NH0.jSnVFEe6w-fUA39iD7o9BP0EygB7yejofuU4GUbK6Bk';

let jwt = null;
let sessionReady = false;
let email = '';

// ── Sandbox iframe ─────────────────────────────────────────────────

const sandbox = document.getElementById('sandbox-iframe');

// ── Debug log ──────────────────────────────────────────────────────

function log(msg, type = 'info') {
    const logEl = document.getElementById('debug-log');
    const time = new Date().toLocaleTimeString();
    const cssClass = `log-${type}`;
    logEl.innerHTML += `<div class="log-line ${cssClass}">[${time}] ${msg}</div>`;
    logEl.scrollTop = logEl.scrollHeight;
}

// ── postMessage handler ────────────────────────────────────────────

window.addEventListener('message', (e) => {
    if (!e.origin.includes('sb-sf.vercel.app')) return;
    
    const msg = e.data;
    log(`← ${msg.type}${msg.action ? ':' + msg.action : ''} ${JSON.stringify(msg).substring(0, 120)}`, 'in');
    
    switch (msg.type) {
        case 'sandbox_ready':
            log('Sandbox ready — send auth token', 'info');
            updateStatus('Sandbox ready');
            break;
            
        case 'token_received':
            log('JWT accepted', 'info');
            updateStatus('Token received');
            break;
            
        case 'session_ready':
            sessionReady = true;
            log('Session ready — can send commands', 'info');
            updateStatus('Session ready ✅');
            enableChat();
            break;
            
        case 'session_expired':
            log('Session expired — recovering...', 'error');
            updateStatus('Session expired');
            break;
            
        case 'response':
            addMessage('ai', msg.text);
            break;
            
        case 'response_token':
            // Streaming — append to last AI message
            appendToLastAI(msg.token);
            break;
            
        case 'transcript':
            addMessage('user', '🎤 ' + msg.text);
            break;
            
        case 'streaming':
            log(`Mic: ${msg.mode}`, 'info');
            break;
            
        case 'vad_status':
            log(`VAD: ${msg.phase}`, 'info');
            break;
            
        case 'error':
            log(`ERROR: ${msg.code} — ${msg.message}`, 'error');
            addMessage('system', `⚠️ ${msg.message}`);
            break;
            
        case 'voices':
            populateVoiceSelect(msg.voices);
            break;
            
        case 'models':
            populateModelSelect(msg.models);
            break;
            
        case 'notes_updated':
            log(`Notes synced: ${msg.notes?.length || 0} notes`, 'info');
            break;
            
        case 'settings_updated':
            log('Settings updated', 'info');
            break;
            
        case 'sandbox_status':
            log(`Status: active=${msg.isActive}, ready=${msg.sandboxReady}, session=${msg.sessionReady}`, 'info');
            break;
            
        case 'pong':
            log('Pong received', 'info');
            break;
    }
});

// ── Commands ───────────────────────────────────────────────────────

function postCommand(action, params = {}) {
    const msg = { type: 'extension_command', action, ...params };
    log(`→ ${action} ${JSON.stringify(params).substring(0, 80)}`, 'out');
    sandbox.contentWindow.postMessage(msg, SANDBOX_URL);
}

function sendText() {
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    if (!text) return;
    
    addMessage('user', text);
    postCommand('sendText', {
        text,
        system_prompt: document.getElementById('system-prompt').value,
        session_id: 'test-' + Date.now(),
        model: document.getElementById('model-select').value || undefined
    });
    input.value = '';
}

function startMic(mode) {
    postCommand('startMic', { mode });
}

function stopMic() {
    postCommand('stopMic');
}

function setVoice(voice) {
    if (voice) postCommand('setVoice', { voice });
}

function setModel(model) {
    // Model is sent with each sendText — stored in selector
}

function getStatus() {
    postCommand('getStatus');
}

function getNotes() {
    postCommand('getNotes');
}

// ── Auth ───────────────────────────────────────────────────────────

async function login() {
    email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    log(`Logging in as ${email}...`, 'info');
    
    try {
        const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_ANON
            },
            body: JSON.stringify({ email, password })
        });
        
        if (r.ok) {
            const data = await r.json();
            jwt = data.access_token;
            log('JWT obtained', 'info');
            
            // Send to sandbox
            sandbox.contentWindow.postMessage({
                type: 'auth_token',
                token: jwt,
                email: email
            }, SANDBOX_URL);
            
            updateStatus('Auth token sent');
        } else {
            const err = await r.json();
            log(`Auth failed: ${err.error_description || err.message}`, 'error');
        }
    } catch (e) {
        log(`Auth error: ${e.message}`, 'error');
    }
}

// ── UI Helpers ─────────────────────────────────────────────────────

function addMessage(role, text) {
    const container = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = `chat-msg chat-${role}`;
    div.textContent = text;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function appendToLastAI(token) {
    const container = document.getElementById('chat-messages');
    const lastMsg = container.querySelector('.chat-ai:last-child');
    if (lastMsg) {
        lastMsg.textContent += token;
    } else {
        addMessage('ai', token);
    }
    container.scrollTop = container.scrollHeight;
}

function updateStatus(text) {
    document.getElementById('session-status').textContent = 'Status: ' + text;
}

function enableChat() {
    document.getElementById('message-input').disabled = false;
    document.getElementById('send-btn').disabled = false;
}

function populateModelSelect(models) {
    const select = document.getElementById('model-select');
    select.innerHTML = '<option value="">Model: Default</option>';
    if (models && Array.isArray(models)) {
        models.forEach(m => {
            select.innerHTML += `<option value="${m.id || m.name}">${m.name || m.id}</option>`;
        });
    }
}

function populateVoiceSelect(voices) {
    const select = document.getElementById('voice-select');
    select.innerHTML = '<option value="">Voice: Default</option>';
    if (voices && Array.isArray(voices)) {
        voices.forEach(v => {
            select.innerHTML += `<option value="${v.id || v}">${v.name || v}</option>`;
        });
    }
}

// ── Init ───────────────────────────────────────────────────────────

log('Test page loaded', 'info');
log(`Sandbox URL: ${SANDBOX_URL}`, 'info');