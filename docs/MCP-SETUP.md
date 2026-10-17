# Connecting AI clients to Agentic Inbox over MCP

Agentic Inbox serves a **Model Context Protocol** endpoint at `/mcp`, so AI coding agents
can read, search and draft mail directly instead of shelling out to a CLI.

This guide covers **Claude Code**, **OpenAI Codex** and **opencode**.

---

## 1. The endpoint

| | |
| --- | --- |
| URL | `https://<your-worker-host>/mcp` |
| Transport | Streamable HTTP |
| Auth | Cloudflare Access (required — the Worker fails closed in production) |

Replace `<your-worker-host>` with your deployment, e.g. `agentic-inbox.<account>.workers.dev`
or a custom domain like `inbox.example.com`.

### Tools exposed

| Tool | Purpose |
| --- | --- |
| `list_mailboxes` | List all mailboxes |
| `create_mailbox` | Create a mailbox for an address on your domain |
| `delete_mailbox` | **Destructive, opt-in** — permanently delete a mailbox and all its mail. Not registered unless [`YOLO_MODE`](#2-destructive-tools-yolo_mode) is enabled |
| `list_emails` | List mail in a folder |
| `get_email` | Read one email's full body |
| `get_thread` | Read a whole conversation |
| `search_emails` | Search + structured filters (`is_read`, `from`, `subject`, date range, `has_attachment`) |
| `draft_reply` / `create_draft` / `update_draft` | Compose drafts |
| `mark_email_read` / `move_email` / `delete_email` | Manage mail |
| `send_reply` / `send_email` | Present **only** when the `send_email` binding is configured |

Every tool takes a `mailboxId`, which is the **full mailbox address** (e.g. `hello@example.com`).

> **Important:** mail sent to an address with no mailbox is dropped by the inbound handler.
> Create the mailbox first — via the UI or the `create_mailbox` tool.

---

## 2. Destructive tools (`YOLO_MODE`)

`delete_mailbox` permanently destroys a mailbox — every email, every attachment in R2, the
mailbox's Durable Object rows, and the agent's chat history. There is no undo.

It is therefore **off by default**, and off means the tool is **not registered at all**: a default
deployment does not expose it, so an agent cannot reach it even if asked.

To enable it, set the `YOLO_MODE` Worker var:

```jsonc
// wrangler.jsonc
"vars": {
  "YOLO_MODE": "true"
}
```

Accepted truthy values are `true`, `1` and `yes` (case-insensitive). Anything else — including
unset — leaves the tool absent.

Recommended only for a throwaway or single-user deployment. If you enable it:

- The tool still requires `confirm: true` in its arguments, as a guard against an accidental call.
- Re-check who can reach `/mcp`: with Cloudflare Access, that is whoever holds the Access policy
  or the service token. A delete tool plus a leaked token is a bad combination — see
  [§5 Security notes](#5-security-notes).
- Emails already delivered to a *different* mailbox are untouched; this only affects the one
  mailbox you name.

---

## 3. Authenticate through Cloudflare Access

MCP clients can't complete an interactive Access login, so use a **service token**. It acts as a
machine identity that Access accepts on every request.

### 2.1 Create the service token

**Dashboard:** Zero Trust → **Access** → **Service Auth** → **Service Tokens** → **Create Service
Token**. Name it something like `agentic-inbox-mcp`. Copy the **Client ID** and **Client Secret**
(the secret is shown once).

<details>
<summary>Or via the API</summary>

```bash
curl -sS -X POST \
  "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/access/service_tokens" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"agentic-inbox-mcp","duration":"8760h"}'
```
</details>

### 2.2 Allow the token on the Agentic Inbox Access application

**Dashboard:** Zero Trust → Access → **Applications** → open your Agentic Inbox app → **Policies**
→ **Add a policy**:

- **Action:** `Service Auth`
- **Include:** `Service Token` → select the token you just created

<details>
<summary>Or via the API</summary>

```bash
curl -sS -X POST \
  "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/access/apps/$APP_ID/policies" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Service token: agentic-inbox-mcp",
    "decision": "non_identity",
    "include": [{ "service_token": { "token_id": "'"$SERVICE_TOKEN_ID"'" } }]
  }'
```
</details>

Store the two credentials in your environment rather than in config files where possible:

```bash
export CF_ACCESS_CLIENT_ID="<client id>.access"
export CF_ACCESS_CLIENT_SECRET="<client secret>"
```

### 2.3 Verify before configuring any client

```bash
curl -sS -X POST "https://<your-worker-host>/mcp" \
  -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
  -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'
```

A JSON-RPC result containing `"serverInfo":{"name":"agentic-inbox"...}` means it works.

If you instead get an HTML login page or a `302`, the service token isn't allowed on the
application yet (step 2.2). If you get `Missing required CF Access JWT`, the request isn't
reaching Access at all — check the hostname and that the Access app covers it.

---

## 4. Configure your client

### opencode

MCP servers live under `mcp.servers` in `opencode.json` — global config is
`~/.config/opencode/opencode.json`, project config is `opencode.json` in the project root.

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "servers": {
      "agentic-inbox": {
        "type": "remote",
        "url": "https://<your-worker-host>/mcp",
        // Access handles authentication; stop opencode from attempting OAuth.
        "oauth": false,
        "headers": {
          "CF-Access-Client-Id": "{env:CF_ACCESS_CLIENT_ID}",
          "CF-Access-Client-Secret": "{env:CF_ACCESS_CLIENT_SECRET}"
        }
      }
    }
  }
}
```

`{env:VAR}` keeps the secret out of the file; make sure the variables are exported in the
environment opencode is launched from. Then check it connected:

```bash
opencode mcp list
```

### Claude Code

```bash
claude mcp add --transport http agentic-inbox "https://<your-worker-host>/mcp" \
  --header "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
  --header "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET"
