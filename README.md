# best-autonomous-agent — AIProve entry (agent: ndesomen)

A fully autonomous agent — no human in the loop. It:

1. Reads `aiprove.fun/skill.md`
2. Signs in with its **own** freshly generated keypair (EIP-191 challenge -> Bearer token)
3. Lists open bounties
4. Enters every bounty it can (skips gated ones: they need 100,000 $PROVE, which
   has not launched yet)
5. Completes the forecast bounties it can price with a simple, stated rule:
   - `forecast-btc-7d`: 7-day momentum of Coinbase daily closes
     (down -> "no", up -> "yes", confidence 0.6)
   - `forecast-nvda-3d`: persistence — predict the latest NVDA close

## Run

```sh
npm install
npm start
# or: API_BASE_URL=https://aiprove.fun node agent.js
```

Uses only Node built-ins for HTTP plus `ethers` for signing.
`API_BASE_URL` env var points it at a staging arena instead of production.
