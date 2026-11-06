# SecureChat AI — System Architecture & Technical Design

This document details the multi-tier software architecture, component topologies, request lifecycles, prompt injection detection pipelines, and database design of **SecureChat AI v1.0.0**.

---

## 1. High-Level System Architecture

SecureChat AI separates client presentation, API validation, security guardrail inspection, persistent conversation storage, and local Small Language Model (SLM) inference into decoupled subsystems:

```mermaid
graph TD
    User([End User / Web Browser])

    subgraph ClientTier ["Frontend Tier (Port 5173 / Port 80)"]
        ReactApp["React 19 SPA (Vite)"]
        LocalStorage[("Browser LocalStorage (Offline Fallback)")]
        Nginx["Nginx Reverse Proxy (/api/* -> backend:5000)"]
    end

    subgraph ApplicationTier ["Application Backend Tier (Port 5000)"]
        ExpressRouter["Express.js Router"]
        InputValidator["Input & Context Validator"]
        RateLimiter["Sliding-Window Rate Limiter (60 req/min)"]
        SecurityMiddleware["Security Guardrail Middleware"]
        FallbackGuard["Heuristic Regex Scanner (Zero-Downtime Fallback)"]
        ChatController["Chat & Session Controllers"]
    end

    subgraph DetectionTier ["Security ML Detection Tier (Port 8000)"]
        FastAPIApp["FastAPI REST Microservice"]
        Normalizer["Pre-Classification Normalizer"]
        subgraph NormalizationModules ["Normalization Components"]
            ZWStrip["Zero-Width Stripper (\u200b, \u200c, \ufeff)"]
            Homoglyph["Homoglyph Canonicalizer (Cyrillic/Greek -> Latin)"]
            LeetDecoder["Leetspeak Decoder (Bounded Digit Mapping)"]
            B64Candidate["Safe Base64 Inspector (4KB Bounded Decoding)"]
        end
        HybridPipeline["Scikit-Learn FeatureUnion Pipeline"]
        subgraph PipelineModules ["ML Feature Extraction & Classification"]
            WordTFIDF["Word TF-IDF (N-grams 1-3, (?u)[\w\u0900-\u097F]+)"]
            CharTFIDF["Subword Char-WB TF-IDF (N-grams 3-5)"]
            LinearSVC["Platt-Calibrated LinearSVC Classifier"]
        end
        TokenAttribution["Explainable Feature Weight Attributor"]
    end

    subgraph DataTier ["Persistence Tier (Port 27017)"]
        MongoDB[(MongoDB 7.0 Database)]
        ColSessions[("chat_sessions")]
        ColMessages[("messages")]
        ColTelemetry[("security_telemetry")]
    end

    subgraph InferenceTier ["Local SLM Inference Tier (Port 11434)"]
        HostOllama["Host Ollama Server"]
        SLMModel["llama3.2:1b (1.3 GB Local Model)"]
    end

    User <-->|HTTP / WebSocket| ReactApp
    ReactApp -->|Static Assets| Nginx
    Nginx -->|Reverse Proxy /api/| ExpressRouter
    ExpressRouter --> RateLimiter
    RateLimiter --> InputValidator
    InputValidator --> SecurityMiddleware
    SecurityMiddleware -->|POST /scan (1500ms timeout)| FastAPIApp
    SecurityMiddleware -.->|Fallback on Timeout| FallbackGuard

    FastAPIApp --> Normalizer
    Normalizer --> NormalizationModules
    NormalizationModules --> HybridPipeline
    HybridPipeline --> PipelineModules
    PipelineModules --> TokenAttribution
    TokenAttribution --> FastAPIApp

    SecurityMiddleware -->|Enforce Policy (Score >= 0.70)| ChatController
    ChatController <-->|Mongoose ODM| MongoDB
    MongoDB --- ColSessions
    MongoDB --- ColMessages
    MongoDB --- ColTelemetry

    ChatController <-->|POST /api/chat (Host Gateway)| HostOllama
    HostOllama --- SLMModel
```

---

## 2. Request Lifecycle & End-to-End Data Flow

The sequence diagram below traces the end-to-end journey of user requests through input validation, ML security scanning, policy enforcement, local SLM inference, and MongoDB telemetry persistence.

```mermaid
sequenceDiagram
    autonumber
    actor User as User Browser
    participant FE as React Frontend (Vite)
    participant BE as Express Backend (:5000)
    participant ML as Detection Microservice (:8000)
    participant OLLAMA as Local Ollama SLM (:11434)
    participant DB as MongoDB (:27017)

    User->>FE: Submits prompt message
    FE->>BE: POST /api/chat { message, messages, sessionId }
    
    activate BE
    BE->>BE: RateLimiter: Verify IP request frequency (<= 60 req/min)
    BE->>BE: Validator: Check payload structure, length, and context integrity
    
    rect rgb(240, 248, 255)
        note right of BE: Security Inspection Stage
        BE->>ML: POST /scan { text: prompt, sessionId }
        activate ML
        ML->>ML: Step 1: Pre-Classification Normalizer
        ML->>ML: Step 2: Multi-Candidate Variant Evaluation
        ML->>ML: Step 3: FeatureUnion (Word + Char-WB TF-IDF)
        ML->>ML: Step 4: Calibrated LinearSVC Probability Prediction
        ML->>ML: Step 5: Feature Weight Token Attribution
        ML-->>BE: 200 OK { is_injection, threat_score, action, detected_tokens, explanation }
        deactivate ML
    end

    alt Malicious Request (threat_score >= 0.70 or action == 'blocked')
        BE->>DB: Log security event in security_telemetry collection
        BE-->>FE: HTTP 403 Forbidden { blocked: true, security: { threatScore, explanation, tokens } }
        FE-->>User: Displays red security warning card (Zero tokens forwarded to LLM)
    else Benign Request (threat_score < 0.70 and action == 'allowed')
        opt Active Persistent Session
            BE->>DB: Retrieve chat context & custom system prompt
            DB-->>BE: Return active session history
        end
        
        rect rgb(255, 250, 240)
            note right of BE: Language Model Inference Stage
            BE->>OLLAMA: POST /api/chat { model: 'llama3.2:1b', messages: context, options }
            activate OLLAMA
            OLLAMA-->>BE: 200 OK { message: { content: answer }, eval_count, total_duration }
            deactivate OLLAMA
        end

        opt Database Connected
            BE->>DB: Save user & assistant messages to messages collection
            BE->>DB: Update chat_sessions (lastMessageAt, messageCount)
        end

        BE-->>FE: HTTP 200 OK { success: true, answer, sessionId, security, metadata }
        FE-->>User: Streams/renders assistant markdown response
    end
    deactivate BE
```

