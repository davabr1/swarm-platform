# Swarm — The Marketplace for the Agent Economy

## One-Line Pitch

An open marketplace where AI agents and humans coexist as buyers and sellers — agents sell capabilities, humans monetize custom-built skills, and everyone builds verifiable on-chain reputation.

## Track: Avalanche (x402 + ERC-8004)

## The Problem

The agent economy is exploding but it's fragmented and trust-free:
- AI agents need other agents' capabilities but have no way to discover, compare, or trust them
- People build powerful custom AI skills (tax experts, Solidity auditors, medical coders) but can't monetize them
- When an agent pays for a service, there's no recourse if the quality is bad — no reputation, no accountability
- Existing platforms (Humwork, Payman, Orthogonal) are all one-directional and centralized

## The Solution

Swarm is a unified marketplace built on open protocols:

1. **List** — Anyone can create a specialized AI agent (bake in your domain expertise), set a per-call price in USDC, and list it. Your agent gets an ERC-8004 on-chain identity
2. **Apply as Expert** — Humans apply to join the expert pool — pick your skill categories, set your rate, connect your wallet. You get an ERC-8004 identity too. When agents need human help, you get paid
3. **Discover** — Browse agents by skill, price, and reputation. Or let your own agent query the registry programmatically
4. **Use & Pay** — Call any agent via x402. Pay per request. USDC settles instantly on Avalanche. The creator's wallet receives payment automatically
5. **Escalate** — When an agent hits a task requiring human judgment, it posts a USDC bounty. Human experts claim it, submit the result, get paid instantly. Agents hire humans just like they hire other agents
6. **Rate & Trust** — After every interaction, reputation updates on-chain via ERC-8004. Agents AND humans build verifiable track records. Better reputation → more calls → more revenue. Can't be faked

## Who It's For

- **Skill builders** — Built a powerful domain-specific agent? List it and earn passive income per call. Your agent works 24/7, you collect USDC
- **AI agents** — Need translation? Code review? Data analysis? Query the marketplace, compare reputation scores, pay the best agent autonomously
- **Developers & teams** — Browse and use specialized agents directly. Trust the on-chain reputation, not a platform's word
- **Human experts** — Agent gets stuck or needs human judgment? It posts a USDC-bounty task via x402. Human experts claim tasks, submit results, get paid instantly. Like Humwork, but open and on-chain

## Why Judges Will Score It Well

- **Deep use of BOTH sponsor technologies**: x402 for every payment + all three ERC-8004 registries (Identity, Reputation, Validation)
- **Genuine novelty**: No existing platform combines bidirectional agent commerce with on-chain reputation. Humwork/Payman/Orthogonal are all one-directional and centralized
- **Real-world impact**: Solves the "how do I monetize my AI skill" problem and the "how do I trust an agent" problem simultaneously
- **Strong demo**: Live agent-to-agent commerce with real payments and reputation updates
- **Validates a real market**: YC funded Humwork (agents→humans) and Orthogonal (agents→APIs). This is the unified version with trustless infrastructure

## Technical Architecture

### Frontend (Next.js + React + Tailwind)

- **Marketplace page**: Agent cards showing name, skills, price per call, reputation score (stars + number of ratings), total completed tasks. Filter by skill category, sort by reputation or price
- **Agent detail page**: Full profile, reputation history graph over time, recent reviews, "Try it" interface with input field
- **"List Your Skill" page**: Form to configure a new agent — name, description, skill category, system prompt / knowledge, price per call, creator wallet address. Submits → creates x402 endpoint + registers ERC-8004 identity
- **Live dashboard**: Real-time feed of marketplace activity — payments flowing, reputation updates, agent-to-agent calls. Sankey/flow visualization showing the orchestrator agent delegating tasks
- **Wallet connect**: MetaMask / any EVM wallet for signing and receiving payments

### Backend (Node.js + Express + TypeScript)

- **Agent endpoints**: Each listed agent is an Express route behind x402 middleware. Route receives the request, calls Claude/OpenAI with the agent's custom system prompt, returns the result
- **x402 integration**: `@x402/express` middleware on every agent endpoint. Ultravioleta DAO facilitator (100% gas coverage). Price configured per agent
- **ERC-8004 integration**: ethers.js + contract ABIs from ava-labs/8004-boilerplate
  - Identity Registry: register each agent (mint NFT identity on creation)
  - Reputation Registry: write feedback after each call (caller rates 1-5)
  - Validation Registry: task completion scores (stretch goal)
- **Orchestrator agent**: A special agent that receives complex tasks, breaks them into subtasks, queries the marketplace registry for capable agents, compares reputation scores, calls the best agents via x402, assembles results, and returns the combined output
- **Agent registry API**: CRUD for agent listings, backed by PostgreSQL (Prisma ORM)
- **Database**: PostgreSQL for agent metadata, call logs, creator profiles. On-chain data (identity, reputation) is the source of truth; DB is for fast queries

### On-Chain (Avalanche C-Chain — Fuji Testnet)

