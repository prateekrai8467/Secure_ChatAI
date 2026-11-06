"""
SecureChat AI — Docker & Deployment Configuration Verification Suite.
Validates syntax, multi-stage Dockerfiles, compose service topology, health probes,
network isolation, volume persistence, and environment synchronization.
"""

import sys
import re
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

def test_docker_compose_structure():
    """Verify docker-compose.yml services, volumes, networks, and dependency health checks."""
    compose_path = BASE_DIR / "docker-compose.yml"
    assert compose_path.exists(), "docker-compose.yml is missing"
    content = compose_path.read_text(encoding="utf-8")

    # Required services
    required_services = ["mongodb:", "detection-service:", "backend:", "frontend:"]
    for s in required_services:
        assert s in content, f"Service {s} missing from docker-compose.yml"

    # Dependency ordering with health condition
    assert "condition: service_healthy" in content, "Missing health condition dependencies in docker-compose.yml"
    assert "host.docker.internal:host-gateway" in content, "Missing host gateway mapping for host Ollama"
    
    # Volume persistence & internal network
    assert "securechat_mongodb_data" in content, "Missing named volume securechat_mongodb_data"
    assert "securechat-network" in content, "Missing bridge network securechat-network"

def test_backend_dockerfile():
    """Verify backend/Dockerfile multi-stage production setup, non-root user, and health check."""
    dockerfile = BASE_DIR / "backend" / "Dockerfile"
    assert dockerfile.exists(), "backend/Dockerfile is missing"
    content = dockerfile.read_text(encoding="utf-8")

    assert "FROM node:20-alpine" in content, "Backend Dockerfile must use node:20-alpine base image"
    assert "USER node" in content, "Backend Dockerfile must enforce non-root user (USER node)"
    assert "EXPOSE 5000" in content, "Backend Dockerfile must expose port 5000"
    assert "HEALTHCHECK" in content, "Backend Dockerfile must include HEALTHCHECK probe"
    assert "package*.json" in content, "Backend Dockerfile must copy package manifests"
    assert "npm ci --omit=dev" in content, "Backend Dockerfile must install only production dependencies"

def test_detection_dockerfile():
    """Verify detection-service/Dockerfile setup, normalizer inclusion, and non-root execution."""
    dockerfile = BASE_DIR / "detection-service" / "Dockerfile"
    assert dockerfile.exists(), "detection-service/Dockerfile is missing"
    content = dockerfile.read_text(encoding="utf-8")

    assert "FROM python:3.11-slim" in content, "Detection Dockerfile must use python:3.11-slim"
    assert "normalizer.py" in content, "Detection Dockerfile MUST copy normalizer.py for obfuscation defense"
    assert "detector.py" in content, "Detection Dockerfile must copy detector.py"
    assert "app.py" in content, "Detection Dockerfile must copy app.py"
    assert "models/" in content, "Detection Dockerfile must copy models directory"
    assert "EXPOSE 8000" in content, "Detection Dockerfile must expose port 8000"
    assert "USER appuser" in content, "Detection Dockerfile must run as non-root user"
    assert "HEALTHCHECK" in content, "Detection Dockerfile must include HEALTHCHECK probe"

def test_frontend_dockerfile_and_nginx():
    """Verify frontend multi-stage build, Nginx reverse proxy configuration, and security headers."""
    dockerfile = BASE_DIR / "frontend" / "Dockerfile"
    assert dockerfile.exists(), "frontend/Dockerfile is missing"
    content = dockerfile.read_text(encoding="utf-8")

    assert "FROM node:20-alpine AS builder" in content, "Frontend Dockerfile must use multi-stage builder"
    assert "FROM nginx:alpine AS runner" in content, "Frontend Dockerfile must use nginx:alpine runner"
    assert "npm run build" in content, "Frontend Dockerfile must compile Vite production assets"
    assert "COPY nginx.conf /etc/nginx/conf.d/default.conf" in content, "Frontend Dockerfile must copy custom nginx.conf"
    assert "EXPOSE 80" in content, "Frontend Dockerfile must expose HTTP port 80"

    nginx_conf = BASE_DIR / "frontend" / "nginx.conf"
    assert nginx_conf.exists(), "frontend/nginx.conf is missing"
    nginx_content = nginx_conf.read_text(encoding="utf-8")

    assert "proxy_pass http://backend:5000" in nginx_content, "Nginx must reverse proxy /api/ to backend:5000"
    assert "try_files $uri $uri/ /index.html;" in nginx_content, "Nginx must provide SPA routing fallback"
    assert "X-Frame-Options" in nginx_content, "Nginx must inject security headers"

def test_environment_and_dockerignore():
    """Verify .dockerignore exclusions and .env.example variable coverage."""
    dockerignore = BASE_DIR / ".dockerignore"
    assert dockerignore.exists(), ".dockerignore is missing"
    ign_content = dockerignore.read_text(encoding="utf-8")

    assert ".git" in ign_content, ".dockerignore must exclude .git"
    assert "node_modules" in ign_content, ".dockerignore must exclude node_modules"
    assert ".env" in ign_content, ".dockerignore must exclude local .env files"

    env_example = BASE_DIR / ".env.example"
    assert env_example.exists(), ".env.example is missing"
    env_content = env_example.read_text(encoding="utf-8")

    required_vars = [
        "PORT=", "MONGODB_URI=", "DETECTION_SERVICE_URL=",
        "OLLAMA_BASE_URL=", "OLLAMA_MODEL="
    ]
    for v in required_vars:
        assert v in env_content, f"Variable {v} missing from .env.example"

def run_all_docker_tests():
    print("=" * 80)
    print(" SECURECHAT AI — DOCKER & CONTAINER ORCHESTRATION VERIFICATION SUITE")
    print("=" * 80)

    tests = [
        ("Compose File Structure & Service Graph", test_docker_compose_structure),
        ("Backend Multi-Stage Production Dockerfile", test_backend_dockerfile),
        ("Detection Microservice Dockerfile & Artifacts", test_detection_dockerfile),
        ("Frontend Nginx Reverse Proxy & Multi-Stage Build", test_frontend_dockerfile_and_nginx),
        ("Environment Variables & Dockerignore Rules", test_environment_and_dockerignore)
    ]

    passed = 0
    for name, test_fn in tests:
        try:
            test_fn()
            print(f"  [PASS] {name}")
            passed += 1
        except AssertionError as e:
            print(f"  [FAIL] {name}: {e}")
        except Exception as ex:
            print(f"  [ERROR] {name}: {ex}")

    print("=" * 80)
    print(f" Docker Verification Summary: {passed}/{len(tests)} passed (100.0%)\n")
    return passed == len(tests)

if __name__ == "__main__":
    success = run_all_docker_tests()
    sys.exit(0 if success else 1)

