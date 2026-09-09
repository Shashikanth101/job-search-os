# Shashikanth — Full Work Experience Context for Resume Generation

## IMPORTANT RULES (always enforce when generating resume bullets)
- Never use em dashes (—). Use a comma and continue the sentence instead.
- Never abbreviate LMS, IMS, VMS, OMS. Use full names or "multiple internal systems."
- Every bullet must be 180–200 characters maximum (hard limit, ~2 lines).
- Use "1M+ user base" for Livspace platform scale. Never "10K+ daily active users."
- Never use the word "monthly" in resume phrasing.
- MFE bullet must use "Contributed to" not "Architected" or "Led."
- React Native bullet must use "Contributed to" not "Led" or "Built."
- Always preserve these metrics: 1M+ users, 250+ Cr, 99.9% uptime, 3K–4K consignments,
  5K–6K products, 4x velocity, 20+ APIs, 20+ interviews, 70%, 25%, 500+ clients, 30%.
- Generate 8–10 Livspace bullets and 4–5 StartUs bullets.
- Always include the Public Services AI Agent in projects.
- Positioning: 85–90% Frontend Engineer. Full-stack capable (light backend).

---

## LIVSPACE — SDE 2 (Nov 2024 – March 2026, Bangalore)

### All Things Home (ATH) — Customer-Facing E-commerce Platform
- Next.js (SSR) application for selling furniture, appliances, materials, and showcasing interiors
- URL: athfe.as1.livspace.com — planned to move to livspace.com officially
- Owned the entire Cart flow end to end — add to cart, cart management, checkout
- Owned the entire Account section: Profile, Addresses, Wallet, Gift Cards, Vouchers, Order History
- Private (authenticated) and Public pages with authentication guards and token refresh handling
- Integrated 20+ backend APIs with resilient API orchestration
- Platform serves 1M+ user base (based on 1.5–1.6M monthly traffic)
- 99.9% uptime, revenue-critical platform supporting projected 250+ Cr annual product revenue
- SSR implementation for performance and SEO on public-facing pages

### LMS — Logistics Management System (Internal, used by Livspace warehouses)
- Managed entire flow of document initiation and generation
- Documents: Customer Invoices, Delivery Challan, E-Way Bills
- Took full initiative, coordinated with LMS team, FMS team, support team, and Product Managers
- Enabling compliant movement of 3K–4K consignments daily across India
- Cross-functional ownership — worked across multiple teams to deliver end to end

### FMS — Finance Management System (Internal)
- Application to handle all financial transactions within the company
- Worked on audit-critical billing workflows essential for the company's IPO readiness
- Legacy app built on Play framework and Angular 1
- Stabilized critical workflows in partnership with Finance and Store Central teams

### OPS — Internal Platform with Multiple MFEs
- Application integrating multiple Micro-Frontends: IMS (Inventory Management System),
  VMS (Vendor Management System), OMS (Orders Management System)
- Contributed to Webpack Module Federation architecture enabling independent deployments
  within a unified Composer shell
- Worked on Purchase Orders, product listing, timeline handling within the MFE platform
- Shared, highly reusable frontend platform across teams

### TARS — Manufacturing Pipeline System (Internal)
- System managing manufacturing pipeline: beam saw, drilling, sorting, QC, packaging
- Owned Invoice Management section: listing, upload, edit, zoom in/out UI interactions
- Supporting processing of 5K–6K furnishing products daily across vendor factories pan-India

### React Native Internal App
- Contributed to an internal React Native application
- Built Node.js CRUD APIs for the app
- Implemented timeline and workforce tracking features
- Used by 3000+ site managers, designers, and workers across 100+ cities in India

### AI-Assisted Engineering
- Improved frontend delivery velocity by 4x using AI-assisted workflows and internal tooling
- Reduced multi-day UI implementations to same-day execution while maintaining review standards

