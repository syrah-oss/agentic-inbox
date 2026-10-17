<div align="center">
  <h1>Agentic Inbox</h1>
  <p><em>A self-hosted email client with an AI agent, running entirely on Cloudflare Workers</em></p>
</div>

> ### ⚠️ Unofficial fork
>
> This is **not** an official Cloudflare project. It is a community-maintained fork of
> [`cloudflare/agentic-inbox`](https://github.com/cloudflare/agentic-inbox), maintained by
> [syrah-oss](https://github.com/syrah-oss). We depend on it and intend to keep it working —
> see [Why this fork](#why-this-fork).

Agentic Inbox lets you send, receive, and manage emails through a modern web interface -- all powered by your own Cloudflare account. Incoming emails arrive via [Cloudflare Email Routing](https://developers.cloudflare.com/email-routing/), each mailbox is isolated in its own [Durable Object](https://developers.cloudflare.com/durable-objects/) with a SQLite database, and attachments are stored in [R2](https://developers.cloudflare.com/r2/).

An **AI-powered Email Agent** can read your inbox, search conversations, and draft replies -- built with the [Cloudflare Agents SDK](https://developers.cloudflare.com/agents/) and [Workers AI](https://developers.cloudflare.com/workers-ai/).

![Agentic Inbox screenshot](./demo_app.png)


Read the blog post to learn more about Cloudflare Email Service and how to use it with the Agents SDK, MCP, and from the Wrangler CLI: [Email for Agents](https://blog.cloudflare.com/email-for-agents/).

## Why this fork

Upstream [`cloudflare/agentic-inbox`](https://github.com/cloudflare/agentic-inbox) simply seems
unmaintained. We rely on Agentic Inbox, so rather than wait we maintain this fork. We try to stay
close to upstream: fixes are kept small and upstreamable, and we're happy to open PRs back if
upstream becomes active again.

### What this fork changes

| Area | Change |
| --- | --- |
| **Works out of the box again** | `@cf/moonshotai/kimi-k2.5` and `@cf/meta/llama-3.1-8b-instruct-fast` were retired by Workers AI, so the email agent and the prompt-injection scanner failed at runtime. Defaults are now verified-live models: `@cf/moonshotai/kimi-k2.6` and `@cf/zai-org/glm-4.7-flash`. |
| **Configurable models** | Every model is overridable per deployment via Worker vars — `EMAIL_AGENT_MODEL`, `AUTO_DRAFT_MODEL`, `PROMPT_INJECTION_MODEL`, `DRAFT_VERIFIER_MODEL`. No code change needed to swap models. |
| **Correct inbound routing** | Mail is routed by the SMTP **envelope recipient** instead of the `To:` header, so catch-all, alias and BCC deliveries land in the right mailbox. |
| **Reliable auto-draft** | The `EmailAgent` is initialised before the first auto-draft, fixing 500s for mailboxes that were never opened in the UI. |
| **Better MCP** | New `create_mailbox` tool (provision an address on demand) and `search_emails` now exposes structured filters including `is_read`, so an agent can list unread mail without inventing a keyword. |
| **CI** | GitHub Actions job running `npm ci`, `npm audit`, `npm run typecheck` and `npm run build`. |
| **Agent tooling** | An [MCP set-up guide](./docs/MCP-SETUP.md) for Claude Code, Codex and opencode, plus the `create_mailbox` and `is_read` MCP additions. |

## How to setup

**Important**: Clicking the 'Deploy to Cloudflare' button is only one part of the setup. You must follow the **After deploying** steps as well. For a full step-by-step guide with screenshots, refer to this comment: 
https://github.com/cloudflare/agentic-inbox/issues/4#issuecomment-4269118513

### To set up

1. Deploy to Cloudflare. The deploy flow will automatically provision R2, Durable Objects, and Workers AI. You'll be prompted for **DOMAINS**, which is the domain (yourdomain.com) you want to receive emails for (email@yourdomain.com).

     [![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/syrah-oss/agentic-inbox)

2. **Configure Cloudflare Access** -- Enable [one-click Cloudflare Access](https://developers.cloudflare.com/changelog/post/2025-10-03-one-click-access-for-workers/) on your Worker under Settings > Domains & Routes. The modal will show your `POLICY_AUD` and `TEAM_DOMAIN` values. `TEAM_DOMAIN` can be either your Access team URL or the full `.../cdn-cgi/access/certs` URL. **You must set these as secrets for your Worker.**
3. **Set up Email Routing** -- In the Cloudflare dashboard, go to your domain > Email Routing and create a catch-all rule that forwards to this Worker
4. **Enable Email Service** -- The worker needs the `send_email` binding to send outbound emails. See [Email Service docs](https://developers.cloudflare.com/email-routing/email-workers/send-email-workers/)
5. **Create a mailbox** -- Visit your deployed app and create a mailbox for any address on your domain (e.g. `hello@example.com`)

### Troubleshooting Access

1. If you see `Invalid or expired Access token`, that usually means `POLICY_AUD` or `TEAM_DOMAIN` secrets are incorrect.
   * Resolution: [turn Access off and back on for the Worker to get the Access modal again](https://developers.cloudflare.com/changelog/post/2025-10-03-one-click-access-for-workers/), then reset your Worker secrets to the latest `POLICY_AUD` and `TEAM_DOMAIN` values shown there.
2. If you see `Cloudflare Access must be configured in production`, this application is intentionally enforcing Cloudflare Access so your inbox is not exposed to anyone on the internet.
   * Resolution: enable Access using [one-click Cloudflare Access for Workers](https://developers.cloudflare.com/changelog/post/2025-10-03-one-click-access-for-workers/), then set the `POLICY_AUD` and `TEAM_DOMAIN` Worker secrets from the modal values.

## Connect AI clients over MCP

The Worker exposes a Model Context Protocol endpoint at `/mcp`, so AI coding agents can read,
search and draft mail directly instead of shelling out to a mail CLI.

- **Set-up guide:** [docs/MCP-SETUP.md](./docs/MCP-SETUP.md) — configuration for **Claude Code**,
  **Codex** and **opencode**, including authenticating through Cloudflare Access with a service token.

MCP tools exposed: `list_mailboxes`, `create_mailbox`, `list_emails`, `get_email`, `get_thread`,
`search_emails` (structured filters incl. `is_read`), `draft_reply`, `create_draft`, `update_draft`,
`delete_email`, `mark_email_read`, `move_email` — plus `send_reply` / `send_email` when the
`send_email` binding is configured.

## Features

- **Full email client** — Send and receive emails via Cloudflare Email Routing with a rich text composer, reply/forward threading, folder organization, search, and attachments
- **Per-mailbox isolation** — Each mailbox runs in its own Durable Object with SQLite storage and R2 for attachments
- **Built-in AI agent** — Side panel with 9 email tools for reading, searching, drafting, and sending
- **Auto-draft on new email** — Agent automatically reads inbound emails and generates draft replies, always requiring explicit confirmation before sending
- **Configurable and persistent** — Custom system prompts per mailbox, persistent chat history, streaming markdown responses, and tool call visibility

## Stack

- **Frontend:** React 19, React Router v7, Tailwind CSS, Zustand, TipTap, `@cloudflare/kumo`
- **Backend:** Hono, Cloudflare Workers, Durable Objects (SQLite), R2, Email Routing
- **AI Agent:** Cloudflare Agents SDK (`AIChatAgent`), AI SDK v6, Workers AI (`@cf/moonshotai/kimi-k2.6` by default; [configurable](#what-this-fork-changes)), `react-markdown` + `remark-gfm`
- **Auth:** Cloudflare Access JWT validation (required outside local development)

## Getting Started

```bash
npm install
npm run dev
```

### Configuration

1. Set your domain in `wrangler.jsonc`
2. Create an R2 bucket named `agentic-inbox`: `wrangler r2 bucket create agentic-inbox`

### Deploy

```bash
npm run deploy
```

## Prerequisites

- Cloudflare account with a domain
- [Email Routing](https://developers.cloudflare.com/email-routing/) enabled for receiving
- [Email Service](https://developers.cloudflare.com/email-service/) enabled for sending
- [Workers AI](https://developers.cloudflare.com/workers-ai/) enabled (for the agent)
- [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/) configured for deployed/shared environments (required in production)

Any user who passes the shared Cloudflare Access policy can access all mailboxes in this app by design. This includes the MCP server at `/mcp` -- external AI tools (Claude Code, Codex, opencode, Cursor, etc.) connected via MCP can operate on any mailbox by passing a `mailboxId` parameter. There is no per-mailbox authorization; the Cloudflare Access policy is the single trust boundary. Treat the Access service token like a password — see [docs/MCP-SETUP.md](./docs/MCP-SETUP.md).

## Architecture

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Browser    │────>│  Hono Worker     │────>│  MailboxDO      │
│  React SPA   │     │  (API + SSR)     │     │  (SQLite + R2)  │
│  Agent Panel │     │                  │     └─────────────────┘
└──────┬───────┘     │  /agents/* ──────┼────>┌─────────────────┐
       │             │                  │     │  EmailAgent DO  │
       │ WebSocket   │                  │     │  (AIChatAgent)  │
       └─────────────┤                  │     │  9 email tools  │
                     │                  │────>│  Workers AI     │
                     └──────────────────┘     └─────────────────┘
```

## License

Apache 2.0 -- see [LICENSE](LICENSE).
