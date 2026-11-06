# SecureChat AI

[![CI Pipeline](https://github.com/prateekrai8467/Secure_ChatAI/actions/workflows/ci.yml/badge.svg)](https://github.com/prateekrai8467/Secure_ChatAI/actions/workflows/ci.yml)

A ChatGPT-style conversational AI application engineered to investigate, detect, evaluate, and mitigate prompt injection attacks against Large and Small Language Models.

---

## 1. Project Overview

SecureChat AI is a security-focused conversational AI platform. In addition to providing a ChatGPT-style conversational interface powered by a locally hosted Small Language Model (SLM) and persistent multi-chat storage, the project investigates the vulnerability of language models to direct and indirect prompt injection attacks.

The system distinguishes between three core security tasks:
1. **Detection:** Identifying adversarial and malicious prompts using a trained machine learning classifier (Hybrid Indic-Aware Word + Char-WB TF-IDF with Calibrated Linear SVM and token attribution).
2. **Protection:** Applying defensive system guardrails, input/output validation, multi-candidate normalization, and risk policies before prompt submission.
3. **Verification:** Empirically measuring attack success rates and evaluating defenses using reproducible synthetic benchmarks.

---

## 2. Technology Stack

- **Frontend:** React 19, Vite, Lucide Icons, Vanilla CSS Design System, Nginx Reverse Proxy
- **Backend:** Node.js, Express.js (REST API, request validation, guardrail middleware, Mongoose ORM)
- **Language Model:** Ollama running a local Small Language Model (SLM) such as `llama3.2:1b` or `llama3.2:3b`
- **Database:** MongoDB 7.0 (Chat sessions, message history, security telemetry)
- **Machine Learning & Security:** Python 3.11/3.14, FastAPI, Scikit-learn (Linear SVM, Indic-aware TF-IDF, CalibratedClassifierCV)
- **Containerization:** Docker & Docker Compose v2 (Multi-stage builds, non-root users, health probes)
- **Testing & Benchmarking:** Node.js native test runner (52 tests), Python unittest (21 tests), automated security benchmark runners

---

## 3. Project Directory Structure

```text
SecureChatAi/
├── frontend/                     # React application (Vite, ChatGPT-style interface)
│   ├── src/                      # UI components, session state, theme styles
│   ├── nginx.conf                # Nginx reverse proxy routing /api/ to backend:5000
│   └── Dockerfile                # Multi-stage production container build
├── backend/                      # Express.js REST API server
│   ├── config/                   # Database (db.js) and Ollama configurations
│   ├── controllers/              # Route controller logic (chat, sessions, telemetry)
│   ├── middleware/               # Validation, error handling, security guardrails
│   ├── models/                   # MongoDB Mongoose schemas (Sessions, Messages, Telemetry)
│   ├── routes/                   # API endpoint route definitions
│   ├── services/                 # SLM (Ollama), detection client, fallback guardrails
│   ├── tests/                    # Backend unit & integration test suites (52 tests)
│   └── Dockerfile                # Production Node 20 Alpine container build
├── detection-service/            # Machine learning prompt injection detector microservice
│   ├── dataset/                  # Labeled prompt injection datasets (CSV, JSON, generator)
│   ├── models/                   # Trained pipeline (.joblib), feature weights, metadata
│   ├── training/                 # Model training pipeline and architecture comparison
│   ├── normalizer.py             # Pre-classification normalization (zero-width, homoglyph, leet, b64)
│   ├── detector.py               # PromptInjectionDetector engine & token attribution
│   ├── app.py                    # FastAPI REST microservice (:8000)
│   ├── requirements.txt          # Python microservice dependencies
│   └── Dockerfile                # Production Python 3.11 Slim container build
├── evaluation/                   # Automated security testing and benchmarking suite
│   ├── benchmarks/               # Standardized adversarial & benign benchmark test suites
│   ├── reports/                  # Benchmark summary JSON and Markdown reports
│   ├── runner.py                 # Baseline 30-case evaluation runner
│   └── advanced_runner.py        # Expanded 68-case multilingual & obfuscation benchmark runner
├── docs/                         # Comprehensive engineering documentation
│   ├── architecture.md           # System architecture, component & sequence diagrams
│   ├── api_specification.md      # Backend & ML microservice REST API documentation
│   ├── docker_deployment.md      # Container deployment guide, networking, and volumes
│   └── research_notes.md         # Threat modeling, SVM calibration & empirical notes
├── docker-compose.yml            # Multi-service orchestration (Mongo, ML, Backend, Frontend)
├── .dockerignore                 # Container build context exclusions
├── .env.example                  # Environment configuration template
├── .gitignore                    # Version control exclusions
└── README.md                     # Project documentation
```

---

## 4. Development Roadmap

- [x] **Phase 1:** Project Structure & Version Control Initialization
- [x] **Phase 2:** Basic AI Chatbot (Ollama SLM + Express API with Validation & Resilience)
- [x] **Phase 3:** ChatGPT-Style React User Interface (Vite, Responsive, Streaming Support)
- [x] **Phase 4:** Persistent Multiple-Chat History (MongoDB Integration & Security Telemetry)
- [x] **Phase 4A:** Pre-Classification Normalization (Zero-Width, Homoglyphs, Leetspeak, Base64)
- [x] **Phase 4C:** Multilingual Prompt Injection Defense (Devanagari Hindi & Hinglish Support)
- [x] **Phase 5:** Prompt Injection Detection & Security Engine (Linear SVM + TF-IDF)
- [x] **Phase 6:** Automated Security Testing Framework & Benchmarks (100% Interception Rate)
- [x] **Phase 7:** Repository & Engineering Quality (Documentation, zero-leakage splits, 52/52 backend tests)
- [x] **Phase 8:** Dockerization & Multi-Container Orchestration (`docker-compose.yml`, health probes, volume persistence)
- [x] **Phase 9:** Advanced Security Benchmark & Validation (68-case suite, 100% Interception, 0% FPR, [Benchmark Report](evaluation/reports/advanced_benchmark_report.md))
- [x] **Phase 10:** CI/CD Automation & Production Hardening (GitHub Actions workflow, graceful container shutdown, full 5-stage validation stack)

---

## 5. Quick Start Guide

### Option A: Deployment with Docker Compose (Recommended)

1. **Ensure Ollama is running on the host:**
   ```bash
   ollama pull llama3.2:1b
   # Ollama runs automatically on Windows. On Linux, ensure host binding:
   # OLLAMA_HOST=0.0.0.0:11434 ollama serve
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   ```

3. **Start all services:**
   ```bash
   docker compose up -d --build
   ```
   *Access the web UI at `http://localhost:5173`. Check container health with `docker compose ps`.*

---

### Option B: Local Bare-Metal Execution

#### 1. Start the ML Detection Microservice
```bash
cd detection-service
pip install -r requirements.txt
python app.py
```
*Microservice starts at `http://127.0.0.1:8000`.*

#### 2. Start the Express Backend
```bash
cd backend
npm install
npm run dev
```
*Backend API starts at `http://localhost:5000`.*

#### 3. Start the React Frontend
```bash
cd frontend
npm install
npm run dev
```
*Access the user interface at `http://localhost:5173`.*

---

## 6. Testing & Benchmarking

### Docker & Container Configuration Verification Suite (5 Automated Checks)
```bash
python scripts/verify_docker_setup.py
# or from backend directory:
npm --prefix backend run test:docker
```
*Validates compose service graph, multi-stage Dockerfiles, non-root user execution, healthcheck probes, and environment variable synchronization.*

### Backend Test Suite (52 Automated Tests)
```bash
cd backend
npm test
```
*Validates API health, input validation, context integrity, error resilience, Mongoose schemas, and guardrail middleware.*

### Live End-to-End Stack Integration Suite (8 Live Tests)
```bash
npm --prefix backend run test:e2e
```
*Validates real communication between Express API, Detection Microservice, and live Ollama `llama3.2:1b`, measuring live English/Hindi/Hinglish generation and HTTP 403 attack interception.*

### Detector & Normalizer Unit Tests (21 Tests)
```bash
python detection-service/test_normalizer.py
python detection-service/test_detector.py
```
*Validates zero-width stripping, homoglyph mapping, leetspeak canonicalization, base64 decoding, Hindi preservation, and sub-15ms inference latency.*

### Advanced Multilingual & Obfuscation Security Benchmark (68 Cases)
```bash
python evaluation/advanced_runner.py
```
*Evaluates the expanded 68-case benchmark suite across Devanagari Hindi, Hinglish, Mixed English-Hindi, Base64, Leetspeak, Homoglyphs, Zero-Width characters, Authority Spoofing, and Canary Extraction.*

**Latest Benchmark Results & Baseline Comparison:**
- **Attack Interception Rate (Recall):** **100.0%** (46 / 46 attacks blocked, up from 82.6% in baseline)
- **Defended Attack Success Rate (ASR):** **0.0%** (0 / 46 attacks reached LLM, down from 17.4% in baseline)
- **False Positive Rate (FPR):** **0.0%** (0 / 22 benign queries blocked, down from 4.5% in baseline)
- **Devanagari Hindi Interception:** **100.0%** (up from 0.0% blindspot in baseline)
- **Obfuscation Interception (Leet/Homoglyph/Zero-Width):** **100.0%** (up from 0–50% in baseline)
- **Average Detection Latency:** **12.68 ms**
- Full report: [advanced_benchmark_report.md](evaluation/reports/advanced_benchmark_report.md)

---

## 7. Detailed Documentation

- **[System Architecture & Design](docs/architecture.md):** Complete component topology, Mermaid sequence diagrams, and degradation modes.
- **[Docker Deployment Guide](docs/docker_deployment.md):** Container topology, host Ollama routing, persistent storage, and command reference.
- **[REST API Specification](docs/api_specification.md):** Request/response contracts for backend and detection endpoints.
- **[Threat Research & Methodology](docs/research_notes.md):** Mathematical formulation of Linear SVM with Platt calibration, Indic tokenization, and threat taxonomy.
- **[Advanced Benchmark Report](evaluation/reports/advanced_benchmark_report.md):** Comprehensive test results across 68 adversarial and benign test cases.

---

## 8. Security & Contribution Guidelines

- Environment configurations and secrets must reside in `.env` files (never committed to version control).
- Serialized model files (`.joblib`, `.json`) are verified and audited to prevent arbitrary code execution vulnerabilities.
- User input is never treated as trusted execution instructions.
