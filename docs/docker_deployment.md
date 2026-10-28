# SecureChat AI — Docker & Containerization Deployment Guide

This guide provides complete instructions for orchestrating and deploying **SecureChat AI** using Docker Compose.

---

## 1. Container Topology & Architecture

The deployment topology encapsulates four interconnected services running on an isolated bridge network (`securechat-network`):

```mermaid
graph TD
    UserBrowser["User Browser (http://localhost:5173)"]

    subgraph HostMachine ["Host Machine (Developer / Production)"]
        OllamaDaemon["Host Ollama Daemon (:11434)\nModel: llama3.2:1b"]
    end

    subgraph DockerNetwork ["Docker Bridge Network (securechat-network)"]
        FrontendContainer["securechat-frontend (:80 -> Host :5173)\nNginx Reverse Proxy + React SPA"]
        BackendContainer["securechat-backend (:5000)\nNode.js Express API"]
        DetectionContainer["securechat-detection-service (:8000)\nFastAPI + Linear SVM Microservice"]
        MongoContainer["securechat-mongodb (:27017)\nMongoDB 7.0 Engine"]
        MongoVolume[("Named Volume: securechat_mongodb_data\n(/data/db)")]
    end

    UserBrowser -->|HTTP Port 5173| FrontendContainer
    FrontendContainer -->|Static Files / Assets| FrontendContainer
    FrontendContainer -->|Proxy /api/ -> http://backend:5000/api/| BackendContainer
    BackendContainer -->|POST /scan (Fast HTTP)| DetectionContainer
    BackendContainer -->|Mongoose DB Driver| MongoContainer
    MongoContainer --- MongoVolume
    BackendContainer -->|http://host.docker.internal:11434| OllamaDaemon
```

---

## 2. Prerequisites

1. **Docker & Docker Compose:** Docker Engine 24.0+ and Docker Compose v2.20+.
2. **Ollama Installed on Host:**
   - Install Ollama from [ollama.com](https://ollama.com).
   - Ensure the target model is downloaded locally:
     ```bash
     ollama pull llama3.2:1b
     ```
   - Ensure the Ollama daemon is actively running on host port `11434`.

---

## 3. Environment Configuration

Copy the example environment configuration into `.env` at the project root:

```bash
cp .env.example .env
```

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `OLLAMA_BASE_URL` | `http://host.docker.internal:11434` | Host address of the Ollama inference service. |
| `OLLAMA_MODEL` | `llama3.2:1b` | Target SLM model name. |
| `OLLAMA_TIMEOUT_MS` | `120000` | Inference request timeout in milliseconds (2 minutes). |
| `MONGODB_URI` | `mongodb://mongodb:27017/securechat_ai` | Internal Docker DNS address for MongoDB. |
| `DETECTION_SERVICE_URL` | `http://detection-service:8000` | Internal Docker DNS address for the ML detector. |
| `DETECTION_TIMEOUT_MS` | `1500` | Latency ceiling before fallback heuristics engage. |

> [!NOTE]
> On **Linux hosts**, ensure Ollama binds to all network interfaces or host IP by setting `OLLAMA_HOST=0.0.0.0:11434` before running `ollama serve`. The `extra_hosts: ["host.docker.internal:host-gateway"]` setting in `docker-compose.yml` routes `host.docker.internal` to the Linux Docker host bridge.

---

## 4. Single-Command Startup & Shutdown

### 4.1 Launch All Services
Build the container images and launch the containers in detached mode:

```bash
docker compose up -d --build
```

### 4.2 Monitor Container Status & Health
Check the real-time status of all services and their health probes:

```bash
docker compose ps
```

Expected status:
```text
NAME                            IMAGE                         STATUS                    PORTS
securechat-mongodb              mongo:7.0                     Up (healthy)              127.0.0.1:27017->27017/tcp
securechat-detection-service    securechatai-detection...     Up (healthy)              127.0.0.1:8000->8000/tcp
securechat-backend              securechatai-backend          Up (healthy)              0.0.0.0:5000->5000/tcp
securechat-frontend             securechatai-frontend         Up (healthy)              0.0.0.0:5173->80/tcp
```

### 4.3 View Service Logs
Tail aggregated logs or stream logs from a specific container:

```bash
# All containers
docker compose logs -f

# Specific container
docker compose logs -f backend
docker compose logs -f detection-service
```

### 4.4 Graceful Shutdown
Stop all containers without deleting persistent database records:

```bash
docker compose down
```

To stop containers and permanently purge persistent database volumes:

```bash
docker compose down -v
```

---

## 5. Security & Isolation Best Practices Implemented

1. **Least-Privilege Execution:** The backend container runs under the unprivileged `node` user, and the Python microservice runs under an isolated `appuser` (UID 1000).
2. **Reverse Proxying Without Exposed Ports:** The React frontend and backend communicate internally; the browser only connects to port `5173`.
3. **Loopback Binding for Internal Databases:** MongoDB only exposes port `27017` bound to `127.0.0.1`, preventing exposure to external networks.
4. **Persistent Named Volumes:** All MongoDB databases reside on `securechat_mongodb_data`, surviving image rebuilds and container teardowns.
