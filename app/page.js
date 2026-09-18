"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Markdown from "@/lib/ui/Markdown";

const AGENTS = [
  {
    id: "research",
    name: "Research",
    desc: "Structured answers, facts & sources",
    icon: "🔎",
    starters: [
      "Explain quantum entanglement simply",
      "Pros and cons of remote work",
      "Summarize the causes of inflation",
      "Compare solar vs wind energy",
    ],
  },
  {
    id: "coding",
    name: "Coding",
    desc: "JavaScript, React, Next.js & debugging",
    icon: "💻",
    starters: [
      "Fix this React useEffect infinite loop",
      "Write a debounce function in JS",
      "Design a REST API for a todo app",
      "Explain the difference between let and const",
    ],
  },
  {
    id: "interview",
    name: "Interview",
    desc: "Practice technical interviews",
    icon: "🎯",
    starters: [
      "Start a frontend interview for me",
      "Ask me a system design question",
      "Quiz me on JavaScript closures",
      "Give me a coding challenge, medium difficulty",
    ],
  },
  {
    id: "pdf",
    name: "PDF Analyst",
    desc: "Upload a PDF and ask questions",
    icon: "📄",
    starters: [
      "Summarize this PDF in 5 bullet points",
      "What are the key takeaways?",
      "Turn this into interview questions",
      "Explain section 2 in simple terms",
    ],
  },
  {
    id: "image",
    name: "Image",
    desc: "Generate images from a text prompt",
    icon: "🎨",
    starters: [
      "A watercolor fox in an autumn forest",
      "Minimalist logo for a coffee shop",
      "Cyberpunk city street at night, neon lights",
      "Astronaut riding a horse, photorealistic",
    ],
  },
];

const IMAGE_MODEL_OPTIONS = [
  { key: "fast", label: "Fast" },
  { key: "quality", label: "Quality" },
];

function agentById(id) {
  return AGENTS.find((a) => a.id === id) || AGENTS[0];
}

