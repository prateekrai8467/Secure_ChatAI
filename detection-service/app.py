"""
SecureChat AI - Prompt Injection Detection REST Microservice.
Provides ultra-low-latency prompt security scanning and explanation endpoints.
"""

import os
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from detector import get_detector

app = FastAPI(
    title="SecureChat AI - Prompt Injection Detection Service",
    description="Machine Learning Security Service using Calibrated Linear SVM & TF-IDF for LLM Guardrails",
    version="1.0.0"
)

# Enable CORS for local cross-service communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ScanRequest(BaseModel):
    text: str = Field(..., description="Prompt string to inspect", max_length=10000)
    sessionId: Optional[str] = Field(None, description="Optional associated chat session ID")

class TokenDetail(BaseModel):
    token: str
    weight: float

class ScanResponse(BaseModel):
    success: bool = True
    is_injection: bool
    threat_score: float
    classification: str
    action: str
    risk_level: str
    detected_tokens: List[str]
    token_details: List[TokenDetail]
    normalized_text: Optional[str] = None
    obfuscations_detected: Optional[List[str]] = None
    inspection_variant: Optional[str] = None
    latency_ms: float
    explanation: str
    sessionId: Optional[str] = None

@app.get("/health")
def health_check():
    """Health endpoint returning detector model status and metadata."""
    detector = get_detector()
    return {
        "status": "healthy",
        "service": "Prompt Injection Detection Microservice",
        "model_loaded": detector.pipeline is not None,
        "metadata": detector.metadata
    }

@app.post("/scan", response_model=ScanResponse)
def scan_prompt(request: ScanRequest):
    """
    Scan an incoming user prompt for adversarial injection or jailbreak attempts.
    """
    detector = get_detector()
    result = detector.scan(request.text)
    
    return ScanResponse(
        success=True,
        is_injection=result["is_injection"],
        threat_score=result["threat_score"],
        classification=result["classification"],
        action=result["action"],
        risk_level=result["risk_level"],
        detected_tokens=result["detected_tokens"],
        token_details=[TokenDetail(**t) for t in result["token_details"]],
        normalized_text=result.get("normalized_text"),
        obfuscations_detected=result.get("obfuscations_detected", []),
        inspection_variant=result.get("inspection_variant", "original"),
        latency_ms=result["latency_ms"],
        explanation=result["explanation"],
        sessionId=request.sessionId
    )

@app.get("/metadata")
def get_metadata():
    """Return model training metadata and top adversarial feature tokens."""
    detector = get_detector()
    top_tokens = [
        {"token": k, "weight": round(v, 4)}
        for k, v in list(detector.adversarial_weights.items())[:50]
    ]
    return {
        "metadata": detector.metadata,
        "top_adversarial_tokens": top_tokens
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("DETECTION_SERVICE_PORT", 8000))
    uvicorn.run(app, host="127.0.0.1", port=port)
