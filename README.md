# SecureChat AI

A ChatGPT-style conversational AI application engineered to investigate, detect, evaluate, and mitigate prompt injection attacks against Large and Small Language Models.

---

## 1. Project Overview

SecureChat AI is a security-focused conversational AI platform. In addition to providing a ChatGPT-style conversational interface powered by a locally hosted Small Language Model (SLM) and persistent multi-chat storage, the project investigates the vulnerability of language models to direct and indirect prompt injection attacks.

The system distinguishes between three core security tasks:
1. **Detection:** Identifying adversarial and malicious prompts using a trained machine learning classifier (Linear SVM + TF-IDF with token attribution).
2. **Protection:** Applying defensive system guardrails, input/output validation, and risk policies before prompt submission.
3. **Verification:** Empirically measuring attack success rates and evaluating defenses using reproducible synthetic benchmarks.

---

## 2. Technology Stack

- **Frontend:** React 19, Vite, Lucide Icons, Vanilla CSS Design System
- **Backend:** Node.js, Express.js (REST API, request validation, guardrail middleware, Mongoose ORM)
- **Language Model:** Ollama running a local Small Language Model (SLM) such as `llama3.2:1b` or `llama3.2:3b`
- **Database:** MongoDB (Chat sessions, message history, security telemetry)
- **Machine Learning & Security:** Python 3.14, FastAPI, Scikit-learn (Linear SVM, sublinear TF-IDF, CalibratedClassifierCV)
- **Testing & Benchmarking:** Node.js native test runner, Python unittest, automated security benchmark runner

---

## 3. Project Directory Structure

```text
SecureChatAi/
├── frontend/                     # React application (Vite, ChatGPT-style interface)
├── backend/                      # Express.js REST API server
│   ├── config/                   # Database and environment configurations
│   ├── controllers/              # Route controller logic (chat, sessions, telemetry)
│   ├── middleware/               # Validation, error handling, security guardrail
│   ├── models/                   # MongoDB Mongoose schemas (Sessions, Messages, Telemetry)
│   ├── routes/                   # API endpoint route definitions
│   ├── services/                 # SLM (Ollama), detection client, fallback guardrails
│   └── tests/                    # Backend unit & integration test suites
├── detection-service/            # Machine learning prompt injection detector microservice
│   ├── dataset/                  # Labeled prompt injection datasets (CSV, JSON)
│   ├── models/                   # Trained pipeline (.joblib), feature weights, metadata
│   ├── training/                 # Model training pipeline and evaluation scripts
│   ├── app.py                    # FastAPI REST microservice (:8000)
│   ├── detector.py               # PromptInjectionDetector engine & token attribution
│   └── requirements.txt          # Python microservice dependencies
├── evaluation/                   # Automated security testing and benchmarking suite
│   ├── benchmarks/               # Standardized adversarial & benign benchmark test suite
│   ├── reports/                  # Benchmark summary JSON and Markdown reports
│   └── runner.py                 # Automated evaluation runner & metrics calculation
├── docs/                         # Architecture diagrams, API specs, and research notes
│   ├── architecture.md           # System architecture, component & sequence diagrams
│   ├── api_specification.md      # Backend & ML microservice REST API documentation
│   └── research_notes.md         # Threat modeling, SVM calibration & empirical notes
├── .gitignore                    # Version control exclusions
└── README.md                     # Project documentation
```

---

## 4. Development Roadmap

- [x] **Phase 1:** Project Structure & Version Control Initialization
- [x] **Phase 2:** Basic AI Chatbot (Ollama SLM + Express API with Validation & Resilience)
- [x] **Phase 3:** ChatGPT-Style React User Interface (Vite, Responsive, Streaming Support)
- [x] **Phase 4:** Persistent Multiple-Chat History (MongoDB Integration & Security Telemetry)
- [x] **Phase 5:** Prompt Injection Detection & Security Engine (Linear SVM + TF-IDF)
- [x] **Phase 6:** Automated Security Testing Framework & Benchmarks (100% Interception Rate, [Benchmark Report](evaluation/reports/benchmark_report.md))

---

## 5. Quick Start Guide

### Prerequisites
- **Node.js:** v20+ recommended
- **Python:** v3.10+ (with `pip`)
- **Ollama:** Installed locally ([ollama.com](https://ollama.com)) with `llama3.2:1b` pulled
- **MongoDB:** (Optional, for persistent multi-chat history) running on port `27017`

### 1. Start the ML Detection Microservice
```bash
cd detection-service
pip install -r requirements.txt
python app.py
```
*Microservice starts at `http://127.0.0.1:8000` with `/health`, `/scan`, and `/metadata` endpoints.*

### 2. Start the Express Backend
```bash
cd backend
npm install
npm run dev
```
*Backend API starts at `http://localhost:5000`.*

### 3. Start the React Frontend
```bash
cd frontend
npm install
npm run dev
```
*Access the user interface at `http://localhost:5173`.*

---

## 6. Testing & Benchmarking

### Backend Test Suite (Unit & Security Enforcement)
```bash
cd backend
npm test
```
*Runs 49 automated tests validating API health, input validation, context integrity, error resilience, Mongoose schemas, and guardrail middleware.*

### ML Detector Unit Tests
```bash
python detection-service/test_detector.py
```
*Runs detection engine tests validating attack classification, token explainability, and sub-5ms latency.*

### Automated Security Benchmark Suite
```bash
python evaluation/runner.py
```
*Evaluates the 30-case benchmark suite, computing empirical attack reduction factors and updating the [Security Benchmark Report](evaluation/reports/benchmark_report.md).*

---

## 7. Detailed Documentation

- **[System Architecture & Design](docs/architecture.md):** Complete component topology, Mermaid sequence diagrams, and degradation modes.
- **[REST API Specification](docs/api_specification.md):** Request/response contracts for backend and detection endpoints.
- **[Threat Research & Methodology](docs/research_notes.md):** Mathematical formulation of Linear SVM with Platt calibration, token attribution, and threat taxonomy.
- **[Empirical Benchmark Report](evaluation/reports/benchmark_report.md):** Comprehensive test results (100% Interception Rate, 0% FPR, 4.3ms latency).

---

## 8. Security & Contribution Guidelines

- Environment configurations and secrets must reside in `.env` files (never committed to version control).
- Serialized model files (`.joblib`, `.json`) are verified and audited to prevent arbitrary code execution vulnerabilities.
- User input is never treated as trusted execution instructions.
