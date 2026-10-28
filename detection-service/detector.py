"""
SecureChat AI - Prompt Injection Detector Engine.
Applies trained calibrated Linear SVM and TF-IDF pipeline with token-level explainability.
"""

import re
import time
import json
from pathlib import Path
from typing import Dict, List, Any, Optional

import joblib

MODELS_DIR = Path(__file__).resolve().parent / "models"
MODEL_PATH = MODELS_DIR / "pipeline.joblib"
WEIGHTS_PATH = MODELS_DIR / "feature_weights.json"
METADATA_PATH = MODELS_DIR / "model_metadata.json"

class PromptInjectionDetector:
    """
    ML-driven prompt injection detector using Calibrated Linear SVM and explainable feature weights.
    """

    def __init__(self, model_path: Optional[Path] = None, weights_path: Optional[Path] = None):
        self.model_path = model_path or MODEL_PATH
        self.weights_path = weights_path or WEIGHTS_PATH
        
        self.pipeline = None
        self.adversarial_weights: Dict[str, float] = {}
        self.benign_weights: Dict[str, float] = {}
        self.metadata: Dict[str, Any] = {}
        
        self.load_artifacts()

    def load_artifacts(self) -> None:
        """Load serialized model pipeline and explainability weights."""
        if not self.model_path.exists():
            raise FileNotFoundError(f"Trained model not found at: {self.model_path}")
        
        self.pipeline = joblib.load(self.model_path)
        
        if self.weights_path.exists():
            with open(self.weights_path, "r", encoding="utf-8") as f:
                weights = json.load(f)
                self.adversarial_weights = weights.get("adversarial_tokens", {})
                self.benign_weights = weights.get("benign_tokens", {})
        
        if METADATA_PATH.exists():
            with open(METADATA_PATH, "r", encoding="utf-8") as f:
                self.metadata = json.load(f)

    def classify_category(self, text: str, threat_score: float) -> str:
        """Determine specific attack classification category based on prompt patterns."""
        if threat_score < 0.40:
            return "benign"
        
        lower = text.lower()
        
        # System prompt extraction patterns
        if any(p in lower for p in [
            "system prompt", "initial instruction", "instructions given to you",
            "verbatim", "repeat everything above", "leak your internal",
            "hidden developer prompt", "core instructions", "preamble"
        ]):
            return "system_leak"
        
        # Jailbreak personas
        if any(p in lower for p in [
            "dan", "do anything now", "aim", "developer mode", "jailbreak",
            "unfiltered mode", "god mode", "hypothetical scenario", "lucifer",
            "stan", "cyberghost", "evil twin", "military protocol", "uncensored mode"
        ]):
            return "jailbreak"
        
        # Indirect injection framing
        if any(p in lower for p in [
            "the following is a text file", "email summary", "summarize this website",
            "process this user review", "evaluate this customer feedback",
            "read this resume", "document: <<injection", "note to ai:"
        ]):
            return "indirect_injection"
        
        # Direct instruction overrides
        if any(p in lower for p in [
            "ignore previous", "disregard", "forget all", "override", "stop following",
            "cancel all", "reset all", "pwned", "security bypassed", "unrestricted terminal",
            "### system override", "<system>", "[system instruction]"
        ]):
            return "direct_injection"
        
        return "direct_injection"

    def extract_triggered_tokens(self, text: str, top_k: int = 5) -> List[Dict[str, Any]]:
        """Identify which high-risk adversarial tokens or n-grams were present in the prompt."""
        lower = text.lower()
        triggered = []

        for token, weight in self.adversarial_weights.items():
            pattern = r"\b" + re.escape(token) + r"\b"
            if re.search(pattern, lower):
                triggered.append({
                    "token": token,
                    "weight": round(weight, 4)
                })

        # Sort by weight descending
        triggered.sort(key=lambda x: x["weight"], reverse=True)
        return triggered[:top_k]

    def scan(self, text: str) -> Dict[str, Any]:
        """
        Scan an incoming user prompt and return comprehensive security analysis.
        """
        start_time = time.perf_counter()
        
        if not text or not text.strip():
            return {
                "is_injection": False,
                "threat_score": 0.0,
                "classification": "benign",
                "action": "allowed",
                "risk_level": "low",
                "detected_tokens": [],
                "latency_ms": 0.0,
                "explanation": "Empty prompt passed security inspection."
            }

        # Model inference (calibrated probabilities)
        # Class 1 = Adversarial / Injection, Class 0 = Benign
        proba = self.pipeline.predict_proba([text])[0]
        threat_score = round(float(proba[1]), 4)
        
        # Threshold policies
        is_injection = threat_score >= 0.50
        
        if threat_score >= 0.70:
            action = "blocked"
            risk_level = "high"
        elif threat_score >= 0.40:
            action = "flagged"
            risk_level = "medium"
        else:
            action = "allowed"
            risk_level = "low"

        classification = self.classify_category(text, threat_score)
        triggered_tokens = self.extract_triggered_tokens(text)
        latency_ms = round((time.perf_counter() - start_time) * 1000, 2)

        # Generate human-readable explanation
        if action == "blocked":
            tokens_str = ", ".join(f"'{t['token']}'" for t in triggered_tokens[:3])
            explanation = (
                f"Prompt blocked: Adversarial injection detected with high confidence "
                f"(Threat Score: {threat_score:.2f}). Triggered signals: {tokens_str or 'Pattern similarity'}."
            )
        elif action == "flagged":
            explanation = (
                f"Prompt flagged: Ambiguous or borderline pattern detected "
                f"(Threat Score: {threat_score:.2f}). Guardrail rules applied."
            )
        else:
            explanation = "Prompt verified: Content classified as benign user inquiry."

        return {
            "is_injection": is_injection,
            "threat_score": threat_score,
            "classification": classification,
            "action": action,
            "risk_level": risk_level,
            "detected_tokens": [t["token"] for t in triggered_tokens],
            "token_details": triggered_tokens,
            "latency_ms": latency_ms,
            "explanation": explanation
        }

# Global singleton detector instance
_detector_instance: Optional[PromptInjectionDetector] = None

def get_detector() -> PromptInjectionDetector:
    global _detector_instance
    if _detector_instance is None:
        _detector_instance = PromptInjectionDetector()
    return _detector_instance
