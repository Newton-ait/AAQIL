'use strict';

const GATEWAY_URL = 'https://surf-gateway.onrender.com';
const SERVICE_PIN = 'ndu2026';

let socket = null;
let device = null;
let producerTransport = null;
let audioProducer = null;
let localStream = null;
let isConnected = false;
let mediaRecorder = null;
let chunkInterval = null;
let audioBuffer = [];

// VAD settings
let isSpeaking = false;
let silenceTimer = null;
const SILENCE_THRESHOLD = 1.5;

// Audio context for VAD
let audioContext = null;
let analyser = null;

// ═══════════════════════════════════════════════════════════════════
// POST MESSAGE TO EXTENSION
// ═══════════════════════════════════════════════════════════════════

function postMessage(data) {
    if (window.parent && window.parent !== window) {
        window.parent.postMessage(data, '*');
    }
}

function updateStatus(text) {
    document.getElementById('status').textContent = `⚡ ${text}`;
    postMessage({ type: 'status', text: text });
}

function log(message, type = 'info') {
    console.log(`[Sandbox] ${message}`);
    postMessage({ type: 'log', level: type, message: message });
}

// ═══════════════════════════════════════════════════════════════════
// TTS PLAYBACK
// ═══════════════════════════════════════════════════════════════════

function playTTSAudio(encodedAudio) {
    try {
        let bytes;
        if (encodedAudio.match(/^[0-9a-f]+$/i)) {
            bytes = new Uint8Array(encodedAudio.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
        } else {
            const binaryString = atob(encodedAudio);
            bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
        }
        
        const blob = new Blob([bytes], { type: 'audio/mp3' });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => URL.revokeObjectURL(url);
        audio.play();
        
        postMessage({ type: 'tts_playing' });
    } catch (e) {
        log('TTS error: ' + e.message, 'error');
    }
}

// ═══════════════════════════════════════════════════════════════════
// VAD (Voice Activity Detection)
// ═══════════════════════════════════════════════════════════════════

function startVAD(stream) {
    if (audioContext) audioContext.close();
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 64;
    source.connect(analyser);
    
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    function checkAudio() {
        if (!isConnected) return;
        
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        const isTalking = average > 10;
        
        if (isTalking && !isSpeaking) {
            isSpeaking = true;
            postMessage({ type: 'vad', speaking: true });
            if (silenceTimer) {
                clearTimeout(silenceTimer);
                silenceTimer = null;
            }
        } else if (!isTalking && isSpeaking) {
            if (!silenceTimer) {
                silenceTimer = setTimeout(() => {
                    isSpeaking = false;
                    silenceTimer = null;
                    postMessage({ type: 'vad', speaking: false });
                    sendAccumulatedAudio();
                }, SILENCE_THRESHOLD * 1000);
            }
        }
        
        requestAnimationFrame(checkAudio);
    }
    
    checkAudio();
}

function stopVAD() {
    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }
    if (silenceTimer) {
        clearTimeout(silenceTimer);
        silenceTimer = null;
    }
    isSpeaking = false;
}

// ═══════════════════════════════════════════════════════════════════
// REST CHUNKING (Fallback)
// ═══════════════════════════════════════════════════════════════════

function sendAccumulatedAudio() {
    if (audioBuffer.length === 0) return;
    
    const blob = new Blob(audioBuffer, { type: 'audio/webm' });
    sendChunkToREST(blob);
    audioBuffer = [];
    log('Sent after silence', 'info');
}

async function sendChunkToREST(audioBlob) {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'chunk.webm');
    formData.append('voice', 'en-US-AriaNeural');
    
    try {
        const res = await fetch(`${GATEWAY_URL}/voice`, {
            method: 'POST',
            headers: { 'x-pin': SERVICE_PIN },
            body: formData
        });
        
        const data = await res.json();
        if (data.transcript) {
            log('📝 ' + data.transcript);
            postMessage({ type: 'transcript', text: data.transcript });
        }
        if (data.response) {
            log('🤖 ' + data.response);
            postMessage({ type: 'response', text: data.response });
        }
        if (data.audio_base64) {
            playTTSAudio(data.audio_base64);
        }
    } catch (e) {
        log('REST error: ' + e.message, 'error');
    }
}

function startRESTRecording(stream) {
    audioBuffer = [];
    
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    
    mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
            audioBuffer.push(e.data);
        }
    };
    
    mediaRecorder.start(1000);
    
    chunkInterval = setInterval(() => {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.requestData();
        }
    }, 1000);
    
    startVAD(stream);
}

function stopRESTRecording() {
    if (chunkInterval) {
        clearInterval(chunkInterval);
        chunkInterval = null;
    }
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        mediaRecorder = null;
    }
    stopVAD();
    audioBuffer = [];
}

// ═══════════════════════════════════════════════════════════════════
// MEDIASOUP WEBRTC (SFU Mode)
// ═══════════════════════════════════════════════════════════════════

