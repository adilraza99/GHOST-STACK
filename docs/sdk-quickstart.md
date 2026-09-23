# GHOST-STACK Node.js SDK Developer Quickstart

This step-by-step guide walks you through connecting any Node.js or Express application to GHOST-STACK using `@ghoststack/node`.

---

## Prerequisites

- Node.js version 18.0.0 or higher.
- A running GHOST-STACK instance (e.g. `http://localhost:3000` locally, or `https://ghoststack.yourcompany.com` in production).

---

## Step 1: Create a GHOST-STACK Project

In the GHOST-STACK dashboard:
1. Navigate to **Projects & Keys**.
2. Click **+ New Project**.
3. Name your project (e.g. `Acme Commerce`).
4. Click **Create Project**.

---

## Step 2: Create a Developer API Key

1. Inside your project, click **Manage Keys**.
2. Click **Generate New Key**.
3. Set key name (e.g. `Order Service Ingestion Key`).
4. Select `telemetry:write` permission and submit.
5. **Copy the plaintext key immediately** (e.g. `gs_live_...`). This key is only revealed once.

---

## Step 3: Install the SDK

In your Node.js application directory, run:

```bash
npm install @ghoststack/node
```

Or install from a local build:

```bash
npm install /path/to/ghoststack-node-0.1.0.tgz
```

---

## Step 4: Configure Environment Variables

Create or update your `.env` file or export environment variables:

```bash
# Required service identity
export GHOSTSTACK_SERVICE_NAME=order-service

# Required ingestion key from Step 2
export GHOSTSTACK_API_KEY=gs_live_your_actual_key_here

# GHOST-STACK endpoint URL (automatically normalized to /v1/traces)
export GHOSTSTACK_ENDPOINT=http://localhost:3000

# Environment name
export GHOSTSTACK_ENVIRONMENT=development
```

---

## Step 5: Initialize the SDK in Your Application

At the very top of your application entry point (e.g. `app.js` or `index.js`), initialize the SDK:

```javascript
const express = require('express');
const ghoststack = require('@ghoststack/node');

// 1. Initialize SDK singleton (loads configuration from environment variables)
const client = ghoststack.init();

// 2. Enable outgoing HTTP client instrumentation (injects W3C trace context)
client.instrumentHttp();

const app = express();
app.use(express.json());

// 3. Attach Express middleware (captures route templates, latency, and status codes)
app.use(ghoststack.middleware());

// Application routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/orders', (req, res) => {
  res.json([
    { id: 101, item: 'Widget A', amount: 24.99 },
    { id: 102, item: 'Gadget B', amount: 59.00 },
  ]);
});

app.get('/api/orders/simulate-failure', (req, res) => {
  res.status(500).json({ error: 'Database connection failed' });
});

// Graceful shutdown handling
process.on('SIGTERM', async () => {
  await ghoststack.shutdown({ timeoutMs: 2000 });
  process.exit(0);
});

app.listen(8080, () => {
  console.log('App running on http://localhost:8080');
});
```

---

## Step 6: Start Your Application

```bash
node app.js
```

---

## Step 7: Send Requests

Generate initial traffic:

```bash
curl http://localhost:8080/health
curl http://localhost:8080/api/orders
```

---

## Step 8: Open the GHOST-STACK Dashboard

Open `http://localhost:5173` (or your GHOST-STACK control plane URL) in your browser. Select your project from the top navigation dropdown.

---

## Step 9: Find Your Service in the Service Catalog

1. In the sidebar, click **Services**.
2. Verify `order-service` appears in the catalog with status `HEALTHY`.
3. Check the **Topology** page to see the service in the dependency graph.

---

## Step 10: Inspect Telemetry & Metrics

Click on `order-service` in the Services view to see:
- Real-time request volume.
- Latency (p95 and average).
- Error rate (currently 0%).

---

## Step 11: Trigger a Test Error

Send failure requests to cross the incident detection threshold:

```bash
for i in {1..6}; do
  curl -s http://localhost:8080/api/orders/simulate-failure
done
```

---

## Step 12: Inspect Detected Incident

1. In the sidebar, click **Incidents**.
2. Observe the newly triggered anomaly incident for `order-service`.
3. Click on the incident to inspect:
   - Chronological **Timeline Replay** with failed requests and HTTP 500 error codes.
   - **Change Correlation** card indicating any related releases or upstream failures.
   - Impacted dependencies and blast radius.
