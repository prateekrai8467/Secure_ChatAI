# SecureChat AI — Release Notes v1.0.0

**Release Tag:** `v1.0.0`  
**Date:** November 6, 2026  
**Repository:** [https://github.com/prateekrai8467/Secure_ChatAI](https://github.com/prateekrai8467/Secure_ChatAI)  

---

## 1. Executive Summary

SecureChat AI v1.0.0 marks the initial production-ready release of our security-hardened conversational AI platform. Engineered to defend against direct instruction overrides, jailbreaks, system prompt exfiltration, and obfuscated attacks, v1.0.0 introduces an explainable machine learning detection pipeline and pre-classification normalizer paired with local Small Language Model (SLM) inference via Ollama.

---

## 2. Key Capabilities & Verified Features

### A. Machine Learning Prompt Injection Defense
- **Hybrid Scikit-Learn FeatureUnion:** Concatenates Indic-aware word $n$-grams (1–3) with subword character $n$-grams (`char_wb`, $n=3..5$) and a Platt-calibrated LinearSVC classifier.
- **Explainable Feature Weights:** Returns triggered token attributions with associated model weights for transparency and auditing.
- **100.0% Interception Rate (Recall):** Successfully intercepted 46 out of 46 attack cases in the standardized 68-case advanced security benchmark suite.
- **0.0% Defended Attack Success Rate (ASR):** Zero adversarial prompts reached the language model.
- **0.0% False Positive Rate (FPR):** 22 out of 22 benign queries (including technical programming code, Hindi questions, and academic inquiries) passed safely.
- **Ultra-Low Latency:** Average scanning overhead of 13.5 ms per prompt.

### B. Pre-Classification Obfuscation Normalizer
- **Zero-Width Character Stripping:** Safely eliminates invisible Unicode characters (`\u200b`, `\u200c`, `\ufeff`).
- **Homoglyph Canonicalization:** Re-maps look-alike Cyrillic and Greek characters to ASCII Latin equivalents.
- **Leetspeak Decoupling:** Canonicalizes numerical character mutations (e.g., `1gn0r3` $\to$ `ignore`).
- **Safe Base64 Candidate Inspection:** Decodes candidate Base64 payloads with strict 4KB memory boundaries and $\ge 85\%$ ASCII density heuristics.

### C. Multilingual Support
- **Devanagari Hindi:** Resolved the tokenizer blindspot, achieving 100% interception on Hindi direct overrides and jailbreaks with zero false alarms on benign Hindi conversations.
- **Hinglish & Mixed Prompts:** Resilient against code-switched Hindi-English prompts.

### D. Full-Stack Application & Local LLM Integration
- **ChatGPT-Style React Client:** Vite-powered UI with session creation, conversation renaming, message deletion, and live system health monitoring.
- **Local SLM Generation:** Native integration with local Ollama running `llama3.2:1b` (1.3 GB model) with zero third-party cloud API dependencies.
- **Resilient MongoDB Persistence:** Conversation history and security telemetry logging with automatic graceful degradation to browser `localStorage` when the database is offline.
- **API Protection & Rate Limiting:** In-memory sliding-window limiter (60 req/min per IP) preventing automated abuse and brute-force probing.
- **Graceful Container Termination:** Native `SIGTERM` and `SIGINT` lifecycle handling ensuring clean socket and database disconnection.

---

## 3. Verification & Test Evidence

All 6 validation suites pass with 100% success rate:
- **Docker & Orchestration Verification:** 5 / 5 checks passed (`python scripts/verify_docker_setup.py`).
- **Backend Unit, Persistence & Security Tests:** 52 / 52 tests passed (`npm --prefix backend test`).
- **Pre-Classification Normalizer Tests:** 12 / 12 tests passed (`python detection-service/test_normalizer.py`).
- **Detector Unit & Attribution Tests:** 9 / 9 tests passed (`python detection-service/test_detector.py`).
- **Advanced Security Benchmark:** 68 / 68 cases completed (`python evaluation/advanced_runner.py`).
- **Live End-to-End Stack Integration:** 8 / 8 live tests passed with live Ollama `llama3.2:1b` (`npm --prefix backend run test:e2e`).

---

## 4. Installation & Quickstart

```bash
# Clone the repository
git clone https://github.com/prateekrai8467/Secure_ChatAI.git
cd SecureChatAi

# Ensure Ollama has the recommended model
ollama pull llama3.2:1b
ollama serve

# Deploy with Docker Compose
cp .env.example .env
docker compose up -d --build
```
*Access frontend UI at `http://localhost:5173`.*

---

## 5. Known Limitations

- **Host Docker CLI:** The development machine host does not have the Docker daemon installed; all container manifests are validated via `verify_docker_setup.py` and ready for deployment on any Docker-enabled host.
- **Single-Layer Base64:** Decodes single-layer Base64 candidates bounded at 4KB. Multi-layer nested recursive Base64 encoding is intentionally constrained to prevent ReDoS.
- **Language Scope:** v1.0.0 covers English, Devanagari Hindi, and Hinglish. Additional Indic scripts (Bengali, Tamil) are planned for v2.0.0.

