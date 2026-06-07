# BSC Hackathon — Sovereign Trading Agent

Autonomous trading agent on BNB Chain with self-custody execution, CMC market data, and on-chain identity.

## Stack

- **TWAK** (`@trustwallet/cli`) — Self-custody swap execution, autonomous mode, x402
- **BNB Agent SDK** (`bnbagent`) — ERC-8004 agent identity, ERC-8183 commerce
- **CMC AI Agent Hub** — MCP server, Skills, x402 gated data
- **BSC Mainnet** — On-chain execution (Chain ID 56)

## Setup

```bash
# 1. Install TWAK
npm install -g @trustwallet/cli

# 2. Install BNB Agent SDK
pip install bnbagent[server,ipfs]

# 3. Configure
cp .env.example .env
# Edit .env with your credentials

# 4. Register agent identity
python scripts/register_agent.py

# 5. Start agent
node src/agent/main.js
```

## Architecture

```
CMC MCP → Signal Normalizer → Strategy Engine → Risk/Policy → TWAK Execution → BSC
                                                                         ↓
                                                                   Proof Ledger
```

## Prize Targets

| Prize | Amount |
|-------|--------|
| Track 1st | $10,000 |
| Best TWAK | $2,000 |
| Best CMC Data | $2,000 |
| Best BNB SDK | $2,000 |

## License

MIT
