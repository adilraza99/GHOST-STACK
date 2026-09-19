# GhostStack

**Application Dependency Intelligence & Incident Investigation Platform**

> Know what your code can break before you deploy it.

GhostStack observes application telemetry and constructs a live dependency graph to answer critical questions about your infrastructure:

- What depends on this service?
- What is the blast radius if this service fails?
- What happened during an incident, and in what order did failures propagate?
- Which deployment initiated an incident?
- What components may be affected by a proposed deployment?

## Status

🚧 **Under active development** — Local-first backend implementation in progress.

The current implementation is local-first. AWS infrastructure adapters (EventBridge, DynamoDB, CloudWatch) are planned as future replacements for local infrastructure components.

## Architecture

```
server/
├── src/
│   ├── domain/          # Pure business entities (database-agnostic)
│   ├── application/     # Core engines and services
│   ├── infrastructure/  # MongoDB, event bus, logging
│   ├── interfaces/      # HTTP controllers, routes, middleware
│   ├── simulator/       # Deterministic demo scenarios
│   └── config/          # Environment configuration
├── tests/
│   ├── unit/
│   └── integration/
└── server.js
```

## Tech Stack

- **Runtime:** Node.js
- **Language:** JavaScript
- **Framework:** Express
- **Database:** MongoDB (Mongoose)
- **Validation:** Zod
- **Logging:** Pino
- **Testing:** Vitest + Supertest

## Getting Started

Setup instructions will be added once the backend scaffold is complete.

## License

Proprietary — Hackathon Project
