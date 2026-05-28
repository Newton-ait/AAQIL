// Surf AI — Sandbox Test Page (Complete Working Version)

const SANDBOX_URL = 'https://sb-sf.vercel.app';
let supabaseUrl = '', supabaseAnon = '', jwt = null;
let msgCount = 0, sessionId = 'test-' + Date.now();

// DOM Elements
const chatLog = document.getElementById('chat-log');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const connDot = document.getElementById('conn-dot');
const connText = document.getElementById('conn-text');
const msgCountSpan = document.getElementById('msg-count');
const authStatus = document.getElementById('auth-status');
const voiceLed = document.getElementById('voice-led');
const voiceStatusText = document.getElementById('voice-status-text');
const sttBadge = document.getElementById('stt-badge');
const privacyToggle = document.getElementById('privacy-toggle');

// Load saved preferences
const savedMode = localStorage.getItem('sttMode') || 'cloud';

// Log message to chat
function log(msg, type = 'system') {
    const div = document.createElement('div');
    div.className = `message ${type}`;
    const time = new Date().toLocaleTimeString();
    let icon = '';
    if (type === 'user') icon = '👤 ';
    else if (type === 'ai') icon = '🤖 ';
    else if (type === 'error') icon = '❌ ';
    else icon = '📝 ';
    div.innerHTML = `<span style="font-size: 10px; opacity: 0.6;">[${time}]</span> ${icon}${msg}`;
    chatLog.appendChild(div);
    div.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

// Update connection UI
function updateConnection(connected) {
    if (connected) {
        connDot.className = 'status-dot dot-green';
        connText.textContent = 'Connected';
    } else {
        connDot.className = 'status-dot dot-red';
        connText.textContent = 'Disconnected';
    }
}

// Update stats
function updateStats() {
    msgCountSpan.textContent = msgCount;
}

// Enable chat
function enableChat() {
    messageInput.disabled = false;
    sendBtn.disabled = false;
    log('Chat ready - type a message or use voice', 'system');
}

// Send command to sandbox
function postCommand(action, params = {}) {
    const iframe = document.getElementById('sandbox');
    if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'extension_command', action, ...params }, SANDBOX_URL);
    }
}

// Send text message
function sendText() {
    const text = messageInput.value.trim();
    if (!text) return;
    log(text, 'user');
    msgCount++;
    postCommand('sendText', { text, session_id: sessionId });
    messageInput.value = '';
    updateStats();
}

// Quick message buttons
function sendQuick(text) {
    messageInput.value = text;
    sendText();
}

// Clear chat
function clearChat() {
    chatLog.innerHTML = '';
    msgCount = 0;
    updateStats();
    log('Chat cleared', 'system');
}

// Export chat
function exportChat() {
    const messages = Array.from(chatLog.children).map(msg => msg.innerText);
    const blob = new Blob([messages.join('\n\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-${sessionId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    log('Chat exported', 'system');
}

// New session
function newChat() {
    sessionId = 'test-' + Date.now();
    msgCount = 0;
    chatLog.innerHTML = '';
    updateStats();
    log('New session started', 'system');
}

// Voice controls
function startMic(mode) {
    postCommand('startMic', { mode });
    log(`Starting microphone (${mode.toUpperCase()} mode)...`, 'system');
}
function stopMic() { 
    postCommand('stopMic'); 
    log('Microphone stopped', 'system');
}
function getStatus() { 
    postCommand('getStatus'); 
}

// Privacy toggle
function togglePrivacy() {
    const mode = privacyToggle.checked ? 'local' : 'cloud';
    postCommand('setSTTMode', { mode });
    if (mode === 'local') {
        sttBadge.className = 'stt-badge local';
        sttBadge.innerHTML = '🔒 Local Mode';
    } else {
        sttBadge.className = 'stt-badge cloud';
        sttBadge.innerHTML = '☁️ Cloud Mode';
    }
    localStorage.setItem('sttMode', mode);
    log(`STT mode saved: ${mode}`, 'system');
}

// File upload

// File upload - route through sandbox iframe
async function uploadFile(file) {
    if (!file || !jwt) {
        log('Please login first', 'error');
        return;
    }
    log(`Uploading: ${file.name}`, 'system');
    
    // Send to sandbox via postMessage
    const reader = new FileReader();
    reader.onload = function(e) {
        const base64 = e.target.result.split(',')[1];
        postCommand('uploadFile', {
            filename: file.name,
            content: base64,
            type: file.type
        });
    };
    reader.readAsDataURL(file);
}


// Login
async function login() {
    if (!supabaseUrl) {
        log('Waiting for sandbox config...', 'error');
        return;
    }
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    log(`Logging in as: ${email}`, 'system');
    try {
        const r = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json',
                'X-Sandbox-Origin': 'https://sb-sf.vercel.app', 'apikey': supabaseAnon },
            body: JSON.stringify({ email, password })
        });
        if (r.ok) {
            const data = await r.json();
            jwt = data.access_token;
            document.getElementById('sandbox').contentWindow.postMessage({ type: 'auth_token', token: jwt }, SANDBOX_URL);
            log('JWT sent to sandbox', 'system');
    // Enable chat after JWT sent
    setTimeout(() => { enableChat(); }, 1000);
            document.getElementById('user-email').textContent = email;
        } else {
            log('Auth failed', 'error');
        }
    } catch (e) { 
        log(`Auth error: ${e.message}`, 'error'); 
    }
}

