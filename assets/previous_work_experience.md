# Shashikanth: Full Work Experience Context for Resume Generation

## RULES (always enforce when generating resume content)
- Never use em dashes. Use a comma and continue the sentence instead. Ranges such as 3K–4K are fine.
- Never abbreviate the Logistics, Inventory, Vendor or Orders Management Systems (LMS, IMS, VMS, OMS). Use the full names or "multiple internal systems."
- Every bullet must be between 180 and 200 characters including spaces (hard limits in both directions, about 2 lines).
- Use "1M+ user base" for Livspace platform scale. Never "50K+ daily active users."
- Never use the word "monthly" in resume text.
- The micro-frontend bullet must use "Contributed to", not "Architected" or "Led."
- The React Native bullet must use "Contributed to", not "Led" or "Built."
- Always preserve these metrics: 1M+ users, 250+ Cr, 99.9% uptime, 3K–4K consignments, 5K–6K products, 4x velocity, 20+ services, 20+ interviews, 70%, 25%, 500+ clients, 30%.
- Generate 8 to 10 Livspace bullets and 4 to 5 StartUs bullets.
- Projects: always include the Public Services AI Agent (Seva). For AI, agentic, Forward Deployed Engineer or full-stack roles, also include job-search-os. Fill any remaining project slot from the StartUs projects.
- Positioning: default is 85 to 90% Frontend Engineer, full-stack capable (light backend). For full-stack, Forward Deployed Engineer or applied AI roles, lead with API orchestration, Node.js APIs, PostgreSQL and the AI projects, but never claim backend ownership beyond what is listed below.
- Skills section only: if a job description asks for a small adjacent tool or library that can be learned within a week (for example another state library, Storybook, Context API, similar frontend or tooling items), it may be added to the Skills section. Never add it to a bullet as used experience or with metrics. Do not add new languages, runtimes or domains (for example Go, Java, C++, Rust, security, ML research).

---

## LIVSPACE: SDE 2 (Nov 2024 to March 2026, Bangalore)

### All Things Home (ATH): Customer-Facing E-commerce Platform
- Next.js (SSR) application for selling furniture, appliances, materials, and showcasing interiors
- Planned to move to livspace.com officially
- Owned the entire Cart flow end to end: add to cart, cart management, checkout
- Owned the entire Account section: Profile, Addresses, Wallet, Gift Cards, Vouchers, Order History
- Private (authenticated) and Public pages with authentication guards and token refresh handling
- Integrated 20+ backend services with resilient API orchestration
- Platform serves 1M+ user base (source note, never write this in output: derived from 1.5–1.6M traffic figures)
- 99.9% uptime, revenue-critical platform supporting projected 250+ Cr annual product revenue
- SSR implementation for performance and SEO on public-facing pages

### Logistics Management System (internal, used by Livspace warehouses)
- Managed the entire flow of document initiation and generation
- Documents: Customer Invoices, Delivery Challan, E-Way Bills
- Took full initiative, coordinated with the logistics team, finance team, support team, and Product Managers
- Enabling compliant movement of 3K–4K consignments daily across India
- Cross-functional ownership, worked across multiple teams to deliver end to end

### Finance Management System (internal)
- Application to handle all financial transactions within the company
- Worked on audit-critical billing workflows essential for the company's IPO readiness
- Legacy app built on Play framework and Angular 1
- Stabilized critical workflows in partnership with Finance and Store Central teams

### OPS: Internal Platform with Multiple Micro-Frontends
- Application integrating multiple Micro-Frontends: Inventory Management System, Vendor Management System, Orders Management System
- Contributed to Webpack Module Federation architecture enabling independent deployments within a unified Composer shell
- Worked on Purchase Orders, product listing, timeline handling within the micro-frontend platform
- Shared, highly reusable frontend platform across teams

### TARS: Manufacturing Pipeline System (internal)
- System managing the manufacturing pipeline: beam saw, drilling, sorting, QC, packaging
- Owned the Invoice Management section: listing, upload, edit, zoom in/out UI interactions
- Supporting processing of 5K–6K furnishing products daily across vendor factories pan-India