- **ERC-8004 Identity Registry**: Each agent gets an NFT identity with URI pointing to metadata (name, skills, pricing). Already deployed on 40+ chains
- **ERC-8004 Reputation Registry**: Feedback signals (int128 scores, categorical tags like "accuracy", "speed"). Written after every completed call
- **USDC payments via x402**: Every agent call settles in USDC on Avalanche. Facilitator handles gas. Creator wallet receives payment directly
- **No custom Solidity contracts needed**: All ERC-8004 contracts are already deployed. We interact via ABIs only

### Key Flows

#### Human creates and lists a skill agent
```
Human fills "List Your Skill" form
  → Backend creates Express route with custom system prompt
  → Backend wraps route with x402 middleware (price from form)
  → Backend calls ERC-8004 Identity Registry: register(agentURI, metadata)
  → Agent appears in marketplace with 0 reputation
  → Every call pays USDC to creator's wallet
```

#### Human uses an agent
```
Human browses marketplace → picks agent by reputation/price
  → Clicks "Try it" → enters input
  → Frontend calls agent endpoint
  → x402 middleware returns 402 → wallet signs payment
  → Payment settles on Avalanche → agent processes request → returns result
  → Human rates the interaction → reputation updates on-chain
```

#### Agent uses another agent (autonomous)
```
Orchestrator receives complex task ("translate this and review the code")
  → Breaks into subtasks: [translation, code_review]
  → Queries ERC-8004 Identity Registry for agents with matching skills
  → Reads ERC-8004 Reputation Registry for each candidate
  → Picks best agent per subtask (weighted: reputation × 0.7 + price × 0.3)
  → Calls each agent's x402 endpoint (signs payment autonomously)
  → Collects results → assembles combined response
  → Rates each agent → reputation updates on-chain
```

#### Agent hires a human expert (core feature)
```
Agent hits a task it can't handle (needs human judgment, real-world verification, etc.)
  → Agent posts a task to the marketplace with:
    - Description of what it needs
    - USDC bounty amount (paid via x402)
    - Required skill category
    - Deadline
  → Task appears in "Open Tasks" feed for human experts
  → Human expert claims the task
  → Human submits result
  → Agent (or automated verification) confirms quality
  → USDC releases to human's wallet instantly
  → Human's ERC-8004 reputation updates (experts build trust too)
```

This is the Humwork model but on open, trustless rails. The agent doesn't need to go through a centralized platform — it posts a bounty on-chain, any verified human can claim it, payment is automatic via x402.

## Pre-Built Marketplace Listings for Demo

### AI Agent Services (automated, x402 paywalled)
| Agent | Skill | Price | Description |
|-------|-------|-------|-------------|
| LinguaBot | Translation | $0.02/call | Translates text between languages |
| CodeReviewer | Code Review | $0.05/call | Reviews code for bugs and improvements |
| Summarizer | Summarization | $0.01/call | Condenses long text into key points |

### Custom Skill Agents (built by humans, earning them passive income)
| Agent | Skill | Price | Creator |
|-------|-------|-------|---------|
| SolidityAuditor | Smart Contract Audit | $0.10/call | "A Solidity security expert who baked 5 years of audit experience into this agent" |

### Human Expert Listings (available for agent escalation)
| Expert | Skill | Rate | Description |
|--------|-------|------|-------------|
| Demo Expert | Code Architecture | $0.50/task | Human expert who agents can hire when they need architectural judgment |

The SolidityAuditor shows skill monetization — creator earns $0.10 every time it's called. The Demo Expert shows the Humwork-style flow — an agent posts a task, a human claims it, gets paid in USDC.

## Build Sequence

### Phase 1: Foundation (~2 hours)
- Next.js + Express project scaffold with TypeScript, Tailwind
- Database schema (agents, calls, creators) with Prisma
- Basic UI shell (marketplace grid, agent detail, list skill form)
- Wallet connect (ethers.js + MetaMask)
- Avalanche Fuji testnet configuration

### Phase 2: Agent Endpoints + x402 (~2 hours)
- Create 4 agent Express routes wrapping Claude/OpenAI API
- Add x402 middleware to each route using @x402/express
- Configure Ultravioleta DAO facilitator
- Test: call agent → get 402 → sign payment → get result
- Wire up "Try it" UI to call agents

### Phase 3: ERC-8004 Integration (~3 hours)
- Set up ethers.js with ERC-8004 contract ABIs (from ava-labs/8004-boilerplate)
- Register all 4 agents in Identity Registry (mint identity NFTs)
- Implement reputation write after each call
- Implement reputation read for marketplace display
- Wire up reputation scores in marketplace UI

### Phase 4: Orchestrator Agent (~2 hours)
- Build orchestrator agent that accepts complex tasks
- Implement subtask breakdown logic
- Implement registry query + reputation comparison
- Implement autonomous x402 calls to selected agents
- Assemble and return combined results
- Add live dashboard showing the orchestration flow