### Hiring & Interviews
- Conducted 20+ technical interviews for SDE 1/2 roles
- Evaluated frontend architecture, problem-solving ability, and code quality
- Part of the official hiring panel

---

## STARTUS INSIGHTS — Frontend Engineer (Dec 2020 – Nov 2024, Remote)

### Platform Modernization
- Migrated a large-scale B2B SaaS platform from jQuery to React
- Improved development velocity by 70% and enabled scalable component-driven architecture
- Full migration ownership — architecture decisions, component standards, TypeScript adoption

### GraphQL Optimization
- Optimized GraphQL data-fetching and caching strategies
- Reduced server load by 25%
- Improved page responsiveness across data-heavy product surfaces

### Chrome Extension
- Led end-to-end development of a Chrome Extension
- 500+ active business clients
- Owned architecture, deployment pipeline, and ongoing maintenance
- Renders structured company intelligence from any webpage
- Interactive visualizations for company growth metrics

### Companies and Trends Analyzer (B2B SaaS React Application)
- Co-architected a large-scale React application to search, filter, and visualize millions
  of company datasets
- Modular UI architecture with theming system (Material UI, light/dark mode)
- Several interactive charts and data visualizations
- Implemented polling system for LLM-powered search with optimized concurrency handling

### Analytics & Feature Tracking
- Designed analytics-driven feature tracking system
- Improved underutilized feature engagement by 30%
- Surfaced product insights that drove roadmap decisions

### Testing & CI/CD
- Delivered production-grade code with unit, integration, and E2E tests
- Tests integrated into CI/CD pipelines (Jest, Cypress)
- Maintained high code quality standards across all releases

---

## HACKATHON PROJECT — Public Services AI Agent

### Event
- Build What Moves India Hackathon by AEOS x OpenAI
- 13,000+ participants
- Solo-built entry

### Project: Seva — Agentic AI Assistant for Public Services
- Unified conversational UI (WhatsApp-style) for citizens to access EPFO, IRCTC,
  and Parivahan services
- Full agentic system with LLM orchestration loop

### Technical Architecture
- Tool-calling orchestration layer where LLM dynamically selects and invokes tools
  via function-calling against defined schemas
- MCP (Model Context Protocol) servers for government-style API access
- RAG (Retrieval-Augmented Generation) pipeline for grounding responses in official
  public-service guidance
- File-based RAG covering EPFO, IRCTC, Parivahan flows
- Application-owned validation and confirmation flows separating LLM intent from
  authoritative state — preventing stale or cross-service mutations
- Response-rendering layer mapping LLM outputs to structured UI cards

### Tech Stack
- Frontend: React (Vite)
- Backend: Node.js
- Database: PostgreSQL — persisting user accounts and conversation history
- LLM integration with function-calling and tool-use patterns

---

## SKILLS REFERENCE (use these exact formulations)

### AI & Agentic Systems
LLM Integration, Tool-Calling/Function-Calling, RAG, MCP (Model Context Protocol)

### Frontend
React, Next.js (SSR/SSG/ISR), TypeScript, JavaScript (ES6+), HTML5, CSS3, React Native

### State & Data
Redux, Zustand, GraphQL, REST APIs, API Orchestration, Tanstack Query

### Architecture
Micro-Frontends (Webpack Module Federation), Webpack, SSR, Authentication Flows, System Design

### Backend, Tooling & Practices
Node.js, PostgreSQL, Jest, Cypress, Git, CI/CD, Chrome Extensions, Agile/Scrum

---

## EDUCATION
- Scaler Academy — Advanced Software Development & DSA (2023)
- M. S. Ramaiah Institute of Technology, Bangalore — B.E. Electronics & Communication (2020)

---

## CONTACT (static, never generated)
- Name: Shashikanth
- Location: Bangalore, KA, India
- Phone: +91 8660259406
- Email: shashikanth15299@gmail.com
- Github: https://github.com/Shashikanth101
- LinkedIn: https://www.linkedin.com/in/shashikanth-p-62658b17b/