import React, { useState, useEffect, useRef } from 'react';
import {
  Shield,
  Bot,
  User,
  Plus,
  Send,
  Trash2,
  Copy,
  Check,
  Menu,
  X,
  AlertCircle,
  RefreshCw,
  Cpu,
  Sparkles,
  MessageSquare,
  Clock,
  Zap
} from 'lucide-react';
import './App.css';

// Base API configuration (Vite proxy forwards /api to backend)
const API_BASE = '/api';

export default function App() {
  // Conversational state
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [sessionTitle, setSessionTitle] = useState('New Conversation');
  const [chatHistory, setChatHistory] = useState([]);
  
  // UI & Network state
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // System Health state
  const [systemHealth, setSystemHealth] = useState({
    backend: 'checking',
    ollama: false,
    database: false,
    model: 'llama3.2:1b'
  });

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // Auto-scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Check system health on mount and periodically
  const fetchHealth = async () => {
    try {
      const res = await fetch(`${API_BASE}/health`);
      if (res.ok || res.status === 503) {
        const data = await res.json();
        setSystemHealth({
          backend: 'online',
          ollama: Boolean(data.ollama?.connected),
          database: Boolean(data.database?.connected),
          model: data.ollama?.models?.[0]?.name || 'llama3.2:1b'
        });
      } else {
        setSystemHealth(prev => ({ ...prev, backend: 'offline', ollama: false }));
      }
    } catch {
      setSystemHealth(prev => ({ ...prev, backend: 'offline', ollama: false }));
    }
  };

  // Fetch session history if MongoDB is connected
  const fetchSessions = async () => {
    try {
      const res = await fetch(`${API_BASE}/chats`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.sessions)) {
          setChatHistory(data.sessions);
        }
      }
    } catch {
      // Non-blocking fallback if database is offline
    }
  };

  useEffect(() => {
    fetchHealth();
    fetchSessions();
    const interval = setInterval(fetchHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  // Auto-resize input textarea based on content
  const handleTextareaChange = (e) => {
    setInputMessage(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  };

  // Start a fresh, isolated new chat
  const handleNewChat = () => {
    setMessages([]);
    setSessionId(null);
    setSessionTitle('New Conversation');
    setErrorMessage(null);
    setInputMessage('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.focus();
    }
    setIsSidebarOpen(false);
  };

  // Switch to a previous session
  const handleSelectSession = async (session) => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      const res = await fetch(`${API_BASE}/chats/${session._id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setSessionId(data.session._id);
          setSessionTitle(data.session.title || 'Conversation');
          setMessages(data.messages || []);
          setIsSidebarOpen(false);
        }
      } else {
        setErrorMessage('Failed to load session history.');
      }
    } catch (err) {
      setErrorMessage(`Network error loading session: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Delete a session from history
  const handleDeleteSession = async (e, idToDelete) => {
    e.stopPropagation();
    try {
      const res = await fetch(`${API_BASE}/chats/${idToDelete}?permanent=true`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setChatHistory(prev => prev.filter(s => s._id !== idToDelete));
        if (sessionId === idToDelete) {
          handleNewChat();
        }
      }
    } catch {
      // Ignore delete failure
    }
  };

  // Clear current active conversation messages
  const handleClearCurrentChat = () => {
    setMessages([]);
    setErrorMessage(null);
  };

  // Send message to backend
  const handleSendMessage = async (textToSend) => {
    const messageContent = (textToSend !== undefined ? textToSend : inputMessage).trim();
    if (!messageContent || isLoading) return;

    // Reset input immediately
    setInputMessage('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setErrorMessage(null);

    // Build context-preserving payload
    const userMessageObj = {
      role: 'user',
      content: messageContent,
      timestamp: new Date().toISOString()
    };

    const updatedMessages = [...messages, userMessageObj];
    setMessages(updatedMessages);
    setIsLoading(true);

    try {
      // Build request body including conversation history
      const formattedHistory = updatedMessages.map(m => ({
        role: m.role,
        content: m.content
      }));

      const payload = {
        messages: formattedHistory,
        sessionId: sessionId || undefined
      };

      const response = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || `Server responded with status ${response.status}`);
      }

      if (data.success && data.answer) {
        const assistantMessageObj = {
          role: 'assistant',
          content: data.answer,
          metadata: data.metadata || {},
          timestamp: new Date().toISOString()
        };

        setMessages(prev => [...prev, assistantMessageObj]);

        if (data.sessionId && !sessionId) {
          setSessionId(data.sessionId);
          // Set smart session title from the first query
          const title = messageContent.length > 36
            ? `${messageContent.substring(0, 36).trim()}...`
            : messageContent;
          setSessionTitle(title);
          fetchSessions();
        }
      } else {
        throw new Error(data.error || 'Invalid response received from assistant.');
      }
    } catch (err) {
      console.error('[Chat Error]:', err);
      let userFriendlyError = err.message;
      if (err.message.includes('Failed to fetch') || err.message.includes('ECONNREFUSED')) {
        userFriendlyError = 'Cannot reach backend server. Please check that the server is running on port 5000.';
      } else if (err.message.includes('unavailable') || err.message.includes('Ollama')) {
        userFriendlyError = 'Local AI service is offline. Please start Ollama (`ollama serve`) and ensure the model is loaded.';
      }
      setErrorMessage(userFriendlyError);
    } finally {
      setIsLoading(false);
    }
  };

  // Keyboard shortcut: Enter to send, Shift+Enter for newline
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Copy message content
  const handleCopy = (text, index) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  // Pre-canned suggestion prompts
  const suggestions = [
    {
      title: 'Java vs Python Comparison',
      desc: 'Explain the core architectural differences and use cases.',
      prompt: 'What is the difference between Java and Python?'
    },
    {
      title: 'Recursion in Java',
      desc: 'Explain the concept and provide an intuitive example.',
      prompt: 'Explain recursion in Java with a simple example.'
    },
    {
      title: 'Prompt Injection Defense',
      desc: 'How adversarial inputs bypass system guardrails.',
      prompt: 'How do prompt injection attacks work against language models, and how are they prevented?'
    },
    {
      title: 'Input Sanitization',
      desc: 'Best practices for validating untrusted user inputs.',
      prompt: 'Write a secure input validation pattern to guard against injection attacks.'
    }
  ];

  return (
    <div className="app-container" id="securechat-root">
      {/* Mobile backdrop */}
      <div
        className={`sidebar-backdrop ${isSidebarOpen ? 'open' : ''}`}
        onClick={() => setIsSidebarOpen(false)}
      />

      {/* Sidebar */}
      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`} id="chat-sidebar">
        {/* Brand */}
        <div className="sidebar-header">
          <div className="brand-wrapper" onClick={handleNewChat}>
            <div className="brand-icon">
              <Shield size={20} />
            </div>
            <div className="brand-title">
              SecureChat
              <span className="brand-badge">AI SLM</span>
            </div>
          </div>
          <button
            className="btn-toggle-sidebar"
            onClick={() => setIsSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            <X size={18} />
          </button>
        </div>

        {/* New Chat Action */}
        <div className="sidebar-actions">
          <button
            className="btn-new-chat"
            id="btn-new-chat"
            onClick={handleNewChat}
          >
            <Plus size={18} />
            New Chat
          </button>
        </div>

        {/* History List */}
        <div className="sidebar-history" id="chat-history-list">
          <div className="history-heading">Recent Conversations</div>
          {chatHistory.length > 0 ? (
            chatHistory.map((item) => (
              <div
                key={item._id}
                className={`history-item ${sessionId === item._id ? 'active' : ''}`}
                id={`session-item-${item._id}`}
                onClick={() => handleSelectSession(item)}
              >
                <div className="history-item-content">
                  <MessageSquare size={14} />
                  <span className="history-title">{item.title || 'Untitled Session'}</span>
                </div>
                <button
                  className="history-delete-btn"
                  id={`btn-delete-session-${item._id}`}
                  onClick={(e) => handleDeleteSession(e, item._id)}
                  title="Delete chat"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))
          ) : (
            <div className="history-empty">
              {systemHealth.database
                ? 'No saved conversations yet.'
                : 'Local ephemeral mode (MongoDB offline).'}
            </div>
          )}
        </div>

        {/* System Health Status Footer */}
        <div className="sidebar-footer">
          <div className="status-row">
            <span className="status-label">
              <span className={`status-indicator ${systemHealth.backend === 'online' ? 'online' : 'offline'}`} />
              Backend API
            </span>
            <span className="status-val">{systemHealth.backend}</span>
          </div>

          <div className="status-row">
            <span className="status-label">
              <span className={`status-indicator ${systemHealth.ollama ? 'online' : 'offline'}`} />
              Ollama SLM
            </span>
            <span className="status-val">{systemHealth.ollama ? 'Ready' : 'Offline'}</span>
          </div>

          <div className="status-row">
            <span className="status-label">
              <span className={`status-indicator ${systemHealth.database ? 'online' : 'degraded'}`} />
              Storage
            </span>
            <span className="status-val">{systemHealth.database ? 'MongoDB' : 'Memory'}</span>
          </div>
        </div>
      </aside>

      {/* Main Chat Interface */}
      <main className="main-chat" id="chat-main-area">
        {/* Top Navbar */}
        <header className="chat-navbar">
          <div className="nav-left">
            <button
              className="btn-toggle-sidebar"
              id="btn-toggle-sidebar"
              onClick={() => setIsSidebarOpen(true)}
              aria-label="Toggle sidebar"
            >
              <Menu size={20} />
            </button>
            <div className="chat-model-info">
              <h1 className="chat-title-text" id="active-chat-title">{sessionTitle}</h1>
              <div className="model-tag" id="model-tag-badge">
                <Cpu size={12} />
                <span>{systemHealth.model}</span>
              </div>
            </div>
          </div>

          <div className="nav-right">
            <div className="shield-badge" title="Input & output guardrails active">
              <Shield size={13} />
              <span>Guardrails Active</span>
            </div>
            {messages.length > 0 && (
              <button
                className="btn-clear-chat"
                id="btn-clear-chat"
                onClick={handleClearCurrentChat}
                title="Clear current messages"
              >
                <Trash2 size={14} />
                <span>Clear</span>
              </button>
            )}
          </div>
        </header>

        {/* Message Scroll Container */}
        <section className="chat-messages-container" id="chat-messages-container">
          <div className="chat-content-limit">
            {messages.length === 0 ? (
              /* Welcome Screen */
              <div className="welcome-screen" id="welcome-screen">
                <div className="welcome-logo-glow">
                  <div className="welcome-icon-box">
                    <Shield size={36} />
                  </div>
                </div>
                <h2 className="welcome-title">SecureChat AI</h2>
                <p className="welcome-subtitle">
                  Privacy-first conversational AI powered by a local Small Language Model.
                  Hardened against prompt injection attacks and confidential data leaks.
                </p>

                <div className="suggestions-grid">
                  {suggestions.map((item, idx) => (
                    <div
                      key={idx}
                      className="suggestion-card"
                      id={`suggestion-card-${idx}`}
                      onClick={() => handleSendMessage(item.prompt)}
                    >
                      <span className="suggestion-card-title">{item.title}</span>
                      <span className="suggestion-card-desc">{item.desc}</span>
                    </div>
                  ))}
                </div>

                <div className="privacy-notice">
                  <Sparkles size={14} />
                  <span>All inference runs locally on your device. Zero telemetry leaves this machine.</span>
                </div>
              </div>
            ) : (
              /* Conversation Messages */
              messages.map((msg, index) => (
                <div
                  key={index}
                  className={`message-row ${msg.role}`}
                  id={`message-row-${index}`}
                >
                  <div className={`message-avatar ${msg.role === 'user' ? 'user-avatar' : 'ai-avatar'}`}>
                    {msg.role === 'user' ? <User size={18} /> : <Bot size={18} />}
                  </div>

                  <div className="message-bubble-wrapper">
                    <div className={`message-bubble ${msg.role}`}>
                      <div className="message-text" style={{ whiteSpace: 'pre-wrap' }}>
                        {msg.content}
                      </div>
                    </div>

                    <div className="message-meta">
                      {msg.metadata?.durationMs && (
                        <span className="meta-pill">
                          <Clock size={11} />
                          {msg.metadata.durationMs}ms
                        </span>
                      )}
                      {msg.metadata?.tokens?.completion && (
                        <span className="meta-pill">
                          <Zap size={11} />
                          {msg.metadata.tokens.completion} tokens
                        </span>
                      )}
                      {msg.role === 'assistant' && (
                        <button
                          className="btn-copy-msg"
                          id={`btn-copy-${index}`}
                          onClick={() => handleCopy(msg.content, index)}
                          title="Copy response"
                        >
                          {copiedIndex === index ? (
                            <>
                              <Check size={11} color="#34d399" />
                              <span style={{ color: '#34d399' }}>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy size={11} />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}

            {/* Thinking / Loading Bubble */}
            {isLoading && (
              <div className="message-row assistant" id="message-row-thinking">
                <div className="message-avatar ai-avatar">
                  <Bot size={18} />
                </div>
                <div className="message-bubble-wrapper">
                  <div className="thinking-bubble">
                    <div className="dot-pulse-container">
                      <span className="dot-pulse" />
                      <span className="dot-pulse" />
                      <span className="dot-pulse" />
                    </div>
                    <span className="thinking-text">SecureChat is thinking...</span>
                  </div>
                </div>
              </div>
            )}

            {/* Error Banner */}
            {errorMessage && (
              <div className="error-banner" id="error-banner">
                <div className="error-content">
                  <AlertCircle size={18} />
                  <span>{errorMessage}</span>
                </div>
                <button
                  className="btn-retry"
                  id="btn-retry"
                  onClick={() => handleSendMessage()}
                >
                  <RefreshCw size={13} />
                  <span>Retry</span>
                </button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </section>

        {/* Input Bar */}
        <footer className="chat-input-wrapper">
          <div className="input-box-container">
            <textarea
              ref={textareaRef}
              className="input-textarea"
              id="chat-input"
              rows={1}
              value={inputMessage}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything... (e.g. 'Explain recursion in Java')"
              maxLength={4000}
            />

            <div className="input-bottom-row">
              <div className="input-hints">
                <span>Press <strong>Enter</strong> to send, <strong>Shift+Enter</strong> for newline</span>
                <span
                  className={`char-counter ${
                    inputMessage.length > 3800
                      ? 'danger'
                      : inputMessage.length > 3000
                      ? 'warning'
                      : ''
                  }`}
                >
                  {inputMessage.length > 0 && `${inputMessage.length}/4000`}
                </span>
              </div>

              <button
                className="btn-send"
                id="btn-send-message"
                onClick={() => handleSendMessage()}
                disabled={!inputMessage.trim() || isLoading}
                aria-label="Send message"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
