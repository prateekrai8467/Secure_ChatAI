# SecureChat AI

A ChatGPT-style conversational AI application engineered to investigate, detect, evaluate, and mitigate prompt injection attacks against Large and Small Language Models.

---

## 1. Project Overview

SecureChat AI is a security-focused conversational AI platform. In addition to providing a ChatGPT-style conversational interface powered by a locally hosted Small Language Model (SLM) and persistent multi-chat storage, the project investigates the vulnerability of language models to direct and indirect prompt injection attacks.

The system distinguishes between three core security tasks:
1. **Detection:** Identifying adversarial and malicious prompts using a trained machine learning classifier (Linear SVM + TF-IDF).
2. **Protection:** Applying defensive system guardrails, input/output validation, and risk policies before prompt submission.
3. **Verification:** Empirically measuring attack success rates and evaluating defenses using reproducible synthetic benchmarks.

---

## 2. Technology Stack

- **Frontend:** React, Vanilla CSS, Vite, Lucide Icons
- **Backend:** Node.js, Express.js (REST API, request validation, middleware security)
- **Language Model:** Ollama running a local Small Language Model (SLM) such as `llama3.2:1b` or `llama3.2:3b`
- **Database:** MongoDB (Chat sessions, message history, security telemetry)
- **Machine Learning & Security:** Python 3.14, Scikit-learn (Linear SVM, TF-IDF vectorizer, explainable token weights)
- **Version Control:** Git & GitHub

---

## 3. Project Directory Structure

```text
SecureChatAi/
├── frontend/                     # React application (Vite, ChatGPT-style interface)
├── backend/                      # Express.js REST API server
│   ├── config/                   # Database and environment configurations
│   ├── controllers/              # Route controller logic
│   ├── middleware/               # Validation, error handling, security middleware
│   ├── models/                   # MongoDB Mongoose schemas (Chats, Messages)
│   ├── routes/                   # API endpoint route definitions
│   └── services/                 # SLM (Ollama) and detection client services
├── detection-service/            # Machine learning prompt injection detector
│   ├── dataset/                  # Labeled prompt injection datasets
│   ├── models/                   # Vectorizers and model definitions
│   └── training/                 # Model training scripts and evaluation notebooks
├── evaluation/                   # Automated security testing and benchmarking suite
├── docs/                         # Architecture diagrams, API specs, and research notes
├── .gitignore                    # Version control exclusions
└── README.md                     # Project documentation
```

---

## 4. Development Roadmap

- [x] **Phase 1:** Project Structure & Version Control Initialization
- [x] **Phase 2:** Basic AI Chatbot (Ollama SLM + Express API with Validation & Resilience)
- [x] **Phase 3:** ChatGPT-Style React User Interface (Vite, Responsive, Streaming Support)
- [x] **Phase 4:** Persistent Multiple-Chat History (MongoDB Integration & Security Telemetry)
- [ ] **Phase 5:** Prompt Injection Detection & Security Engine (Linear SVM + TF-IDF)
- [ ] **Phase 6:** Automated Security Testing Framework & Benchmarks

---

## 5. Security & Contribution Guidelines

- Environment configurations and secrets must reside in `.env` files (never committed to version control).
- Pickle files (`.pkl`) are restricted and audited to prevent arbitrary code execution vulnerabilities.
- User input is never treated as trusted execution instructions.