async function readApiResponse(response) {
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Server returned HTTP ${response.status}.`);
  }
  if (!response.ok || data?.success === false) {
    throw new Error(data?.error || `Server returned HTTP ${response.status}.`);
  }
  return data;
}

function mapConversation(row) {
  return {
    id: row.id,
    agentId: row.agent_id,
    title: row.title,
    updatedAt: row.updated_at,
  };
}

function mapMessage(row) {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    file: row.file_name || null,
    image: row.image_data || (typeof row.content === "string" && row.content.startsWith("data:image/") ? row.content : null),
  };
}

function sortByUpdatedDesc(list) {
  return [...list].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

export default function Home() {
  const router = useRouter();

  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState(null);

  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messagesByConv, setMessagesByConv] = useState({});
  const [loadingConv, setLoadingConv] = useState(false);

  const [input, setInput] = useState("");
  const [pendingFile, setPendingFile] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [imageModel, setImageModel] = useState("fast");

  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        const data = await res.json();
        if (!data?.user) {
          router.push("/login");
          return;
        }
        setUser(data.user);
      } catch {
        router.push("/login");
        return;
      }
      setAuthChecked(true);
    })();
  }, [router]);

  useEffect(() => {
    if (!authChecked) return;
    (async () => {
      try {
        const res = await fetch("/api/conversations");
        const data = await readApiResponse(res);
        const list = sortByUpdatedDesc(data.conversations.map(mapConversation));
        if (list.length) {
          setConversations(list);
          setActiveId(list[0].id);
        } else {
          await handleNewChat("research");
        }
      } catch (err) {
        console.error("LOAD CONVERSATIONS ERROR:", err);
      }
    })();
  }, [authChecked]);

  useEffect(() => {
    if (!activeId) return;
    if (messagesByConv[activeId]) return;
    (async () => {
      setLoadingConv(true);
      try {
        const res = await fetch(`/api/conversations/${activeId}`);
        const data = await readApiResponse(res);
        setMessagesByConv((prev) => ({
          ...prev,
          [activeId]: data.messages.map(mapMessage),
        }));
      } catch (err) {
        console.error("LOAD MESSAGES ERROR:", err);
        setMessagesByConv((prev) => ({ ...prev, [activeId]: [] }));
      } finally {
        setLoadingConv(false);
      }
    })();
  }, [activeId, messagesByConv]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messagesByConv, activeId, isSending]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 160) + "px";
    }
  }, [input]);

  const active = conversations.find((c) => c.id === activeId) || null;
  const activeAgent = agentById(active?.agentId || "research");
  const activeMessages = (activeId && messagesByConv[activeId]) || [];

  function touchConversation(id, patch) {
    setConversations((prev) =>
      sortByUpdatedDesc(prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
    );
  }

  async function handleNewChat(agentId) {
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: agentId || activeAgent.id }),
    });
    const data = await readApiResponse(res);
    const conv = mapConversation(data.conversation);

    setConversations((prev) => sortByUpdatedDesc([conv, ...prev]));
    setMessagesByConv((prev) => ({ ...prev, [conv.id]: [] }));
    setActiveId(conv.id);
    setInput("");
    setPendingFile(null);
  }

  async function handleAgentSwitch(agentId) {
    if (active && activeMessages.length === 0) {
      touchConversation(active.id, { agentId });
      setPendingFile(null);
      try {
        await fetch(`/api/conversations/${active.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId }),
        });
      } catch (err) {
        console.error("AGENT SWITCH ERROR:", err);
      }
    } else {
      handleNewChat(agentId);
    }
  }

  function handleSelectConversation(id) {
    setActiveId(id);
    setInput("");
    setPendingFile(null);
  }

  async function handleDeleteConversation(id, e) {
    e.stopPropagation();
    const remaining = conversations.filter((c) => c.id !== id);
    setConversations(remaining);
    setMessagesByConv((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

    try {
      await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    } catch (err) {
      console.error("DELETE CONVERSATION ERROR:", err);
    }

    if (id === activeId) {
      if (remaining.length) {
        setActiveId(remaining[0].id);
      } else {
        handleNewChat("research");
      }
    }
  }

  function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      alert("Only PDF files are supported.");
      return;
    }
    setPendingFile(file);
  }

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
    }
  }

  async function sendJson(message, agent, conversationId) {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, agent, conversationId }),
    });
    return readApiResponse(response);
  }

  async function sendPdf(file, text, conversationId) {
    const formData = new FormData();
    formData.append("message", text.trim() || "Summarize this PDF.");
    formData.append("agent", "pdf");
    formData.append("conversationId", String(conversationId));
    formData.append("file", file);
    const response = await fetch("/api/chat", { method: "POST", body: formData });
    return readApiResponse(response);
  }

  async function sendImagePrompt(prompt, model, conversationId) {
    const response = await fetch("/api/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, model, conversationId }),
    });
    return readApiResponse(response);
  }

  function appendMessage(convId, message) {
    setMessagesByConv((prev) => ({
      ...prev,
      [convId]: [...(prev[convId] || []), message],
    }));
  }

  async function sendMessage(overrideText) {
    const clean = (overrideText ?? input).trim();
    if (!clean && !pendingFile) return;
    if (isSending || !active) return;

    const convId = active.id;
    const agentId = active.agentId;

    appendMessage(convId, {
      id: crypto.randomUUID(),
      role: "user",
      content: clean || (agentId === "pdf" ? "Summarize this PDF." : clean),
      file: pendingFile?.name || null,
    });

    setInput("");
    const fileToSend = pendingFile;
    setPendingFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setIsSending(true);

    try {
      if (agentId === "image") {
        const data = await sendImagePrompt(clean, imageModel, convId);
        appendMessage(convId, {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.model,
          image: data.image,
        });
        touchConversation(convId, { title: data.conversationTitle, updatedAt: new Date().toISOString() });
        return;
      }

      const data =
        agentId === "pdf" && fileToSend
          ? await sendPdf(fileToSend, clean, convId)
          : await sendJson(clean, agentId, convId);

      appendMessage(convId, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.message,
      });
      touchConversation(convId, { title: data.conversationTitle, updatedAt: new Date().toISOString() });
    } catch (error) {
      console.error("SEND MESSAGE ERROR:", error);
      appendMessage(convId, {
        id: crypto.randomUUID(),
        role: "error",
        content: error?.message || "Something went wrong.",
      });
    } finally {
      setIsSending(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function timeAgo(ts) {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  if (!authChecked) {
    return <div className="app-loading" />;
  }

  return (
    <div className={`app ${sidebarOpen ? "" : "sidebar-collapsed"}`}>
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="brand">
            <span className="brand-dot" />
            Chafa AI
          </div>
          <button
            className="collapse-btn"
            onClick={() => setSidebarOpen(false)}
            title="Collapse sidebar"
          >
            «
          </button>
        </div>

        <button className="new-chat-btn" onClick={() => handleNewChat(activeAgent.id)}>
          <span>+</span> New chat
        </button>

        <div className="conv-list-label">Recent</div>
        <div className="conv-list">
          {conversations.map((c) => {
            const ag = agentById(c.agentId);
            return (
              <div
                key={c.id}
                className={"conv-item" + (c.id === activeId ? " active" : "")}
                onClick={() => handleSelectConversation(c.id)}
              >
                <span className="conv-icon">{ag.icon}</span>
                <div className="conv-meta">
                  <div className="conv-title">{c.title}</div>
                  <div className="conv-sub">
                    {ag.name} · {timeAgo(c.updatedAt)}
                  </div>
                </div>
                <button
                  className="conv-delete"
                  onClick={(e) => handleDeleteConversation(c.id, e)}
                  title="Delete chat"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <span className="sidebar-user-name">{user?.name}</span>
            <span className="sidebar-user-email">{user?.email}</span>
          </div>
          <button className="logout-btn" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </aside>

      <main className="main">
        <div className="chat-header">
          {!sidebarOpen && (
            <button
              className="expand-btn"
              onClick={() => setSidebarOpen(true)}
              title="Open sidebar"
            >
              »
            </button>
          )}
          <span className="header-icon">{activeAgent.icon}</span>
          <div className="agent-info">
            <strong>{activeAgent.name}</strong>
            <span className="agent-info-desc">{activeAgent.desc}</span>
          </div>
        </div>

        <div className="messages" ref={scrollRef}>
          {loadingConv && <div className="conv-loading">Loading conversation…</div>}

          {!loadingConv && activeMessages.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">{activeAgent.icon}</div>
              <h2>{activeAgent.name} Agent</h2>
              <p>{activeAgent.desc}</p>
              <div className="starters">
                {activeAgent.starters.map((s) => (
                  <button
                    key={s}
                    className="starter-card"
                    onClick={() => {
                      if (activeAgent.id === "pdf") {
                        setInput(s);
                      } else {
                        sendMessage(s);
                      }
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!loadingConv &&
            activeMessages.map((m) => {
              const imageSrc =
                m.image ||
                (typeof m.content === "string" && (m.content.startsWith("data:image/") || m.content.startsWith("http"))
                  ? m.content
                  : null);

              return (
                <div key={m.id} className={`message-row ${m.role}`}>
                  <div className="avatar">
                    {m.role === "user" ? "🧑" : m.role === "error" ? "⚠️" : activeAgent.icon}
                  </div>
                  <div className="message-body">
                    {m.file && <div className="file-chip">📎 {m.file}</div>}
                    {imageSrc ? (
                      <div className="generated-image">
                        <img src={imageSrc} alt="Generated visual" />
                        <div className="image-caption">
                          <span>{m.content && !m.content.startsWith("data:") ? m.content : "Generated Image"}</span>
                          <a
                            className="download-link"
                            href={imageSrc}
                            download={`generated-${m.id}.png`}
                          >
                            Download
                          </a>
                        </div>
                      </div>
                    ) : m.role === "assistant" ? (
                      <Markdown text={m.content} />
                    ) : (
                      <div className="plain-text">{m.content}</div>
                    )}
                  </div>
                </div>
              );
            })}

          {isSending && (
            <div className="message-row assistant">
              <div className="avatar">{activeAgent.icon}</div>
              <div className="message-body">
                <div className="typing-dots">
                  <span />
                  <span />
                  <span />
                </div>
                {activeAgent.id === "image" && (
                  <div className="generating-label">
                    Generating image… this can take a few seconds
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="composer">
          {/* Agent Switcher now situated directly above the composer input box */}
          <div className="agent-switcher">
            {AGENTS.map((agent) => (
              <button
                key={agent.id}
                className={
                  "agent-pill" + (agent.id === activeAgent.id ? " active" : "")
                }
                onClick={() => handleAgentSwitch(agent.id)}
                title={agent.desc}
              >
                <span className="agent-icon">{agent.icon}</span>
                {agent.name}
              </button>
            ))}
          </div>

          <div className="composer-inner">
            {pendingFile && (
              <div className="file-preview">
                📄 {pendingFile.name}
                <button onClick={() => setPendingFile(null)}>✕</button>
              </div>
            )}

            {activeAgent.id === "image" && (
              <div className="image-model-picker">
                {IMAGE_MODEL_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    className={
                      "model-chip" + (imageModel === opt.key ? " active" : "")
                    }
                    onClick={() => setImageModel(opt.key)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}

            <div className="composer-row">
              {activeAgent.id === "pdf" && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf"
                    style={{ display: "none" }}
                    onChange={handleFileSelect}
                  />
                  <button
                    className="icon-btn"
                    onClick={() => fileInputRef.current?.click()}
                    title="Attach PDF"
                  >
                    📎
                  </button>
                </>
              )}

              <textarea
                ref={textareaRef}
                rows={1}
                placeholder={
                  activeAgent.id === "pdf"
                    ? "Ask something about the PDF (optional)…"
                    : activeAgent.id === "image"
                    ? "Describe the image you want…"
                    : `Message ${activeAgent.name}…`
                }
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
              />

              <button
                className="send-btn"
                onClick={() => sendMessage()}
                disabled={isSending || (!input.trim() && !pendingFile)}
                title="Send"
              >
                ➤
              </button>
            </div>

            <div className="hint">
              Enter to send · Shift+Enter for a new line — {activeAgent.name} can make mistakes.
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}