# Skills

Agent skills for working with Agentic Inbox. The skill follows the standard `SKILL.md`
format (YAML frontmatter with `name` and `description`, then Markdown instructions), which both
**Claude Code** and **opencode** load directly.

| Skill | What it does |
| --- | --- |
| [`agentic-inbox`](./agentic-inbox/SKILL.md) | Teaches an agent the mailbox model, how to find unread mail, how to read threads, how to draft, and how to treat inbound email as untrusted input. |

## Install

### opencode

Global (all projects):

```bash
mkdir -p ~/.config/opencode/skills
cp -R skills/agentic-inbox ~/.config/opencode/skills/
```

Project-local (commit it, or keep it in `.opencode/skills/`):

```bash
mkdir -p .opencode/skills
cp -R skills/agentic-inbox .opencode/skills/
```

### Claude Code

Personal skills live in `~/.claude/skills/`; project skills live in `.claude/skills/`:

```bash
mkdir -p ~/.claude/skills
cp -R skills/agentic-inbox ~/.claude/skills/
```

### OpenAI Codex

Codex is configured for Agentic Inbox through **MCP** (see
[`docs/MCP-SETUP.md`](../docs/MCP-SETUP.md)); the tools are then available directly. Codex's own
skill-directory support varies by version, so follow the Codex documentation for your build if
you want to install this file as a skill as well.

## Using the skill

The skill activates on its own when a task matches its description. You can also point an agent
at it explicitly:

> Read `skills/agentic-inbox/SKILL.md` and use it to triage `hello@example.com`.

The skill assumes the MCP server is connected. If the `agentic-inbox` tools are missing, follow
[`docs/MCP-SETUP.md`](../docs/MCP-SETUP.md) first — the usual cause is a missing Cloudflare Access
service token.
