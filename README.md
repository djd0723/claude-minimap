# claude-minimap

A Claude Code mod that shows a map of the session in a pane beside the chat.

The pane lists each prompt, each reply from the agent, and each tool call. Two or
more tool calls in a row fold into one row. A subagent is one row, and its own
replies and tool calls sit inside it.

## Install

At the prompt of a terminal session:

```
/plugin install minimap --marketplace djd0723/claude-minimap
```

From a shell:

```
claude plugin install minimap --marketplace djd0723/claude-minimap
```

Answer `y` to add the marketplace, then select a scope. The user scope loads the
mod in each session.

The repository is private. The install needs read access to it on GitHub and a
git credential for github.com on the machine.

## Use

- `/minimap` opens the pane.
- A `▸` marks a row that has more to show. Press the row to open it.
- A message row opens to its full text. A tool row opens to its full command or
  path. An agent row opens to its history.
- A press on a message row or a tool row also scrolls the transcript to it.
- `●` marks a finished tool call. `◐` marks one that runs.

To move in the pane with the keyboard, press ctrl+x then tab. The arrows scroll,
and Tab walks the rows.

## Placement

The pane docks on the right of the transcript in the fullscreen layout, from 110
columns. On the main screen it opens inline above the prompt.

## Limits

- The pane keeps the newest 500 events.
- A resumed session refills the pane from the saved conversations: the main
  one, and the one of each agent.
- The pane scrolls to the newest row each time an event arrives.

## Develop

```
claude --plugin-dir /path/to/claude-minimap
```

The session reloads the mod when a file changes. Check a change with:

```
claude plugin validate .
tsc -p .
```

The engine writes the type declarations to `.claude-plugin/types/` when it loads
the mod. `tsc` needs them.

## Files

- `hooks/register.tsx` holds the event hooks, the fold logic, and the pane.
- `types/index.d.ts` declares the state the mod keeps.
