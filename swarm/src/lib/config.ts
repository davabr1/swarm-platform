// Next.js loads .env* files automatically in dev; Vercel injects env vars at runtime.
// No manual .env parsing needed here.

// All platform-made agents share ONE receiving wallet. Custom user-listed
// agents keep their creator's wallet (see /api/agents/create). This keeps
// the platform-side revenue concentrated and reduces the number of wallets
// we need to fund.
const PLATFORM_AGENT_ADDRESS =
  process.env.PLATFORM_AGENT_ADDRESS || "0x5758ef79224e51745a8921f1dc5BC1524eB8C53C";

export const config = {
  // Avalanche Fuji
  rpc: process.env.AVALANCHE_FUJI_RPC || "https://api.avax-test.network/ext/bc/C/rpc",
  chainId: 43113,
  caip2: "eip155:43113",
  usdcContract: process.env.USDC_CONTRACT || "0x5425890298aed601595a70AB815c96711a31Bc65",

  // x402
  facilitatorUrl: process.env.FACILITATOR_URL || "https://facilitator.ultravioletadao.xyz",

  // ERC-8004
  identityRegistry: process.env.IDENTITY_REGISTRY || "0x8004A818BFB912233c491871b3d84c89A494BD9e",
  reputationRegistry: process.env.REPUTATION_REGISTRY || "0x8004B663056A597Dffe9eCcC1965A193B7388713",

  // AI — Vertex AI (service-account-bound API key)
  googleApiKey: process.env.GOOGLE_API_KEY || "",
  gcpProjectId: process.env.GCP_PROJECT_ID || "",
  gcpLocation: process.env.GCP_LOCATION || "us-central1",

  // Shared receiving wallet for ALL platform-made agents.
  platformAgentAddress: PLATFORM_AGENT_ADDRESS,

  // Agent wallets
  orchestrator: {
    privateKey: process.env.ORCHESTRATOR_PRIVATE_KEY || "",
    address: process.env.ORCHESTRATOR_ADDRESS || "",
  },
  agents: {
    linguaBot: {
      privateKey: process.env.LINGUABOT_PRIVATE_KEY || "",
      address: PLATFORM_AGENT_ADDRESS,
      name: "Chainsight",
      skill: "On-Chain Forensics",
      description:
        "Traces fund flows, clusters wallets, and produces evidence-grade on-chain forensics reports with mixer-aware heuristics.",
      price: "0.14 USDC",
      systemPrompt:
        "You are an on-chain forensics analyst specializing in Ethereum, Avalanche, Solana, and zk-rollups. Given a wallet, transaction, or exploit, produce a structured forensics report: (1) timeline of movements with block numbers and amounts, (2) address clusters and labels using heuristics (mixer interactions, CEX deposits, bridge activity), (3) likely motive, (4) recoverable vs obfuscated funds estimate, (5) recommended next steps for law enforcement or the protocol team. Cite tx hashes and be evidence-grade.",
    },
    codeReviewer: {
      privateKey: process.env.CODE_REVIEWER_PRIVATE_KEY || "",
      address: PLATFORM_AGENT_ADDRESS,
      name: "Solmantis",
      skill: "Solidity Exploit Detection",
      description:
        "Deep Solidity exploit detection — reentrancy windows, delegatecall traps, storage collisions, upgrade-path risks.",
      price: "0.18 USDC",
      systemPrompt:
        "You are a Solidity exploit researcher with a deep background in reentrancy patterns, delegatecall and proxy storage collisions, selfdestruct traps, signature replay, and cross-chain bridge failure modes. Review the given Solidity for realistic exploit paths only — no style or preference nits. For each finding: (1) exploit classification, (2) severity (critical/high/medium), (3) PoC sketch or attack sequence, (4) concrete patch. Skip findings you cannot justify with a reproducible path.",
    },
    summarizer: {
      privateKey: process.env.SUMMARIZER_PRIVATE_KEY || "",
      address: PLATFORM_AGENT_ADDRESS,
      name: "MEV Scope",
      skill: "MEV & Orderflow Analysis",
      description:
        "Decodes MEV attacks, sandwiches, JIT liquidity, and private-mempool flow — builder-aware, cross-chain.",
      price: "0.09 USDC",
      systemPrompt:
        "You are an MEV analyst specializing in Ethereum, Base, Arbitrum, and BNB chain orderflow. Given a block range, tx hash, or pool, identify: (1) sandwich attacks (front/victim/back txs, profit in ETH/USD), (2) JIT liquidity events, (3) back-runs and atomic arbitrage, (4) builder-level routing behavior and private-mempool usage. Be precise about gas costs vs extraction. If insufficient data, state what you need.",
    },
    solidityAuditor: {
      privateKey: process.env.SOLIDITY_AUDITOR_PRIVATE_KEY || "",
      address: PLATFORM_AGENT_ADDRESS,
      name: "RegulaNet",
      skill: "Regulatory & MiCA Compliance",
      description:
        "Jurisdiction-aware regulatory analysis for token launches, stablecoins, and DeFi frontends — MiCA, SEC, and FATF framing.",
      price: "0.22 USDC",
      systemPrompt:
        "You are a crypto regulatory analyst with depth in MiCA (EU), SEC enforcement precedent (Howey, Reves), FATF travel-rule, MSB registration, and state-by-state money transmission posture. Given a product description or token design, produce: (1) classification risk by major jurisdiction, (2) disclosure and registration obligations, (3) recent enforcement actions that match the pattern, (4) concrete mitigations a small legal team can ship in 30 days. Be conservative and cite specific rules.",
    },
  },

  // Image generation agents — each pinned to a specific Gemini image model.
  // All backed by Nano Banana 2 (Flash) for speed. Pro was 3-5× slower in
  // practice and the user traded quality headroom for latency across the
  // board; re-pinning an agent to Pro is a one-line change here if needed.
  imageAgents: {
    lumen: {
      privateKey: process.env.LUMEN_PRIVATE_KEY || "",
      address: PLATFORM_AGENT_ADDRESS,
      id: "lumen",
      name: "Lumen",
      skill: "Image · Photorealistic",
      model: "gemini-3.1-flash-image-preview",
      price: "0.18 USDC",
      description:
        "Photoreal image generation — cinematic lighting, accurate materials, and legible in-image text. Built on Nano Banana Pro for hero shots, product renders, and editorial visuals.",
      systemPrompt:
        "You are Lumen, a photorealistic image generator. Render the user's prompt with cinematic lighting, accurate material response, physically plausible shadows, and professional composition. Favor shallow depth of field, realistic skin, and photographic color grading unless the prompt says otherwise. Never output cartoon, anime, or illustrated styles.",
    },
    plushie: {
      privateKey: process.env.PLUSHIE_PRIVATE_KEY || "",
      address: PLATFORM_AGENT_ADDRESS,
      id: "plushie",
      name: "Plushie",
      skill: "Image · Cute",
      model: "gemini-3.1-flash-image-preview",
      price: "0.08 USDC",
      description:
        "Kawaii and chibi-style image generation — rounded shapes, pastel palettes, oversized sparkling eyes, and a soft huggable aesthetic.",
      systemPrompt:
        "You are Plushie, a cute-style image generator. Render subjects with soft rounded shapes, oversized heads, large sparkling eyes, gentle pastel palettes, and a warm huggable aesthetic. Lean kawaii/chibi unless the prompt specifies otherwise. Avoid photorealism and gritty detail.",
    },
    inkwell: {
      privateKey: process.env.INKWELL_PRIVATE_KEY || "",
      address: PLATFORM_AGENT_ADDRESS,
      id: "inkwell",
      name: "Inkwell",
      skill: "Image · Cartoon",
      model: "gemini-3.1-flash-image-preview",
      price: "0.08 USDC",
      description:
        "Bold-line cartoon and comic-book illustration — confident outlines, saturated flats, halftone shadows, and expressive poses.",
      systemPrompt:
        "You are Inkwell, a cartoon/comic-style image generator. Render with confident black outlines, flat saturated color blocks, halftone or hatching shadows, and expressive dynamic poses. Stylize boldly — no photorealism, no anime crossover.",
    },
    pastel: {
      privateKey: process.env.PASTEL_PRIVATE_KEY || "",
      address: PLATFORM_AGENT_ADDRESS,
      id: "pastel",
      name: "Pastel",
      skill: "Image · Anime",
      model: "gemini-3.1-flash-image-preview",
      price: "0.08 USDC",
      description:
        "Anime and soft-painterly illustration — clean linework, cel shading, lush studio-style color, and expressive character work.",
      systemPrompt:
        "You are Pastel, an anime-style image generator. Render with clean anime linework, cel shading, studio-quality backgrounds, and lush lighting reminiscent of modern Japanese animation. Prefer expressive eyes and dynamic composition. Avoid photorealism and western cartoon styles.",
    },
    // Pixel art — low-detail by nature, Flash handles it cleanly and cheaply.
    bitforge: {
      privateKey: process.env.BITFORGE_PRIVATE_KEY || "",
      address: PLATFORM_AGENT_ADDRESS,
      id: "bitforge",
      name: "Bitforge",
      skill: "Image · Pixel Art",
      model: "gemini-3.1-flash-image-preview",
      price: "0.08 USDC",
      description:
        "Retro pixel-art image generation — tight dithering, limited palettes, and 8/16-bit game aesthetics ranging from NES sprites to late-SNES scenes.",
      systemPrompt:
        "You are Bitforge, a pixel-art image generator. Render subjects as crisp pixel art with a visible grid, limited palette (8–32 colors), and classic 8/16-bit game-console aesthetics — think NES, SNES, Mega Drive, early arcade. Use dithering for gradients, hard aliased edges, and period-correct shading. Avoid smooth anti-aliasing, photorealism, and modern high-resolution detail.",
    },
    // Stylized 3D — Flash handles a clear Pixar-adjacent prompt well enough
    // for most hero shots; Pro was too slow to justify.
    claywork: {
      privateKey: process.env.CLAYWORK_PRIVATE_KEY || "",
      address: PLATFORM_AGENT_ADDRESS,
      id: "claywork",
      name: "Claywork",
      skill: "Image · 3D Render",
      model: "gemini-3.1-flash-image-preview",
      price: "0.18 USDC",
      description:
        "Stylized 3D / CGI rendering — Pixar-adjacent character and prop art with volumetric lighting, subsurface scattering, and polished materials. Backed by Nano Banana Pro.",
      systemPrompt:
        "You are Claywork, a stylized 3D / CGI image generator. Render with a polished Pixar/DreamWorks-adjacent look: stylized character proportions, volumetric lighting, subsurface scattering on skin, physically plausible materials, and a warm studio-film color palette. Prefer cinematic composition with depth and atmospheric haze. Avoid photorealism, anime, and 2D flat styles.",
    },
    // Watercolor — Flash can posterize the delicate gradients slightly but
    // stays in the watercolor style; speed wins over fidelity here.
    atelier: {
      privateKey: process.env.ATELIER_PRIVATE_KEY || "",
      address: PLATFORM_AGENT_ADDRESS,
      id: "atelier",
      name: "Atelier",
      skill: "Image · Watercolor",
      model: "gemini-3.1-flash-image-preview",
      price: "0.14 USDC",
      description:
        "Watercolor and traditional-media illustration — visible paper grain, wet-edge blooms, soft color bleeds, and light pencil underdrawing. Backed by Nano Banana Pro for texture fidelity.",
      systemPrompt:
        "You are Atelier, a watercolor / traditional-media image generator. Render with visible cold-press paper texture, wet-edge blooms, soft pigment bleeds, and translucent layered washes. Let white paper show through highlights; leave confident pencil or ink underdrawing. Prefer a restrained, harmonious palette. Avoid digital-smooth gradients, photorealism, and cartoon line art.",
    },
    // Cyberpunk — stacked light sources and neon can look flatter on Flash
    // than on Pro, but the speed gap made Pro unusable for live demos.
    neonoir: {
      privateKey: process.env.NEONOIR_PRIVATE_KEY || "",
      address: PLATFORM_AGENT_ADDRESS,
      id: "neonoir",
      name: "Neonoir",
      skill: "Image · Cyberpunk",
      model: "gemini-3.1-flash-image-preview",
      price: "0.14 USDC",
      description:
        "Cyberpunk and synthwave imagery — neon signage, rain-slick streets, holographic glitch, and saturated magenta/cyan lighting. Backed by Nano Banana Pro.",
      systemPrompt:
        "You are Neonoir, a cyberpunk / synthwave image generator. Render with drenched neon magenta and cyan lighting, volumetric fog, rain-slick reflective surfaces, holographic signage, CRT scanlines or subtle glitch artifacts, and dense futuristic urban density. Prefer dusk/night scenes with strong rim lighting and chromatic aberration. Avoid daylight, pastel, and wholesome styling.",
    },
  },

  // Human expert
  humanExpert: {
    privateKey: process.env.HUMAN_EXPERT_PRIVATE_KEY || "",
    address: PLATFORM_AGENT_ADDRESS,
  },
};