// Voice indicator update
function updateVoiceIndicator(speaking, mode) {
    if (speaking) {
        voiceLed.className = 'voice-led speaking';
        voiceStatusText.textContent = '🔴 Speaking...';
    } else if (mode === 'listening') {
        voiceLed.className = 'voice-led listening';
        voiceStatusText.textContent = '🟢 Listening...';
    } else {
        voiceLed.className = 'voice-led idle';
        voiceStatusText.textContent = 'Ready';
    }
}

// Message handler
window.addEventListener('message', (e) => {
    console.log('📨 Received:', e.origin, e.data);
    const msg = e.data;
    
    if (msg?.type === 'sandbox_ready') {
        log('Sandbox ready', 'system');
        updateConnection(true);
        authStatus.textContent = 'Sandbox ready';
        if (msg.config) {
            supabaseUrl = msg.config.SUPABASE_URL;
            supabaseAnon = msg.config.SUPABASE_ANON_KEY;
        }
    }
    
    if (msg?.type === 'response') {
        msgCount++;
        log(msg.text, 'ai');
        updateStats();
    }
    
    if (msg?.type === 'transcript') {
        msgCount++;
        log(msg.text, 'user');
        updateStats();
    }
    
    if (msg?.type === 'token_received') {
        log('Token confirmed', 'system');
        console.log('token_received - enabling chat');
        enableChat();
        // Also force enable after 1 second as fallback
        setTimeout(() => {
            if (messageInput.disabled) {
                console.log('Force enabling chat');
                messageInput.disabled = false;
                sendBtn.disabled = false;
            }
        }, 500);
    }
    
    if (msg?.type === 'stt_mode_changed') {
        privacyToggle.checked = msg.mode === 'local';
        if (msg.mode === 'local') {
            sttBadge.className = 'stt-badge local';
            sttBadge.innerHTML = '🔒 Local Mode';
        } else {
            sttBadge.className = 'stt-badge cloud';
            sttBadge.innerHTML = '☁️ Cloud Mode';
        }
    }
    
    if (msg?.type === 'vad') {
        updateVoiceIndicator(msg.speaking, msg.speaking ? 'speaking' : 'listening');
    }
    
    if (msg?.type === 'error') {
        log(`Error: ${msg.message}`, 'error');
    }
});

// Initialize upload area
function initUpload() {
    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('file-input');
    
    if (uploadArea) {
        uploadArea.addEventListener('click', () => fileInput?.click());
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('drag-over');
        });
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('drag-over');
        });
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file) uploadFile(file);
        });
    }
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files[0]) uploadFile(e.target.files[0]);
        });
    }
}

// Theme toggle
function initTheme() {
    const themeSelect = document.getElementById('theme-select');
    if (themeSelect) {
        const savedTheme = localStorage.getItem('theme') || 'dark';
        themeSelect.value = savedTheme;
        document.body.className = savedTheme;
        themeSelect.addEventListener('change', () => {
            const theme = themeSelect.value;
            document.body.className = theme;
            localStorage.setItem('theme', theme);
        });
    }
}

// Voice select
function initVoice() {
    const voiceSelect = document.getElementById('voice-select');
    if (voiceSelect) {
        voiceSelect.addEventListener('change', () => {
            postCommand('set_voice', { voice: voiceSelect.value });
        });
    }
}

// Initialize
log('Test page loaded', 'system');
updateStats();
initUpload();
initTheme();
initVoice();

// Make functions global for HTML buttons
window.sendQuick = sendQuick;
window.clearChat = clearChat;
window.exportChat = exportChat;
window.newChat = newChat;
window.startMic = startMic;
window.stopMic = stopMic;
window.getStatus = getStatus;
window.togglePrivacy = togglePrivacy;
window.sendText = sendText;
window.login = login;


// FORCE ENABLE CHAT - Direct approach
setTimeout(function() {
    console.log('🔧 FORCE ENABLING CHAT');
    var input = document.getElementById('message-input');
    var btn = document.getElementById('send-btn');
    if (input) {
        input.disabled = false;
        btn.disabled = false;
        console.log('✅ Chat force enabled');
    } else {
        console.log('❌ Elements not found, retrying...');
        setTimeout(function() {
            var input2 = document.getElementById('message-input');
            if (input2) {
                input2.disabled = false;
                document.getElementById('send-btn').disabled = false;
                console.log('✅ Chat force enabled (retry)');
            }
        }, 1000);
    }
}, 500);

// Also enable on any click
document.body.addEventListener('click', function() {
    var input = document.getElementById('message-input');
    if (input && input.disabled) {
        input.disabled = false;
        document.getElementById('send-btn').disabled = false;
        console.log('✅ Chat enabled on click');
    }
});
