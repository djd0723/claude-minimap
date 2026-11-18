# CLAUDE.md — claude-minimap

## Look at the Pane Before You Report a Fix

`tsc` and `claude plugin validate` prove that the mod loads. They do not prove
that the pane draws the right rows. Run the mod in a test tab and read the pane.

### 1. Open a test tab

Open a background tab in the caller's pane. It runs Claude with the repo copy of
the mod.

```bash
cmux list-panes --workspace "$CMUX_WORKSPACE_ID"
cmux new-surface --workspace "$CMUX_WORKSPACE_ID" --pane pane:<n> \
  --type terminal --focus false \
  --command "cd $PWD && claude --plugin-dir . --model haiku"
```

- `new-surface` prints the ref of the new surface. Use that ref in each later
  command.
- `--plugin-dir .` overrides the installed copy. The session reloads the mod
  when a file changes, so one tab serves many edits.
- Use a tab, not a split. A split halves the width of the person's terminal.
- Pass `--focus false`. Do not select or focus a tab unless the person asks.

### 2. Drive the session

```bash
cmux send --workspace "$CMUX_WORKSPACE_ID" --surface surface:<n> "/minimap"
cmux send-key --workspace "$CMUX_WORKSPACE_ID" --surface surface:<n> enter
```

- `/minimap` opens the pane at any width. A pane that the mod opens at session
  start waits for a wide terminal.
- `send` types the text. `send-key enter` submits it.
- To get an agent row next to a tool row, ask for both in one message: "In one
  message, call an Explore subagent and Bash."

### 3. Read the rows as text

```bash
cmux read-screen --workspace "$CMUX_WORKSPACE_ID" --surface surface:<n> --lines 40
```

- `read-screen` works on a background tab.
- `read-screen` returns text only. It shows labels, glyphs, chevrons and nesting.
  It does not show colour.
- A docked pane shows its newest rows only. `--scrollback` returns the
  terminal's history, not the pane's.

### 4. Read colour from a screenshot

Load the `cmux-cua` tools with ToolSearch, then:

1. `list_windows` gives the `pid` and the `window_id` of the cmux window. The
   window title is the title of the selected tab.
2. `get_window_state` with `screenshot_out_file` writes a PNG. Pass
   `max_elements: 1` to keep the element tree small.
3. `zoom` returns a crop of one region, such as the pane.

- Wait for `get_window_state` to return before you read the PNG.
- A screenshot shows the selected tab only. To capture a test tab, the person
  must select it, or must permit you to select it.
- A search box that is open in the terminal draws its highlight over the rows.

### 5. Close the test tab

```bash
cmux close-surface --workspace "$CMUX_WORKSPACE_ID" --surface surface:<n>
```

Close only the tabs that you opened.

## Set Session Options With Flags

A slash command in a test tab can write to `~/.claude/settings.json`. `/effort`
saves its level as the default for new sessions. Use a flag, which applies to
that session only:

```bash
claude --plugin-dir . --model haiku --effort high
claude --plugin-dir . --model haiku --settings '{"showThinkingSummaries":true}'
```

## Know Which Copy a Session Runs

- A session without `--plugin-dir` runs the installed copy from
  `~/.claude/plugins/cache/claude-minimap/minimap/<version>/`.
- Each version folder holds an `.in_use` folder. It lists the process id of each
  session that runs that version. `$CMUX_CLAUDE_PID` is the id of the caller.
- The installed copy updates from GitHub, not from the working tree. After a
  push, run:

  ```bash
  claude plugin marketplace update claude-minimap
  claude plugin update minimap@claude-minimap
  ```

- A session loads the new copy when it restarts. Bump `version` in
  `.claude-plugin/plugin.json`, or the update finds nothing new.

## Bump the Version in Each Commit

`.githooks/pre-commit` refuses a commit that does not change `version` in
`.claude-plugin/plugin.json`. Stage the bump with the change.

- A new clone needs `git config core.hooksPath .githooks` once. Git does not
  copy that setting with the repo.
- `git commit --amend` compares against the commit it amends, so it needs a new
  bump too.

## Read the State When the Pane Is Not Enough

A headless run draws no pane. To read the events the mod holds, copy the mod to
a scratch folder and add one line to its `session.end` hook:

```ts
await $.fs.write('<scratch>/state.json', JSON.stringify({ events: await read($, events), agents: await read($, agents) }, null, 1))
```

Then run `claude -p --plugin-dir <scratch copy> --debug-file <scratch>/debug.log "<prompt>"`.
The debug log names each hook that fails.

Do not pass `--resume` with a session id that you did not create. It adds a turn
to that session's transcript.
