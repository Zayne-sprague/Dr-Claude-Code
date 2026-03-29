"""Chat UI server — lightweight web interface for vLLM endpoints."""
from __future__ import annotations

import json
import urllib.request
import urllib.error
from http.server import HTTPServer, BaseHTTPRequestHandler

_CHAT_HTML = r"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Chat — __MODEL_NAME__</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background: #343541; color: #ececf1; height: 100vh;
            display: flex; flex-direction: column;
        }
        .header {
            background: #202123; padding: 12px 20px;
            border-bottom: 1px solid #4d4d4f;
            display: flex; align-items: center; justify-content: space-between;
        }
        .header h1 { font-size: 16px; font-weight: 600; color: #ececf1; }
        .model-name { font-size: 13px; color: #8e8ea0; font-weight: 400; }
        .chat-container {
            flex: 1; overflow-y: auto; padding: 20px;
            display: flex; flex-direction: column;
        }
        .message {
            margin-bottom: 24px; display: flex; gap: 16px; padding: 12px;
            animation: fadeIn 0.3s ease-in;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .message.user { background: transparent; }
        .message.assistant { background: #444654; }
        .message-avatar {
            width: 30px; height: 30px; border-radius: 4px;
            display: flex; align-items: center; justify-content: center;
            flex-shrink: 0; font-weight: 600; font-size: 14px;
        }
        .message.user .message-avatar { background: #5436da; color: white; }
        .message.assistant .message-avatar { background: #10a37f; color: white; }
        .message-content { flex: 1; line-height: 1.6; white-space: pre-wrap; word-wrap: break-word; }
        .input-container { padding: 20px; background: #343541; border-top: 1px solid #4d4d4f; }
        .input-wrapper {
            max-width: 800px; margin: 0 auto; position: relative;
            background: #40414f; border-radius: 12px; box-shadow: 0 0 10px rgba(0,0,0,0.2);
        }
        .message-input {
            width: 100%; padding: 16px 50px 16px 16px; background: transparent;
            border: none; color: #ececf1; font-size: 15px; font-family: inherit;
            resize: none; outline: none; max-height: 200px; min-height: 52px;
        }
        .message-input::placeholder { color: #8e8ea0; }
        .send-button {
            position: absolute; right: 12px; bottom: 12px; width: 32px; height: 32px;
            background: #19c37d; border: none; border-radius: 6px; cursor: pointer;
            display: flex; align-items: center; justify-content: center; transition: background 0.2s;
        }
        .send-button:hover:not(:disabled) { background: #1a9d6e; }
        .send-button:disabled { background: #4d4d4f; cursor: not-allowed; }
        .send-button svg { width: 18px; height: 18px; fill: white; }
        .typing-indicator {
            display: none; align-items: center; gap: 8px;
            color: #8e8ea0; font-size: 14px; padding: 12px; margin-bottom: 16px;
        }
        .typing-indicator.active { display: flex; }
        .typing-dots { display: flex; gap: 4px; }
        .typing-dots span {
            width: 6px; height: 6px; background: #8e8ea0;
            border-radius: 50%; animation: bounce 1.4s infinite ease-in-out;
        }
        .typing-dots span:nth-child(1) { animation-delay: -0.32s; }
        .typing-dots span:nth-child(2) { animation-delay: -0.16s; }
        @keyframes bounce {
            0%, 80%, 100% { transform: scale(0); }
            40% { transform: scale(1); }
        }
        .empty-state {
            flex: 1; display: flex; flex-direction: column;
            align-items: center; justify-content: center; color: #8e8ea0; gap: 16px;
        }
        .empty-state h2 { font-size: 32px; font-weight: 600; color: #ececf1; }
        .empty-state p { font-size: 16px; }
        .chat-container::-webkit-scrollbar { width: 8px; }
        .chat-container::-webkit-scrollbar-track { background: #2a2b32; }
        .chat-container::-webkit-scrollbar-thumb { background: #565869; border-radius: 4px; }
        .chat-container::-webkit-scrollbar-thumb:hover { background: #6e6f7d; }
        .error-message {
            background: #f23c3c; color: white; padding: 12px;
            border-radius: 8px; margin: 12px; animation: fadeIn 0.3s ease-in;
        }
    </style>
</head>
<body>
    <div class="header">
        <div>
            <h1>jtk Chat</h1>
            <div class="model-name">__MODEL_NAME__</div>
        </div>
    </div>
    <div class="chat-container" id="chatContainer">
        <div class="empty-state" id="emptyState">
            <h2>Chat with __MODEL_NAME__</h2>
            <p>Send a message to start the conversation</p>
        </div>
    </div>
    <div class="typing-indicator" id="typingIndicator">
        <div class="typing-dots"><span></span><span></span><span></span></div>
        Thinking...
    </div>
    <div class="input-container">
        <div class="input-wrapper">
            <textarea id="messageInput" class="message-input"
                placeholder="Send a message..." rows="1"></textarea>
            <button id="sendButton" class="send-button">
                <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
            </button>
        </div>
    </div>
    <script>
        const chatContainer = document.getElementById('chatContainer');
        const messageInput = document.getElementById('messageInput');
        const sendButton = document.getElementById('sendButton');
        const typingIndicator = document.getElementById('typingIndicator');
        const emptyState = document.getElementById('emptyState');
        let messages = [];
        let isProcessing = false;

        messageInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 200) + 'px';
        });
        messageInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
        });
        sendButton.addEventListener('click', sendMessage);

        function addMessage(role, content) {
            if (emptyState) emptyState.remove();
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message ' + role;
            const avatar = document.createElement('div');
            avatar.className = 'message-avatar';
            avatar.textContent = role === 'user' ? 'U' : 'A';
            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content';
            contentDiv.textContent = content;
            messageDiv.appendChild(avatar);
            messageDiv.appendChild(contentDiv);
            chatContainer.appendChild(messageDiv);
            scrollToBottom();
            return contentDiv;
        }
        function showError(message) {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'error-message';
            errorDiv.textContent = 'Error: ' + message;
            chatContainer.appendChild(errorDiv);
            scrollToBottom();
        }
        function scrollToBottom() { chatContainer.scrollTop = chatContainer.scrollHeight; }

        async function sendMessage() {
            const content = messageInput.value.trim();
            if (!content || isProcessing) return;
            messages.push({ role: 'user', content: content });
            addMessage('user', content);
            messageInput.value = '';
            messageInput.style.height = 'auto';
            isProcessing = true;
            sendButton.disabled = true;
            messageInput.disabled = true;
            typingIndicator.classList.add('active');
            const assistantContent = addMessage('assistant', '');
            let fullResponse = '';
            try {
                const response = await fetch('/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ messages: messages })
                });
                if (!response.ok) throw new Error('HTTP error! status: ' + response.status);
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    const chunk = decoder.decode(value);
                    const lines = chunk.split('\n');
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const data = line.slice(6);
                            if (data.trim() === '[DONE]') break;
                            try {
                                const parsed = JSON.parse(data);
                                if (parsed.error) { showError(parsed.error); assistantContent.remove(); break; }
                                if (parsed.content) {
                                    fullResponse += parsed.content;
                                    assistantContent.textContent = fullResponse;
                                    scrollToBottom();
                                }
                            } catch (e) {}
                        }
                    }
                }
                messages.push({ role: 'assistant', content: fullResponse });
            } catch (error) {
                console.error('Error:', error);
                showError(error.message);
                assistantContent.remove();
            } finally {
                isProcessing = false;
                sendButton.disabled = false;
                messageInput.disabled = false;
                typingIndicator.classList.remove('active');
                messageInput.focus();
            }
        }
        messageInput.focus();
    </script>
</body>
</html>"""


class _ChatHandler(BaseHTTPRequestHandler):
    """HTTP handler serving chat UI and proxying to vLLM."""

    vllm_base_url: str = ""
    model_name: str = ""

    def do_GET(self) -> None:
        if self.path != "/":
            self.send_error(404)
            return
        html = _CHAT_HTML.replace("__MODEL_NAME__", self.model_name)
        payload = html.encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_POST(self) -> None:
        if self.path != "/chat":
            self.send_error(404)
            return

        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length))
        messages = body.get("messages", [])
        if not messages:
            self.send_error(400, "No messages provided")
            return

        vllm_payload = json.dumps({
            "model": self.model_name,
            "messages": messages,
            "stream": True,
            "temperature": 0.7,
            "max_tokens": 2048,
        }).encode()

        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Accel-Buffering", "no")
        self.end_headers()

        try:
            url = f"{self.vllm_base_url}/v1/chat/completions"
            req = urllib.request.Request(
                url,
                data=vllm_payload,
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": "jtk/1.0",
                },
            )
            with urllib.request.urlopen(req, timeout=120) as resp:
                for raw_line in resp:
                    line = raw_line.decode("utf-8").strip()
                    if not line:
                        continue
                    if line.startswith("data: "):
                        data_str = line[6:]
                        if data_str.strip() == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data_str)
                            if "choices" in chunk and chunk["choices"]:
                                delta = chunk["choices"][0].get("delta", {})
                                content = delta.get("content", "")
                                if content:
                                    sse = f"data: {json.dumps({'content': content})}\n\n"
                                    self.wfile.write(sse.encode())
                                    self.wfile.flush()
                        except json.JSONDecodeError:
                            continue
            self.wfile.write(b"data: [DONE]\n\n")
            self.wfile.flush()
        except urllib.error.URLError as exc:
            msg = f"Error communicating with vLLM: {exc}"
            self.wfile.write(f"data: {json.dumps({'error': msg})}\n\n".encode())
            self.wfile.flush()

    def log_message(self, format: str, *args: object) -> None:
        """Suppress default request logging."""
        pass


def run_chat_server(
    vllm_base_url: str,
    model_name: str,
    host: str = "127.0.0.1",
    port: int = 5000,
) -> None:
    """Start a local chat server that proxies to a vLLM endpoint.

    Parameters
    ----------
    vllm_base_url:
        Base URL of the vLLM server (e.g. ``http://1.2.3.4:8000``).
        Should NOT include ``/v1``.
    model_name:
        Model name displayed in the UI and sent to vLLM.
    host:
        Local bind address.
    port:
        Local port.
    """
    _ChatHandler.vllm_base_url = vllm_base_url
    _ChatHandler.model_name = model_name

    server = HTTPServer((host, port), _ChatHandler)
    print(f"Chat UI running at http://{host}:{port}")
    print(f"  Backend: {vllm_base_url}")
    print(f"  Model:   {model_name}")
    print("Press Ctrl+C to stop.\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down chat server.")
    finally:
        server.server_close()