async function requestRouterCapabilities() {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout')), 10000);
        
        socket.on('routerRtpCapabilities', (caps) => {
            clearTimeout(timeout);
            if (caps?.error) reject(new Error(caps.error));
            else resolve(caps);
        });
        
        socket.emit('getRouterRtpCapabilities');
    });
}

async function createProducerTransport() {
    return new Promise((resolve, reject) => {
        socket.emit('createProducerTransport', (response) => {
            if (response?.error) reject(new Error(response.error));
            else resolve(response);
        });
    });
}

async function connectMediasoup() {
    socket = io(GATEWAY_URL, { transports: ['websocket'] });
    
    socket.on('connect', async () => {
        log('✅ Gateway connected', 'success');
        updateStatus('Gateway Connected');
        
        try {
            // Get router capabilities
            const caps = await requestRouterCapabilities();
            device = new mediasoupClient.Device();
            await device.load({ routerRtpCapabilities: caps });
            log('📡 SFU ready', 'success');
            
            // Get microphone
            localStream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
            });
            log('🎤 Mic: ' + localStream.getAudioTracks()[0].label);
            
            // Create producer transport
            const transportInfo = await createProducerTransport();
            producerTransport = device.createSendTransport({
                id: transportInfo.id,
                iceParameters: transportInfo.iceParameters,
                iceCandidates: transportInfo.iceCandidates,
                dtlsParameters: transportInfo.dtlsParameters
            });
            
            producerTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
                socket.emit('connectProducerTransport', { dtlsParameters }, (res) => {
                    if (res?.error) errback(new Error(res.error));
                    else callback();
                });
            });
            
            producerTransport.on('produce', ({ kind, rtpParameters }, callback, errback) => {
                socket.emit('produce', { kind, rtpParameters }, (res) => {
                    if (res?.error) errback(new Error(res.error));
                    else callback({ id: res.id });
                });
            });
            
            producerTransport.on('connectionstatechange', (state) => {
                log('Transport: ' + state);
                if (state === 'connected') {
                    updateStatus('SFU Streaming');
                    postMessage({ type: 'streaming', mode: 'sfu' });
                }
            });
            
            // Produce audio
            audioProducer = await producerTransport.produce({
                track: localStream.getAudioTracks()[0],
                codecOptions: { opusStereo: false, opusDtx: true, opusFec: true }
            });
            
            log('🎤 Producer created', 'success');
            isConnected = true;
            
        } catch (e) {
            log('SFU failed: ' + e.message, 'error');
            updateStatus('Falling back to REST');
            // Fallback to REST mode
            await startRESTMode();
        }
    });
    
    socket.on('connect_error', (e) => {
        log('Connection error: ' + e.message, 'error');
        updateStatus('REST Mode');
        startRESTMode();
    });
    
    socket.on('tts_audio', (data) => {
        if (data?.audio) playTTSAudio(data.audio);
        if (data?.transcript) postMessage({ type: 'transcript', text: data.transcript });
        if (data?.response) postMessage({ type: 'response', text: data.response });
    });
    
    socket.on('disconnect', () => {
        log('Gateway disconnected', 'info');
        isConnected = false;
        updateStatus('Disconnected');
    });
}

async function startRESTMode() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        
        startRESTRecording(localStream);
        isConnected = true;
        updateStatus('REST Recording');
        postMessage({ type: 'streaming', mode: 'rest' });
        
        log('🎤 REST mode active', 'success');
    } catch (e) {
        log('REST mode failed: ' + e.message, 'error');
        postMessage({ type: 'error', message: e.message });
    }
}

function disconnect() {
    isConnected = false;
    
    // Stop SFU
    if (audioProducer) {
        audioProducer.close();
        audioProducer = null;
    }
    if (producerTransport) {
        producerTransport.close();
        producerTransport = null;
    }
    if (socket) {
        socket.disconnect();
        socket = null;
    }
    
    // Stop REST
    stopRESTRecording();
    
    if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
        localStream = null;
    }
    
    device = null;
    updateStatus('Ready');
    postMessage({ type: 'disconnected' });
}

// ═══════════════════════════════════════════════════════════════════
// MESSAGE HANDLER FROM EXTENSION
// ═══════════════════════════════════════════════════════════════════

window.addEventListener('message', (event) => {
    const msg = event.data;
    
    if (msg.type === 'start_mic') {
        log('Starting mic...');
        connectMediasoup();
    } else if (msg.type === 'stop_mic') {
        log('Stopping mic...');
        disconnect();
    } else if (msg.type === 'ping') {
        postMessage({ type: 'pong', timestamp: Date.now() });
    }
});

// ═══════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════

log('Sandbox ready');
updateStatus('Ready');

// Notify extension that sandbox is loaded
postMessage({ type: 'sandbox_ready' });