### Phase 5: Agent→Human Task Board (~2 hours)
- Build "Open Tasks" feed where agents post tasks needing human help
- Human expert claim flow — claim task, submit result, get paid
- Wire up: orchestrator agent detects it can't handle a subtask → posts bounty → human claims → result feeds back
- ERC-8004 reputation for human experts too

### Phase 6: "List Your Skill" + Polish (~1.5 hours)
- Build the "List Your Skill" form and backend
- Dynamic agent endpoint creation from form input
- Creator wallet configuration for revenue
- Real-time dashboard with payment/reputation feed
- Mobile-responsive UI polish
- Demo script preparation and testing

## The Demo (3 minutes)

1. **Show the marketplace** — Three types of listings: AI agents, custom skill agents, human experts. All with prices and on-chain reputation
2. **Human uses an agent** — Call the Translator, pay $0.02, get result, rate it. Show reputation update on-chain
3. **Show skill monetization** — Point to SolidityAuditor: "This was built by a Solidity expert who baked their knowledge in. Every call earns them $0.10 in USDC. They're making money while they sleep"
4. **Agent-to-agent commerce** — Give the orchestrator a complex task. Watch it shop the marketplace, compare reputation, hire two agents, pay them, assemble the result. All autonomous
5. **Agent hires a human** — The orchestrator hits a subtask it can't handle. It posts a bounty. A human expert claims it, submits the answer, gets paid USDC instantly. The agent incorporates the human's input and completes the task
6. **Show the dashboard** — Real-time view of the full economy: agents paying agents, agents paying humans, reputation flowing, USDC moving. All on-chain, all verifiable

## Confidence: HIGH

| Component | Tool | Risk |
|-----------|------|------|
| x402 paywalls | @x402/express + Ultravioleta facilitator | Low — battle-tested, 100M+ payments |
| ERC-8004 identity | ethers.js + ABIs + ava-labs boilerplate | Medium — no SDK, but contract interaction is standard |
| AI agents | Express routes + Claude/OpenAI API | Low — straightforward API wrapping |
| Marketplace frontend | Next.js + Tailwind | Low — standard web dev |
| Orchestrator logic | Node.js application code | Low — just HTTP calls + decision logic |
| Payment settlement | USDC on Avalanche Fuji | Low — stable testnet, working faucets |

No custom Solidity. No novel protocols. Just well-integrated existing infrastructure.

## Exact Technical Config (from research)

### Avalanche Fuji Testnet
| Parameter | Value |
|-----------|-------|
| Chain ID | `43113` |
| CAIP-2 (for x402) | `eip155:43113` |
| RPC URL | `https://api.avax-test.network/ext/bc/C/rpc` |
| Explorer | `https://testnet.snowtrace.io/` |
| USDC Contract | `0x5425890298aed601595a70AB815c96711a31Bc65` |

### ERC-8004 Contracts (already deployed on Fuji — NO deployment needed)
| Registry | Address |
|----------|---------|
| Identity | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| Reputation | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |

ABIs from: `https://github.com/erc-8004/erc-8004-contracts/tree/main/abis/`

### x402 Facilitator (Avalanche)
| Facilitator | URL |
|-------------|-----|
| Ultravioleta DAO (primary) | `https://facilitator.ultravioletadao.xyz` |
| x402-rs (backup) | Self-hosted |
| PayAI (backup) | `https://facilitator.payai.network` |

NOTE: Coinbase CDP facilitator does NOT support Avalanche. Must use Ultravioleta or PayAI.

### Key npm Packages
```
@x402/express @x402/evm @x402/core — server-side x402 middleware
@x402/fetch — client-side x402 payment (wraps fetch)
ethers — ERC-8004 contract interaction
viem — x402 payment signing (privateKeyToAccount)
wagmi @rainbow-me/rainbowkit @tanstack/react-query — frontend wallet connect
```

### Wallet Architecture
- Only the ORCHESTRATOR wallet needs funding (AVAX for gas + USDC for payments)
- All agent wallets are RECEIVERS only (no funding needed)
- Human expert wallets are RECEIVERS only
- Ultravioleta facilitator covers settlement gas

## What I Need From You (The Human)

- [ ] Go to https://faucet.avax.network — send AVAX to the orchestrator wallet address (I'll generate it)
- [ ] Go to https://faucet.circle.com — select "Avalanche Fuji", send USDC to the orchestrator wallet address
- [ ] An Anthropic API key — for the AI agent backends (Claude)
- [ ] MetaMask installed with Avalanche Fuji network added — for demo wallet interactions
- [ ] A WalletConnect project ID — free from https://cloud.reown.com (for RainbowKit)

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| ERC-8004 not deployed on Fuji | High | Check first; if missing, deploy via boilerplate (CREATE2 deterministic addresses) |
| ERC-8004 ABI complexity | Medium | Start from ava-labs/8004-boilerplate which has deployment scripts and ABIs ready |
| x402 facilitator downtime | Medium | Ultravioleta + x402-rs as backup facilitator |
| AI API rate limits during demo | Low | Cache common demo queries; use moderate temperature for consistent results |
| Fuji testnet instability | Low | Test thoroughly beforehand; have screenshots as backup |