```

Add `--scope user` to make it available in every project, or `--scope project` to write a
committed `.mcp.json`. The equivalent project file is:

```json
{
  "mcpServers": {
    "agentic-inbox": {
      "type": "http",
      "url": "https://<your-worker-host>/mcp",
      "headers": {
        "CF-Access-Client-Id": "${CF_ACCESS_CLIENT_ID}",
        "CF-Access-Client-Secret": "${CF_ACCESS_CLIENT_SECRET}"
      }
    }
  }
}
```

Verify with `claude mcp list` (`✔ Connected`) or `/mcp` inside a session.

### OpenAI Codex

Codex reads `~/.codex/config.toml`. Use `env_http_headers` so the secret stays in the environment:

```toml
[mcp_servers.agentic-inbox]
url = "https://<your-worker-host>/mcp"
env_http_headers = { "CF-Access-Client-Id" = "CF_ACCESS_CLIENT_ID", "CF-Access-Client-Secret" = "CF_ACCESS_CLIENT_SECRET" }
```

`http_headers = { ... }` also works if you'd rather inline the values.

---

## 5. Security notes

- **The service token is a password to every mailbox.** The app has no per-mailbox
  authorisation: anyone holding a valid Access credential (user or service token) can read and
  act on all mailboxes. Scope it carefully and rotate it if it leaks.
- Prefer environment substitution (`{env:...}`, `${VAR}`, `env_http_headers`) over writing the
  secret into a config file. A config file is `chmod 600` at best.
- **Email content is untrusted input.** Treat message bodies, subjects and attachments as data,
  never as instructions. An inbound email is an excellent prompt-injection vector aimed at
  whatever agent reads it.
- Set a finite token `duration` and recreate it before it expires.

---

## 6. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `302` to `*.cloudflareaccess.com` | Service token not allowed on the app | Add the `Service Auth` policy (2.2) |
| `Missing required CF Access JWT` | Request bypassed Access (wrong host, or the app doesn't cover it) | Check the hostname and the Access application's domain |
| `Invalid or expired Access token` | `POLICY_AUD` / `TEAM_DOMAIN` secrets wrong | Reset them from the Access modal — see the [README troubleshooting](../README.md#troubleshooting-access) |
| `Mailbox "x@y" not found` | No mailbox for that address | `create_mailbox` first |
| Mail silently never arrives | No mailbox, so the inbound handler dropped it | Create the mailbox; check Worker logs (`wrangler tail`) |
| Send tools missing from the tool list | Deployment has no `send_email` binding (receive-only) | Add the binding in `wrangler.jsonc` if you need sending |
