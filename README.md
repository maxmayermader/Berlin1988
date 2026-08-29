# Berlin 1988

See `CLAUDE.md` for what this project is and how it's organized.

## Running and deploying

```bash
pnpm dev             # full local stack: apps/web (Next.js) + apps/party (partykit dev)
pnpm test            # unit + integration tests (packages/ and apps/)
pnpm test:e2e        # Playwright end-to-end specs (starts pnpm dev itself)
pnpm measure:timing  # one-time four-player concurrent-timing measurement — needs `pnpm dev` already running in another terminal
```

### Deploying `apps/party` to Cloudflare

```bash
pnpm --filter party exec partykit login      # one-time browser authorisation against a Cloudflare account
pnpm --filter party exec partykit deploy     # publishes the room; prints the deployed host
```

Take the host `partykit deploy` prints and set it as `NEXT_PUBLIC_PARTYKIT_HOST` in Vercel's Project Settings → Environment Variables (and locally in `apps/web/.env.local` if you want a local client talking to the deployed room). That variable is the *only* environment coupling between `apps/web` and `apps/party` (`docs/ARCHITECTURE.md` §8).

**The most confusing failure mode of this two-host setup:** a Vercel deployment (production or preview) pointed at a stale or wrong PartyKit host will connect over the WebSocket just fine, then behave as if every lobby code is unknown — because it really is talking to a different room server than whichever `partykit deploy` most recently ran. If create/join stops working after a deploy, check `NEXT_PUBLIC_PARTYKIT_HOST` before anything else.