### React Native Internal App
- Contributed to an internal React Native application
- Built Node.js CRUD APIs for the app
- Implemented timeline and workforce tracking features
- Used by 3000+ site managers, designers, and workers across 100+ cities in India

### AI-Assisted Engineering
- Improved frontend delivery velocity by 4x using AI-assisted workflows and internal tooling
- Reduced multi-day UI implementations to same-day execution while maintaining review standards

### Hiring and Interviews
- Conducted 20+ technical interviews for SDE 1/2 roles
- Evaluated frontend architecture, problem-solving ability, and code quality
- Part of the official hiring panel

---

## STARTUS INSIGHTS: Frontend Engineer (Dec 2020 to Nov 2024, Remote)

### Platform Modernization
- Migrated a large-scale B2B SaaS platform from jQuery to React
- Improved development velocity by 70% and enabled scalable component-driven architecture
- Full migration ownership: architecture decisions, component standards, TypeScript adoption

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
- Co-architected a large-scale React application to search, filter, and visualize millions of company datasets
- Modular UI architecture with theming system (Material UI, light/dark mode)
- Several interactive charts and data visualizations
- Implemented polling system for LLM-powered search with optimized concurrency handling

### Analytics and Feature Tracking
- Designed analytics-driven feature tracking system
- Improved underutilized feature engagement by 30%
- Surfaced product insights that drove roadmap decisions

### Testing and CI/CD
- Delivered production-grade code with unit, integration, and E2E tests
- Tests integrated into CI/CD pipelines (Jest, Cypress)
- Maintained high code quality standards across all releases

---

## PROJECT: Public Services AI Agent (Seva)

### Event
- Build What Moves India Hackathon by AEOS x OpenAI
- 13,000+ participants
- Solo-built entry

### Overview
- Agentic AI assistant for public services with a unified conversational UI (WhatsApp-style) for citizens to access EPFO, IRCTC, and Parivahan services
- Full agentic system with an LLM orchestration loop

### Technical Architecture
- Tool-calling orchestration layer where the LLM dynamically selects and invokes tools via function-calling against defined schemas
- MCP (Model Context Protocol) servers for government-style API access
- RAG (Retrieval-Augmented Generation) pipeline for grounding responses in official public-service guidance
- File-based RAG covering EPFO, IRCTC, Parivahan flows
- Application-owned validation and confirmation flows separating LLM intent from authoritative state, preventing stale or cross-service mutations
- Response-rendering layer mapping LLM outputs to structured UI cards

### Tech Stack
- Frontend: React (Vite)
- Backend: Node.js
- Database: PostgreSQL, persisting user accounts and conversation history
- LLM integration with function-calling and tool-use patterns

---

## PROJECT: job-search-os (solo-built job search automation system)
- Full-stack application: Node.js and Express backend, React (Vite) dashboard, SQLite
- ATS scrapers across five platforms (Greenhouse, Lever, SmartRecruiters, Ashby, Workday) running on a schedule, with a title and location pre-filter before any LLM call
- LLM-based job relevance ranking with an idempotent per-job state machine, daily budget cap, run lock and circuit breaker, so scheduled runs never re-score jobs or overspend
- Resume generation pipeline with LaTeX to PDF output and a keyword-gap checker
- Source note, never write in output: no verified numbers yet, so do not invent counts of companies, jobs or users

---

## SKILLS REFERENCE (use these exact formulations)

### AI and Agentic Systems
LLM Integration, Tool-Calling/Function-Calling, RAG, MCP (Model Context Protocol)

### Frontend
React, Next.js (SSR/SSG/ISR), TypeScript, JavaScript (ES6+), HTML5, CSS3, React Native

### State and Data
Redux, Zustand, GraphQL, REST APIs, API Orchestration, Tanstack Query

### Architecture
Micro-Frontends (Webpack Module Federation), Webpack, SSR, Authentication Flows, System Design

### Backend, Tooling and Practices
Node.js, PostgreSQL, Jest, Cypress, Git, CI/CD, Chrome Extensions, Agile/Scrum

---

## NOT PART OF THIS FILE
Name, contact details and education are static in the LaTeX template and are never sent to the model.