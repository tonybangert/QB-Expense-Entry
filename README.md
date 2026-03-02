# QB Expense Agent — PerformanceLabs.AI

An AI-powered virtual agent that processes receipts (via email or direct upload) and automatically enters them as expenses in QuickBooks Online.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        RECEIPT INGESTION                        │
│                                                                 │
│   📧 Email (IMAP/Webhook)    📤 Web Upload (REST API)          │
│         │                           │                           │
│         └──────────┬────────────────┘                           │
│                    ▼                                            │
│         ┌──────────────────┐                                    │
│         │  Receipt Queue   │  (Bull/Redis job queue)            │
│         └────────┬─────────┘                                    │
│                  ▼                                              │
│   ┌──────────────────────────┐                                  │
│   │   AI Extraction Engine   │  Claude API (Vision)             │
│   │                          │                                  │
│   │  • OCR receipt image     │                                  │
│   │  • Extract structured    │                                  │
│   │    data (vendor, date,   │                                  │
│   │    amount, tax, items)   │                                  │
│   │  • Categorize expense    │                                  │
│   │  • Confidence scoring    │                                  │
│   └────────────┬─────────────┘                                  │
│                ▼                                                │
│   ┌──────────────────────────┐                                  │
│   │    Review Dashboard      │  (React frontend)                │
│   │                          │                                  │
│   │  • Preview extraction    │                                  │
│   │  • Edit/correct fields   │                                  │
│   │  • Approve or reject     │                                  │
│   │  • Batch operations      │                                  │
│   └────────────┬─────────────┘                                  │
│                ▼                                                │
│   ┌──────────────────────────┐     ┌────────────────────────┐   │
│   │   QuickBooks Service     │────▶│  QuickBooks Online API │   │
│   │                          │     │                        │   │
│   │  • OAuth 2.0 connection  │     │  • Purchase entity     │   │
│   │  • Vendor matching       │     │  • Vendor entity       │   │
│   │  • Account mapping       │     │  • Account entity      │   │
│   │  • Expense creation      │     │  • Attachable entity   │   │
│   │  • Receipt attachment    │     │    (receipt images)     │   │
│   └──────────────────────────┘     └────────────────────────┘   │
│                                                                 │
│   ┌──────────────────────────┐                                  │
│   │   SQLite / PostgreSQL    │  Local data store                │
│   │  • Receipt records       │                                  │
│   │  • Processing status     │                                  │
│   │  • QB sync log           │                                  │
│   │  • Category mappings     │                                  │
│   └──────────────────────────┘                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## How to Connect QuickBooks Online (Step-by-Step)

### Step 1: Create an Intuit Developer Account

1. Go to **https://developer.intuit.com**
2. Sign in with your existing Intuit/QuickBooks credentials (or create a new account)
3. You'll land on the **Developer Dashboard**

### Step 2: Create a Workspace

1. From the dashboard, click **"Create a Workspace"**
2. Fill in your business info (PerformanceLabs.AI)
3. This workspace holds your OAuth apps

### Step 3: Create an OAuth App

1. Inside your workspace, click **"Create an App"**
2. Select **"QuickBooks Online and Payments"** as the platform
3. Give it a name: `PL Expense Agent`
4. Select scope: **`com.intuit.quickbooks.accounting`**
   - This gives access to all accounting entities (expenses, vendors, accounts, etc.)
5. Click **"Create App"**

### Step 4: Get Your Credentials

1. Navigate to **Development Settings → Keys & Credentials**
2. You'll see two key values:
   - **Client ID** — public identifier for your app
   - **Client Secret** — keep this secret, never commit to git
3. Under **Redirect URIs**, add:
   - Development: `http://localhost:3000/api/auth/callback`
   - Production: `https://yourdomain.com/api/auth/callback`
4. Save changes

### Step 5: Set Up the Sandbox (for Testing)

Intuit provides a sandbox company with dummy data so you can test without touching real books.

- Your sandbox credentials are under **Development Settings**
- The sandbox API base URL is: `https://sandbox-quickbooks.api.intuit.com`
- Production API base URL is: `https://quickbooks.api.intuit.com`

### Step 6: OAuth 2.0 Flow (How It Actually Works)

```
Your App                    Intuit Auth Server              QuickBooks API
   │                              │                              │
   │  1. Redirect user to ────▶  │                              │
   │     authorization URL        │                              │
   │                              │                              │
   │  ◀──── 2. User logs in, ──  │                              │
   │         grants permission    │                              │
   │                              │                              │
   │  3. Receive auth code ◀───  │                              │
   │     at redirect URI          │                              │
   │                              │                              │
   │  4. Exchange code for ────▶ │                              │
   │     access + refresh tokens  │                              │
   │                              │                              │
   │  ◀──── 5. Tokens returned ─ │                              │
   │                              │                              │
   │  6. API calls with ─────────────────────────────────────▶  │
   │     access token (Bearer)    │                              │
   │                              │                              │
   │  7. When token expires, ──▶ │                              │
   │     use refresh token        │                              │
```

**Key token details:**
- **Access token** expires after **1 hour**
- **Refresh token** expires after **100 days**
- You MUST implement auto-refresh logic so the connection doesn't break
- Store tokens securely (encrypted at rest)

### Step 7: Test with the OAuth Playground

Before writing code, validate your setup:
1. Go to your app's **Keys & OAuth** page
2. Click the **OAuth 2.0 Playground** link
3. Select your app and "Accounting" scope
4. Click "Get Authorization Code" → log in → authorize
5. Click "Get Tokens" to receive your access/refresh tokens
6. Use "Make API Call" to test an endpoint like `GET /v3/company/{companyId}/companyinfo/{companyId}`

