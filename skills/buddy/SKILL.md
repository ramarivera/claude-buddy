---
name: buddy
description: "Show, pet, or manage your coding companion. Use when the user types /buddy or mentions their companion by name."
argument-hint: "[show|pet|stats|help|off|on|rename <name>|personality <text>|achievements|summon [slot]|save [slot]|list|dismiss <slot>|pick|frequency [seconds]|style [classic|round]|position [top|left]|rarity [on|off]|rainbow [#hex ...]|statusline [on|off]|uninstall]"
allowed-tools: mcp__claude_buddy__*, Bash
---

# Buddy — Your Coding Companion

Handle the user's `/buddy` command using the claude-buddy MCP tools.

## Fallback: MCP Tools Unavailable

**Before routing any command, check whether `mcp__claude_buddy__*` tools are registered in this session.** If they are NOT — Claude Code was unable to start the claude-buddy MCP server — do not attempt to call any buddy tool. The tool calls will fail with an unhelpful "tool not found" error. Instead, run this diagnostic and report the result to the user so they can fix the underlying cause:

1. Check bun availability:

   ```bash
   command -v bun && bun --version
   ```

   The MCP launcher (`server/mcp-launcher.sh`) requires `bun` on PATH. If this command prints nothing, bun is missing — tell the user to install it (`curl -fsSL https://bun.sh/install | bash`), open a new terminal so PATH picks it up, and restart Claude Code. That is almost always the fix.

2. If bun IS present, run the launcher directly to capture whatever error it emits. The launcher path depends on which marketplace installed the plugin; locate it first:

   ```bash
   find ~/.claude/plugins/cache -name mcp-launcher.sh -path '*claude-buddy*' 2>/dev/null
   ```

   Then execute the first result with stdin closed so it exits cleanly:

   ```bash
   <launcher-path> < /dev/null; echo "exit=$?"
   ```

   Report the stdout/stderr and exit code verbatim. Common causes: missing `bun`, corrupted plugin cache (suggest `claude plugin uninstall claude-buddy@claude-buddy && claude plugin install claude-buddy@claude-buddy`), or a `bun`-level error loading `server/index.ts`.

3. If `$CLAUDE_CONFIG_DIR` is set in the environment, use that directory instead of `~/.claude` when searching for the launcher.

4. **Do not proceed with any buddy command in this session.** Tell the user: the MCP server is not running, here is what the diagnostic found, here is the recommended fix, and Claude Code must be restarted after the fix before buddy tools will be available.

## Command Routing

Based on `$ARGUMENTS`:

| Input                    | Action                                                                                       |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| _(empty)_ or `show`      | Call `buddy_show`                                                                            |
| `help`                   | Call `buddy_help`                                                                            |
| `pet`                    | Call `buddy_pet`                                                                             |
| `stats`                  | Call `buddy_stats`                                                                           |
| `off`                    | Call `buddy_mute`                                                                            |
| `on`                     | Call `buddy_unmute`                                                                          |
| `rename <name>`          | Call `buddy_rename` with the given name                                                      |
| `personality <text>`     | Call `buddy_set_personality` with the given text                                             |
| `achievements`           | Call `buddy_achievements`                                                                    |
| `summon`                 | Call `buddy_summon` with no args — picks a random saved buddy                                |
| `summon <slot>`          | Call `buddy_summon` with the given slot name                                                 |
| `save [slot]`            | Call `buddy_save` with optional slot name                                                    |
| `list`                   | Call `buddy_list`                                                                            |
| `dismiss <slot>`         | Call `buddy_dismiss` with the slot name                                                      |
| `pick`                   | Tell user to run `! bun run pick` from the claude-buddy directory (launches interactive TUI) |
| `frequency`              | Call `buddy_frequency` with no args (show current)                                           |
| `frequency <seconds>`    | Call `buddy_frequency` with cooldown=seconds                                                 |
| `style`                  | Call `buddy_style` with no args (show current)                                               |
| `style <classic\|round>` | Call `buddy_style` with style arg                                                            |
| `position`               | Call `buddy_style` with no args (show current)                                               |
| `position <top\|left>`   | Call `buddy_style` with position arg                                                         |
| `rarity on`              | Call `buddy_style` with showRarity=true                                                      |
| `rarity off`             | Call `buddy_style` with showRarity=false                                                     |
| `rainbow`                | Call `buddy_style` with no args (show current rainbow)                                       |
| `rainbow <#hex> ...`     | Call `buddy_style` with rainbow=[...hex colors] to set shiny gradient                        |
| `rainbow reset`          | Call `buddy_style` with rainbow=[] to restore default ROYGBIV                                |
| `statusline`             | Call `buddy_statusline` with no args (show current)                                          |
| `statusline on`          | Call `buddy_statusline` with enabled=true                                                    |
| `statusline off`         | Call `buddy_statusline` with enabled=false                                                   |
| `statusline combined`    | Call `buddy_statusline` with combined=true (adds rate-limit usage bars, needs python3)       |
| `statusline basic`       | Call `buddy_statusline` with combined=false (buddy only, no rate-limit bars)                 |
| `uninstall`              | Run the uninstall sequence (see **Uninstall Orchestration** below)                           |

