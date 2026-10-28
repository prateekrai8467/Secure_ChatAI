# SecureChat AI — System Architecture & Security Design

This document details the multi-tier architecture, security defense-in-depth pipeline, and fault-tolerant communication flows of **SecureChat AI**.

---

## 1. Architectural Overview

SecureChat AI separates conversational interface management, prompt security inspection, session persistence, and local language model inference into dedicated decoupled layers:

```mermaid
graph TD
    User([End User / Web Client])
    
    subgraph Frontend ["Frontend Tier (Vite + React)"]
        UI["ChatGPT-Style Conversational UI"]
        LocalStore[("Browser LocalStorage Cache")]
        HealthPoller["Live Health Monitor"]
    end

    subgraph Backend ["Application Tier (Node.js & Express)"]
        API["REST API Router (/api)"]
        Validator["Input & Context Validator"]
        Guardrail["Security Guardrail Middleware"]
        Fallback["Heuristic Fallback Scanner"]
        ChatCtrl["Chat & Session Controllers"]
    end

    subgraph MLService ["Security ML Tier (FastAPI & Python 3.14)"]
        DetectorApp["FastAPI Microservice (:8000)"]
        SVMPipeline["Calibrated Linear SVM + TF-IDF"]
        Explainer["Feature Weight Token Attribution"]
    end

    subgraph Persistence ["Data Tier (MongoDB)"]
        DBSessions[("ChatSessions Collection")]
        DBMessages[("Messages Collection")]
        DBTelemetry[("SecurityTelemetry Collection")]
    end

    subgraph Inference ["Inference Tier (Local SLM)"]
        OllamaServer["Ollama Daemon (:11434)"]
        SLM["Llama 3.2 (1B/3B Quantized)"]
    end

    User <--> UI
    UI <--> LocalStore
    UI -- "HTTP REST" --> API
    API --> Validator --> Guardrail
    Guardrail -- "POST /scan (Fast HTTP)" --> DetectorApp
    DetectorApp --> SVMPipeline --> Explainer
    Guardrail -. "On Timeout / Disconnect" .-> Fallback
    Guardrail -- "Log Threat Event" --> DBTelemetry
    Guardrail --> ChatCtrl
    ChatCtrl <--> DBSessions
    ChatCtrl <--> DBMessages
    ChatCtrl -- "REST /api/chat" --> OllamaServer --> SLM
```

---

## 2. Core Subsystems

### 2.1 Frontend Tier (`/frontend`)
- **Technology:** React 19, Vite, Lucide Icons, Vanilla CSS design system.
- **Key Responsibilities:**
  - Modern ChatGPT-style chat interface with responsive layout and mobile drawer.
  - Multi-turn conversation management with automatic title generation.
  - Transparent security indicators displaying risk badges (Low, Medium, High, Critical), detected adversarial tokens, and confidence scores.
  - Dual-tier persistence: Synchronizes with backend MongoDB when connected; falls back to browser `localStorage` when offline.

### 2.2 Backend Application Tier (`/backend`)
- **Technology:** Node.js, Express.js (ES Modules).
- **Key Responsibilities:**
  - Strict schema and conversational context validation (`validator.js`).
  - Pre-execution security enforcement via middleware (`securityGuardrail.js`).
  - Resilient inference broker communicating with Ollama with configurable timeouts (`ollamaService.js`).
  - Session lifecycle management, multi-turn history stitching, and telemetry auditing (`sessionController.js`, `telemetryController.js`).

### 2.3 Machine Learning Security Microservice (`/detection-service`)
- **Technology:** FastAPI, Scikit-learn, Joblib, Python 3.14.
- **Key Responsibilities:**
  - Sub-5ms prompt classification using a calibrated Linear Support Vector Machine (`LinearSVC`) with sublinear term-frequency (`TF-IDF`).
  - Platt scaling calibration (`CalibratedClassifierCV`) yielding smooth confidence probabilities ($[0.0, 1.0]$).
  - Explainable token attribution: extracts top adversarial hyperplane weights to pinpoint exact malicious trigger words.

### 2.4 Persistence Tier (MongoDB)
- **Schemas:**
  - `ChatSession`: Conversational sessions, model configurations, custom system prompts, and message counters.
  - `Message`: Immutable turn-by-turn logs with token consumption metrics and latency timestamps.
  - `SecurityTelemetry`: Comprehensive security incident logs recording prompt snippets, threat scores, classifications, actions, and detected tokens.

### 2.5 Inference Tier (Ollama)
- **Model:** `llama3.2:1b` (or `llama3.2:3b`), hosted locally via Ollama.
- Isolated from direct public exposure; accessible strictly through backend proxy controllers.

---

## 3. Security Inspection Sequence Flow

The following sequence illustrates how incoming prompts are inspected before reaching the language model:

```mermaid
sequenceDiagram
    autonumber
    actor Client as User / Frontend
    participant Server as Express Backend
    participant Guard as Guardrail Middleware
    participant ML as ML Detector (:8000)
    participant DB as MongoDB
    participant SLM as Ollama Inference (:11434)

    Client->>Server: POST /api/chat { message, sessionId }
    Server->>Guard: Validate payload & context integrity
    
    rect rgb(240, 248, 255)
        Note over Guard,ML: Security Pre-Flight Inspection
        alt ML Microservice Online
            Guard->>ML: POST /scan { text } (1500ms timeout)
            ML-->>Guard: { is_injection, threat_score, action, detected_tokens }
        else Service Timeout or Disconnect
            Guard->>Guard: Execute In-Memory Heuristic Guardrail Engine
        end
    end

    alt Attack Detected (threat_score >= 0.70 or action == "blocked")
        Guard->>DB: Log Threat Event in SecurityTelemetry
        Guard-->>Client: HTTP 403 Forbidden { blocked: true, threatScore, tokens }
    else Prompt Safe (threat_score < 0.70)
        Guard->>DB: Optionally record benign telemetry
        Guard->>Server: Proceed to handleChat controller
        Server->>DB: Fetch conversational history & system prompt
        Server->>SLM: POST /api/chat (Sanitized Context)
        SLM-->>Server: Completion Response
        Server->>DB: Store User & Assistant Messages
        Server-->>Client: HTTP 200 OK { answer, security, metadata }
    end
```

---

## 4. Resilience & Degradation Modes

| Subsystem State | Impact on Operations | Degradation Strategy |
| :--- | :--- | :--- |
| **Detection Service Offline** | ML classification unavailable | Transparently falls back to in-memory regex heuristic scanner (`fallbackGuardrail.js`). Zero downtime. |
| **MongoDB Disconnected** | Chat history persistence unavailable | Backend operates in stateless mode. Frontend falls back to browser `localStorage` for conversation continuity. |
| **Ollama Timeout (>120s)** | SLM inference stalled | Graceful HTTP 504 Gateway Timeout returned with user-friendly retry message; prevents hung connections. |
| **Ollama Offline** | Model generation unavailable | HTTP 503 Service Unavailable returned with actionable setup instructions. Health check reports degraded state. |