---

## QuickBooks API — Key Entities for Expense Management

### Purchase (This is how you create expenses)

The **Purchase** entity is the API representation of an expense in QuickBooks. The `PaymentType` field determines what kind of transaction it creates:

| PaymentType | Creates in QB UI |
|---|---|
| `Cash` | Expense transaction |
| `Check` | Check transaction |
| `CreditCard` | Credit card expense |

**Example: Create an Expense**
```json
POST /v3/company/{companyId}/purchase
Content-Type: application/json

{
  "PaymentType": "Cash",
  "AccountRef": {
    "value": "42",
    "name": "Checking"
  },
  "EntityRef": {
    "value": "56",
    "name": "Office Depot"
  },
  "TxnDate": "2026-02-15",
  "TotalAmt": 127.54,
  "Line": [
    {
      "Amount": 127.54,
      "DetailType": "AccountBasedExpenseLineDetail",
      "AccountBasedExpenseLineDetail": {
        "AccountRef": {
          "value": "7",
          "name": "Office Supplies"
        }
      },
      "Description": "Printer paper and toner cartridges"
    }
  ],
  "PrivateNote": "Auto-entered by PL Expense Agent"
}
```

### Other Key Entities

| Entity | Purpose |
|---|---|
| **Vendor** | Look up or create vendors to assign expenses to |
| **Account** | Chart of accounts — maps to expense categories |
| **Attachable** | Upload receipt images and link them to purchases |
| **CompanyInfo** | Verify connection and get company details |

### Querying Existing Data

QuickBooks uses a SQL-like query language:
```
GET /v3/company/{companyId}/query?query=SELECT * FROM Vendor WHERE DisplayName LIKE '%Office%'
GET /v3/company/{companyId}/query?query=SELECT * FROM Account WHERE AccountType = 'Expense'
```

---

## Tech Stack

| Component | Technology |
|---|---|
| Runtime | Node.js 20+ |
| Framework | Express.js |
| AI / OCR | Claude API (Anthropic) with Vision |
| Database | SQLite (dev) → PostgreSQL (prod) |
| Job Queue | Bull + Redis |
| Email Ingestion | IMAP listener or Postmark Inbound Webhook |
| Auth | OAuth 2.0 (Intuit) |
| Frontend | React (review dashboard) |
| Deployment | Docker → VPS or cloud |

---

## Project Structure

```
qb-expense-agent/
├── config/
│   ├── default.json          # Default configuration
│   └── quickbooks.js         # QB OAuth config & endpoints
│
├── src/
│   ├── index.js              # Express app entry point
│   │
│   ├── services/
│   │   ├── quickbooks.js     # QB API client (auth, CRUD, token refresh)
│   │   ├── receipt-parser.js # Claude Vision receipt extraction
│   │   ├── email-ingestion.js# IMAP/webhook email monitoring
│   │   ├── categorizer.js    # Smart expense categorization
│   │   └── queue.js          # Bull job queue for async processing
│   │
│   ├── routes/
│   │   ├── auth.js           # OAuth callback & token management
│   │   ├── receipts.js       # Upload & processing endpoints
│   │   ├── expenses.js       # Review, approve, push to QB
│   │   └── dashboard.js      # Frontend API routes
│   │
│   ├── middleware/
│   │   ├── auth.js           # JWT session validation
│   │   └── upload.js         # Multer file upload config
│   │
│   ├── utils/
│   │   ├── token-store.js    # Encrypted token storage
│   │   └── logger.js         # Structured logging
│   │
│   └── templates/
│       └── extraction-prompt.md  # Claude extraction prompt template
│
├── scripts/
│   ├── setup-db.js           # Database initialization
│   └── test-qb-connection.js # Quick connection verification
│
├── tests/
├── .env.example              # Environment variable template
├── package.json
├── docker-compose.yml
└── README.md
```

---

## Getting Started

### 1. Clone & Install
```bash
git clone <repo-url>
cd qb-expense-agent
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your QuickBooks credentials and API keys
```

### 3. Connect QuickBooks
```bash
npm run dev
# Visit http://localhost:3000/api/auth/connect
# This redirects you to Intuit to authorize the app
# After authorization, tokens are stored automatically
```

### 4. Test the Connection
```bash
node scripts/test-qb-connection.js
# Should output your company info from QuickBooks
```

### 5. Process Your First Receipt
```bash
# Upload via API
curl -X POST http://localhost:3000/api/receipts/upload \
  -F "receipt=@/path/to/receipt.jpg"

# Or forward an email to your configured ingestion address
```

---

## Development Phases

### Phase 1: Foundation (Current)
- [x] Project scaffold
- [ ] QuickBooks OAuth connection
- [ ] Token storage & auto-refresh
- [ ] Basic Express server

### Phase 2: Receipt Processing
- [ ] File upload endpoint
- [ ] Claude Vision integration for extraction
- [ ] Extraction prompt engineering
- [ ] Confidence scoring

### Phase 3: QuickBooks Integration
- [ ] Vendor lookup/creation
- [ ] Account/category mapping
- [ ] Purchase (expense) creation
- [ ] Receipt image attachment

### Phase 4: Email Ingestion
- [ ] IMAP listener or Postmark webhook
- [ ] Email parsing (extract attachments)
- [ ] Auto-queue for processing

### Phase 5: Review Dashboard
- [ ] React frontend
- [ ] Receipt preview with extracted data
- [ ] Edit/approve/reject workflow
- [ ] Batch operations

### Phase 6: Intelligence & Automation
- [ ] Learning from corrections
- [ ] Auto-categorization improvement
- [ ] Duplicate detection
- [ ] Recurring expense recognition