---

## 3. Prompt Injection Detection Workflow

The detection engine implements a multi-stage defense-in-depth pipeline designed to counter both direct injection instructions and complex evasion techniques:

```mermaid
flowchart TD
    RawInput["Raw User Prompt Input"] --> NormalizerEngine["Pre-Classification Normalizer Engine"]
    
    subgraph NormalizationStage ["1. Obfuscation Normalization Pipeline"]
        NormalizerEngine --> ZW["Zero-Width Stripping (\u200b, \u200c, \ufeff)"]
        ZW --> Homo["Homoglyph Mapping (Cyrillic/Greek -> ASCII Latin)"]
        Homo --> Leet["Leetspeak Canonicalization (Digits -> Letters)"]
        Leet --> B64Scan["Candidate Base64 Detector (Bounded 4KB Inspection)"]
    end

    B64Scan --> CandidateGen["Candidate Variant Generator: [Original, Normalized, Decoded Base64]"]
    
    subgraph FeatureStage ["2. Hybrid Multilingual Feature Union"]
        CandidateGen --> WordVec["Indic-Aware Word TF-IDF\n(?u)[\w\u0900-\u097F]+ (N-grams 1-3)"]
        CandidateGen --> CharVec["Subword Character TF-IDF\nchar_wb (N-grams 3-5)"]
        WordVec --> Union["FeatureUnion (Vocabulary Concatenation)"]
        CharVec --> Union
    end

    Union --> Classifier["LinearSVC with Platt Sigmoid Calibration (CalibratedClassifierCV)"]
    Classifier --> RawProb["Platt Calibrated Posterior Probability: P(Injection | Prompt)"]

    subgraph PolicyStage ["3. Application Policy Decision"]
        RawProb --> DecisionNode{"Threat Score Evaluation"}
        DecisionNode -->|Score >= 0.70| BlockedAction["Action: 'blocked'\nRisk Level: 'high'\nHTTP 403 Forbidden"]
        DecisionNode -->|0.40 <= Score < 0.70| FlaggedAction["Action: 'flagged'\nRisk Level: 'medium'\nLog Warning & Pass"]
        DecisionNode -->|Score < 0.40| AllowedAction["Action: 'allowed'\nRisk Level: 'low'\nPass Through to LLM"]
    end

    BlockedAction --> EnforceHalt["HALT Execution: Zero Tokens to LLM\nRecord in SecurityTelemetry"]
    AllowedAction --> EnforceInference["Proceed to Ollama SLM Inference"]
    FlaggedAction --> EnforceInference
```

---

## 4. Database Architecture & Schema Design

When MongoDB is active, SecureChat AI maintains conversational history, session state, and security telemetry. When MongoDB is unavailable, the application gracefully degrades to stateless mode with client-side `localStorage` caching.

```mermaid
erDiagram
    ChatSession ||--o{ Message : "contains"
    ChatSession ||--o{ SecurityTelemetry : "associates"

    ChatSession {
        ObjectId _id PK
        string title "Max 120 chars"
        string model "Default: llama3.2:1b"
        string systemPrompt "Max 2000 chars"
        boolean isActive "Default: true"
        int messageCount "Default: 0"
        date lastMessageAt "Indexed"
        date createdAt
        date updatedAt
    }

    Message {
        ObjectId _id PK
        ObjectId sessionId FK "Indexed"
        string role "user | assistant"
        string content "Max 8000 chars"
        int promptTokens
        int completionTokens
        int durationMs
        object security "threatScore, actionTaken, detectedTokens"
        date createdAt
    }

    SecurityTelemetry {
        ObjectId _id PK
        ObjectId sessionId FK "Indexed"
        ObjectId messageId FK "Nullable"
        string role "user | assistant"
        string promptSnippet "Max 500 chars"
        double threatScore "Range [0.0, 1.0], Indexed"
        string classification "benign | direct_injection | indirect_injection | jailbreak | system_leak"
        string actionTaken "allowed | blocked | flagged | sanitized"
        array detectedTokens "Triggered N-grams"
        double latencyMs "Scan duration in ms"
        string ipAddress "Client IP"
        date createdAt "Indexed"
    }
```

### Important Indexes:
1. `ChatSession`: `{ lastMessageAt: -1 }` for rapid retrieval of recent conversations.
2. `Message`: `{ sessionId: 1, createdAt: 1 }` for ordered retrieval of conversation history.
3. `SecurityTelemetry`: `{ threatScore: -1, createdAt: -1 }` for security audit queries and threat aggregation.