## CRITICAL OUTPUT RULES

Different buddy tools return different shapes of output. The rules below ensure the companion's visual identity survives intact while plain-text replies stay visible to the user.

### Visual-card outputs — strict verbatim

These tools return pre-formatted ASCII art with ANSI colors, box-drawing characters, stat bars, and species art: `buddy_show`, `buddy_stats`, `buddy_pet`, `buddy_achievements`, `buddy_react`.

**You MUST output the tool result text EXACTLY as returned — character for character, line for line.** Do NOT:

- Summarize or paraphrase the ASCII art
- Describe what the companion looks like in prose
- Add commentary before or after the card
- Reformat, rephrase, or interpret the output
- Strip ANSI escape codes

**Just output the raw text content from the tool result. Nothing else.** The ASCII art IS the response.

### Plain-text outputs — verbatim + visible

These tools return plain text, not ASCII art: `buddy_help`, `buddy_unmute`, `buddy_mute`, `buddy_frequency`, `buddy_style`, `buddy_statusline`, `buddy_list`, `buddy_rename`, `buddy_save`, `buddy_dismiss`, `buddy_set_personality`.

**The visible reply MUST include the tool result text verbatim — every time, on every call, even on repeated calls in the same session.** Treat each invocation as a fresh request from the user, not a "they've seen it before" signal. Tool result blocks live in your context, not in the user's rendered conversation; only what you put in your own reply reaches the screen.

You MAY add a one-sentence confirmation before or after if it clarifies what changed, but do NOT paraphrase the text itself.

**Hard floor — never break:** A reply whose only visible content is the `<!-- buddy: ... -->` end-of-turn comment is broken. HTML comments are hidden by the markdown renderer, so an HTML-comment-only reply renders blank. If you have nothing else to say, the tool result text alone is the correct reply.

**Self-check before sending**: does your visible reply contain the tool's result text? If no, paste it in. The end-of-turn `<!-- buddy: ... -->` is _additional_, never _instead of_.

### Name reactions

If the user mentions the buddy's name in normal conversation, call `buddy_react` with reason `"turn"` and display the result verbatim.

## Uninstall Orchestration

When the user invokes `/buddy uninstall`, run this sequence **in order** — do not skip steps, do not ask for confirmation between steps:

1. Call the MCP tool `buddy_uninstall`. Display its output verbatim.
2. Run via Bash tool: `claude plugin uninstall claude-buddy@claude-buddy`
3. Run via Bash tool: `claude plugin marketplace remove claude-buddy`
4. Run via Bash tool: `rm -rf ~/.claude/plugins/cache/claude-buddy`
5. Tell the user: uninstall is complete; companion data is kept at `~/.claude-buddy/`; restart Claude Code to release the plugin.

If any Bash step fails (non-zero exit), report the error but continue with the remaining steps — each step is independent and always-safe to run.

Do not call `buddy_uninstall` for any other command than `/buddy uninstall`. Never call it proactively.
