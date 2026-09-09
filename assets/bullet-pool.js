export const LIVSPACE_BULLETS = [
  { id: 'L1', text: 'Owned core frontend domains (Cart \\& Account) in a revenue-critical Next.js (SSR) platform serving a \\textbf{1M+ user base} with \\textbf{99.9\\% uptime}, supporting \\textbf{\\rupee 250+ Cr annual product revenue}' },
  { id: 'L2', text: 'Built the complete Account module (Profile, Addresses, Wallet, Order History), integrating \\textbf{20+ backend APIs} with authentication guards, token refresh handling, and resilient API orchestration' },
  { id: 'L3', text: 'Led frontend workflow for Delivery Challan and E-Way Bill generation in the Logistics Management System, enabling compliant movement of \\textbf{3K--4K consignments daily} across India' },
  { id: 'L4', text: 'Implemented \\textbf{Micro-Frontend architecture} using \\textbf{Webpack Module Federation}, building a shared, highly reusable frontend platform enabling independent deployments within a unified Composer shell' },
  { id: 'L5', text: 'Owned Invoice Management workflows in TARS (manufacturing pipeline system), supporting processing of \\textbf{5K--6K furnishing products daily} across vendor factories pan-India' },
  { id: 'L6', text: 'Partnered with Finance and Store Central teams to stabilize \\textbf{audit-critical billing workflows} for IPO readiness, ensuring compliance across legacy Angular and Play framework systems' },
  { id: 'L7', text: 'Improved frontend \\textbf{delivery velocity by 10x} using AI-assisted workflows and internal tooling, reducing multi-day UI implementations to same-day execution while maintaining review standards' },
  { id: 'L8', text: 'Conducted \\textbf{20+ technical interviews} for SDE 1/2 roles, evaluating frontend architecture, problem-solving ability, and code quality as part of the hiring panel' },
  { id: 'L9', text: 'Contributed to an internal \\textbf{React Native} application, building \\textbf{Node.js} CRUD APIs and implementing timeline and workforce tracking for \\textbf{3000+} site managers across \\textbf{100+ cities}' },
];

export const STARTUS_BULLETS = [
  { id: 'S1', text: 'Migrated a large-scale B2B SaaS platform from jQuery to React, \\textbf{improving development velocity by 70\\%} and enabling a scalable, component-driven architecture' },
  { id: 'S2', text: 'Optimized GraphQL data-fetching and caching strategies, \\textbf{reducing server load by 25\\%} and improving performance across data-heavy product surfaces' },
  { id: 'S3', text: 'Led end-to-end development of a Chrome Extension (\\textbf{500+ active business clients}), owning architecture, deployment pipeline, and maintenance to render structured company intelligence' },
  { id: 'S4', text: 'Co-architected a B2B SaaS React application to search, filter, and visualize millions of company datasets, with interactive charts and a modular theming system supporting light and dark modes' },
  { id: 'S5', text: 'Delivered production-grade code with unit, integration, and E2E tests (Jest, Cypress) integrated into CI/CD pipelines across all product releases' },
  { id: 'S6', text: 'Designed analytics-driven feature tracking that surfaced underutilized product areas and \\textbf{improved feature engagement by 30\\%}' },
  { id: 'S_CORE1', text: 'Co-architected a large-scale B2B SaaS React application to search, filter, and visualize millions of company datasets, migrating from jQuery to React and \\textbf{improving development velocity by 70\\%}' },
  { id: 'S_CORE2', text: 'Led end-to-end development of a Chrome Extension (\\textbf{500+ active business clients}), owning architecture and deployment, and optimized GraphQL caching \\textbf{reducing server load by 25\\%}' },
  { id: 'S_CORE3', text: 'Delivered production-grade code with unit, integration, and E2E tests in CI/CD pipelines, and designed analytics-driven feature tracking that \\textbf{improved feature engagement by 30\\%}' },
];

export const PROJECT_BULLETS = [
  { id: 'P1', text: 'Solo-built \\textbf{Seva}, an \\textbf{agentic AI} assistant providing citizens a unified \\textbf{conversational UI} over EPFO, IRCTC, and Parivahan services, built for 13,000+ participant AEOS x OpenAI Hackathon' },
  { id: 'P2', text: 'Architected a \\textbf{tool-calling orchestration layer} where an \\textbf{LLM} dynamically selects and invokes tools via \\textbf{function-calling} against defined schemas, integrating \\textbf{MCP} servers for API access' },
  { id: 'P3', text: 'Built a \\textbf{RAG pipeline} grounding responses in official public-service guidance, complementing structured API tools for authoritative account data and action handling' },
  { id: 'P4', text: 'Designed application-owned validation and confirmation flows separating LLM intent from authoritative state, preventing stale or cross-service actions from triggering mutations' },
  { id: 'P5', text: 'Developed full stack using \\textbf{React (Vite)}, \\textbf{Node.js}, and \\textbf{PostgreSQL}, persisting user accounts and conversation history with a response-rendering layer mapping LLM outputs to UI cards' },
];

export const SKILLS_POOL = {
  ai_agentic: {
    core: 'LLM Integration, Tool-Calling, RAG, MCP',
    optional: ['Agentic Systems', 'AI-assisted workflows', 'Function-Calling'],
  },
  frontend: {
    core: 'React, Next.js, TypeScript, JavaScript, HTML5, CSS3',
    optional: ['React Native', 'Vite', 'Tailwind CSS'],
  },
  state_and_data: {
    core: 'Redux, GraphQL, REST APIs, API Orchestration',
    optional: ['Zustand', 'Tanstack Query', 'WebSockets'],
  },
  architecture: {
    core: 'Micro-Frontends (Webpack Module Federation), Webpack, SSR',
    optional: ['Authentication Flows', 'System Design', 'Performance Optimization'],
  },
  backend_and_tooling: {
    core: 'Node.js, Jest, Cypress, Git, CI/CD, Chrome Extensions',
    optional: ['PostgreSQL', 'Agile/Scrum'],
  },
};

export const SKILLS_FIXED = {
  ai_agentic: 'LLM Integration, Tool-Calling/Function-Calling, RAG, MCP (Model Context Protocol)',
  frontend: 'React, Next.js (SSR/SSG/ISR), TypeScript, JavaScript (ES6+), HTML5, CSS3, React Native',
  state_and_data: 'Redux, Zustand, GraphQL, REST APIs, API Orchestration, Tanstack Query',
  architecture: 'Micro-Frontends (Webpack Module Federation), Webpack, SSR, Authentication Flows, System Design',
  backend_and_tooling: 'Node.js, PostgreSQL, Jest, Cypress, Git, CI/CD, Chrome Extensions, Agile/Scrum',
};
