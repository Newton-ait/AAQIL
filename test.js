// Surf AI — Sandbox Test Page (Full Featured)
const SANDBOX_URL = 'https://sb-sf.vercel.app';
let supabaseUrl = '', supabaseAnon = '', jwt = null;
let msgCount = 0, sessionId = 'test-' + Date.now();

// Load saved preferences
const savedMode = localStorage.getItem('sttMode') || 'cloud';
const savedVoice = localStorage.getItem('voice') || 'en-US-AriaNeural';

// DOM elements
const log = (msg, type = 'info') => {
    const el = document.getElementById('chat-log');
    const time = new Date().toLocaleTimeString();
    const icon = type === 'ai' ? '🤖' : type === 'user' ? '👤' : type === 'error' ? '❌' : '📝';
    el.innerHTML += `<div class="chat-msg log-${type}">${icon} [${time}] ${msg}</div>`;
    el.scrollTop = el.scrollHeight;
};

// Update connection UI
function updateConnection(connected) {
    const dot = document.getElementById('conn-dot');
    const text = document.getElementById('conn-text');
    if (dot) dot.className = 'status-dot ' + (connected ? 'dot-green' : 'dot-red');
    if (text) text.textContent = connected ? 'Connected' : 'Disconnected';
}

// Save session to localStorage
function saveSession() {
    if (jwt) {
        localStorage.setItem('surf_jwt', jwt);
        localStorage.setItem('surf_session_id', sessionId);
        localStorage.setItem('surf_msg_count', msgCount);
    }
}

// Restore session
function restoreSession() {
    const savedJwt = localStorage.getItem('surf_jwt');
    const savedSessionId = localStorage.getItem('surf_session_id');
    const savedMsgCount = localStorage.getItem('surf_msg_count');
    
    if (savedJwt && savedSessionId) {
        jwt = savedJwt;
        sessionId = savedSessionId;
        msgCount = parseInt(savedMsgCount) || 0;
        updateStats();
        log('Session restored', 'info');
        
        // Re-send JWT to sandbox
        const iframe = document.getElementById('sandbox');
        if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage({ type: 'auth_token', token: jwt }, SANDBOX_URL);
            log('JWT resent to sandbox', 'info');
        }
        enableChat();
        return true;
    }
    return false;
}

// Save STT mode preference
function saveSTTMode(mode) {
    localStorage.setItem('sttMode', mode);
    log(`STT mode saved: ${mode}`, 'info');
}

// Message handler
window.addEventListener('message', (e) => {
    console.log('📨 Test page received:', e.origin, e.data);
    const msg = e.data;
    
    if (msg?.type === 'sandbox_ready') {
        console.log('✅ Sandbox ready!');
        updateConnection(true);
        document.getElementById('auth-status').textContent = 'Sandbox ready';
        if (msg.config) {
            supabaseUrl = msg.config.SUPABASE_URL;
            supabaseAnon = msg.config.SUPABASE_ANON_KEY;
            log('Config loaded from sandbox', 'info');
        }
        // Restore session after sandbox is ready
        setTimeout(() => restoreSession(), 500);
    }
    
    if (msg?.type === 'response') {
        msgCount++;
        // Format AI response nicely
        let responseText = msg.text;
        // Try to parse as JSON for structured responses
        try {
            const parsed = JSON.parse(msg.text);
            if (parsed.response) responseText = parsed.response;
            if (parsed.message) responseText = parsed.message;
        } catch(e) {}
        log(responseText, 'ai');
        updateStats();
        saveSession();
    }
    
    if (msg?.type === 'transcript') {
        msgCount++;
        log(msg.text, 'user');
        updateStats();
    }
    
    if (msg?.type === 'token_received') {
        log('✅ Token confirmed by sandbox', 'info');
        setTimeout(() => enableChat(), 100);
        saveSession();
    }
    
    if (msg?.type === 'stt_mode_changed') {
        document.getElementById('privacy-toggle').checked = msg.mode === 'local';
        saveSTTMode(msg.mode);
        log(`Privacy mode: ${msg.mode === 'local' ? 'Local (on-device)' : 'Cloud'}`, 'info');
    }
    
    if (msg?.type === 'stt_error') {
        log(`STT Error: ${msg.message}. Falling back to cloud.`, 'error');
        if (msg.fallback === 'cloud') {
            document.getElementById('privacy-toggle').checked = false;
            saveSTTMode('cloud');
        }
    }
    
    if (msg?.type === 'download_progress') {
        log(`📥 Downloading privacy model: ${msg.percent}%`, 'info');
    }
    
    if (msg?.type === 'download_complete') {
        log('✅ Privacy mode ready (local STT)', 'info');
    }
    
    if (msg?.type === 'error') {
        log(`ERROR: ${msg.message}`, 'error');
        if (msg.code === 403) {
            log('Try logging in again', 'error');
        }
    }
    
    if (msg?.type === 'vad') {
        const status = msg.speaking ? '🔴 Speaking...' : '⚪ Listening';
        document.getElementById('vad-status').textContent = status;
    }
});

function postCommand(action, params = {}) {
    const iframe = document.getElementById('sandbox');
    if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'extension_command', action, ...params }, SANDBOX_URL);
        log(`→ ${action}`, 'out');
    } else {
        log('Sandbox not ready', 'error');
    }
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
        model: document.getElementById('model-select').value || undefined,
        voice: document.getElementById('voice-select').value || undefined
    });
    input.value = '';
    updateStats();
    saveSession();
}

function startMic(mode) { 
    postCommand('startMic', { mode });
    log(`🎤 Starting microphone (${mode.toUpperCase()} mode)...`, 'info');
}
function stopMic() { postCommand('stopMic'); log('⏹️ Microphone stopped', 'info'); }
function getStatus() { postCommand('getStatus'); }
function togglePrivacy() {
    const mode = document.getElementById('privacy-toggle').checked ? 'local' : 'cloud';
    postCommand('setSTTMode', { mode });
    saveSTTMode(mode);
}
function newChat() {
    sessionId = 'test-' + Date.now();
    msgCount = 0;
    document.getElementById('chat-log').innerHTML = '';
    updateStats();
    log('🔄 New session started', 'info');
    saveSession();
}

async function login() {
    if (!supabaseUrl) {
        log('Waiting for sandbox config...', 'error');
        return;
    }
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    log(`Logging in as: ${email}`, 'info');
    try {
        const r = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': supabaseAnon },
            body: JSON.stringify({ email, password })
        });
        if (r.ok) {
            const data = await r.json();
            jwt = data.access_token;
            document.getElementById('sandbox').contentWindow.postMessage({ type: 'auth_token', token: jwt }, SANDBOX_URL);
            log('✅ JWT sent to sandbox', 'info');
            saveSession();
        } else {
            const error = await r.text();
            log(`Auth failed: ${error}`, 'error');
        }
    } catch (e) { 
        log(`Auth error: ${e.message}`, 'error'); 
    }
}

function enableChat() {
    document.getElementById('message-input').disabled = false;
    document.getElementById('send-btn').disabled = false;
    log('Chat ready - type a message or use voice', 'info');
}

function updateStats() {
    document.getElementById('session-status').textContent = 'Session: ' + sessionId;
    document.getElementById('msg-count').textContent = 'Messages: ' + msgCount;
}

// Initialize UI
log('Test page loaded - waiting for sandbox...', 'info');
updateStats();

// Set saved STT mode on load
setTimeout(() => {
    if (savedMode === 'local') {
        document.getElementById('privacy-toggle').checked = true;
        postCommand('setSTTMode', { mode: 'local' });
    }
}, 1000);
