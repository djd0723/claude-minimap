import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { MinimapEvent } from '../types'

const PANE = 'minimap'
const TITLE = 'Minimap'
const DOCK_COLUMNS = 48
const MAX_EVENTS = 500
const AGENT_TOOLS = new Set(['Agent', 'Task'])

const events = atom({ plugin: 'minimap', key: 'events' } as const, [], { shape: 'events-4' })
const agents = atom({ plugin: 'minimap', key: 'agents' } as const, {}, { shape: 'agents-1' })
const expanded = atom({ plugin: 'minimap', key: 'expanded' } as const, [], { shape: 'expanded-1' })

const MAX_TEXT = 2000

/** A row with no `event` is a run of tool calls. */
type Row = { id: string; event?: MinimapEvent; depth: number; childCount: number; isDone: boolean }

function oneLine(value: unknown): string {
  return typeof value === 'string'
    ? value.replace(/\*\*|`/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT)
    : ''
}

function fileName(value: unknown): string {
  return oneLine(value).split(/[\\/]/).filter(Boolean).pop() ?? ''
}

function describeTool(
  tool: string,
  input: Record<string, unknown>,
): { label: string; text: string; detail?: string } {
  if (AGENT_TOOLS.has(tool)) {
    return {
      label: oneLine(input.subagent_type) || tool,
      text: oneLine(input.description),
      detail: oneLine(input.prompt),
    }
  }
  switch (tool) {
    case 'Read':
    case 'Edit':
    case 'Write':
      return { label: tool, text: fileName(input.file_path), detail: oneLine(input.file_path) }
    case 'Bash':
      return { label: tool, text: oneLine(input.command) }
    case 'Skill':
      return { label: tool, text: oneLine(input.skill) }
    default:
      return { label: tool, text: '' }
  }
}

function visibleRows(
  list: readonly MinimapEvent[],
  agentCalls: Readonly<Record<string, string>>,
  open: readonly string[],
): Row[] {
  const callIds = new Set(list.filter(event => event.isAgentCall).map(event => event.id))
  const children = new Map<string, MinimapEvent[]>()
  const roots: MinimapEvent[] = []
  for (const event of list) {
    const callId = event.agentId ? agentCalls[event.agentId] : undefined
    // An event whose agent call is not in the list stays flat at depth 0.
    if (!callId || !callIds.has(callId)) {
      roots.push(event)
      continue
    }
    const siblings = children.get(callId) ?? []
    siblings.push(event)
    children.set(callId, siblings)
  }

  const rows: Row[] = []
  const pushEvent = (event: MinimapEvent, depth: number) => {
    const group = children.get(event.id) ?? []
    rows.push({ id: event.id, event, depth, childCount: group.length, isDone: event.isDone })
    if (open.includes(event.id)) walk(group, depth + 1)
  }
  // Two or more tool calls in a row fold into one run row.
  const walk = (siblings: readonly MinimapEvent[], depth: number) => {
    let run: MinimapEvent[] = []
    const flush = () => {
      const first = run[0]
      if (first && run.length === 1) pushEvent(first, depth)
      else if (first) {
        const id = `run:${first.id}`
        rows.push({ id, depth, childCount: run.length, isDone: run.every(event => event.isDone) })
        if (open.includes(id)) for (const event of run) pushEvent(event, depth + 1)
      }
      run = []
    }
    for (const event of siblings) {
      if (event.kind === 'tool') {
        run.push(event)
        continue
      }
      flush()
      pushEvent(event, depth)
    }
    flush()
  }
  walk(roots, 0)
  return rows
}

/** Adds a row and keeps the docked pane's window on the newest one. */
async function add($: EngineInterface, event: MinimapEvent): Promise<void> {
  await update($, events, list => [...list, event].slice(-MAX_EVENTS))
  void $.ui.scroll({ in: PANE, to: 'end' })
}

/** Reads one saved conversation into `history`, then the conversation of each agent it spawned. */
async function fill(
  $: EngineInterface,
  history: MinimapEvent[],
  agentCalls: Record<string, string>,
  agentId?: string,
): Promise<void> {
  const answer = await $.session.messages(agentId ? { agentId } : { last: MAX_EVENTS })
  const messages = Array.isArray(answer) ? answer : []
  const spawned: string[] = []
  messages.forEach((message, index) => {
    const text = oneLine(message.text)
    // A user row in an agent's conversation is its prompt, which the agent row shows.
    // On the main loop, one that starts with a tag is the engine's, not something the person typed.
    const isShown = message.role === 'assistant' || (!agentId && !text.startsWith('<'))
    if (text && isShown) {
      history.push({
        id: message.uuid ?? `history-${agentId ?? 'main'}-${index}`,
        kind: message.role,
        label: message.role === 'user' ? 'User' : 'Assistant',
        text,
        agentId,
        isAgentCall: false,
        isDone: true,
      })
    }
    for (const use of message.toolUses) {
      history.push({
        id: use.tool_use_id,
        kind: 'tool',
        ...describeTool(use.tool, use.input),
        agentId,
        isAgentCall: AGENT_TOOLS.has(use.tool),
        isDone: true,
      })
      if (use.agentId && !agentCalls[use.agentId]) {
        agentCalls[use.agentId] = use.tool_use_id
        spawned.push(use.agentId)
      }
    }
  })
  for (const child of spawned) await fill($, history, agentCalls, child)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'minimap', description: 'Show the session minimap in a pane' })
    void $.ui.open({ id: PANE, title: TITLE, columns: DOCK_COLUMNS })

    // `$.state` starts empty in a resumed session, so the saved conversations fill it.
    if ((await read($, events)).length === 0) {
      const history: MinimapEvent[] = []
      const agentCalls: Record<string, string> = {}
      await fill($, history, agentCalls)
      await update($, agents, map => ({ ...agentCalls, ...map }))
      await update($, events, list => (list.length === 0 ? history.slice(-MAX_EVENTS) : list))
    }

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await update($, events, () => [])
      await update($, agents, () => ({}))
      await update($, expanded, () => [])
    }

    return next(e)
  })

  on('command.run', { command: 'minimap' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE, columns: DOCK_COLUMNS })

    return { text: 'Minimap pane opened.' }
  })

  on('prompt.submit', async ($, e, next) => {
    // A meta prompt, such as a task notification, is not something the person typed.
    if (e.isMeta) return next(e)

    const prompt: MinimapEvent = {
      id: `prompt-${Date.now()}`,
      kind: 'user',
      label: 'User',
      text: oneLine(e.text),
      isAgentCall: false,
      isDone: true,
    }
    await add($, prompt)

    return next(e)
  })

  on('session.append', async ($, e, next) => {
    if (e.message.type === 'assistant' && e.origin.kind === 'model') {
      let text = ''
      for (const block of e.message.content) {
        if (block.type === 'text') text += `${block.text} `
      }
      text = oneLine(text)
      if (text) {
        const reply: MinimapEvent = {
          id: e.uuid,
          kind: 'assistant',
          label: 'Assistant',
          text,
          agentId: e.agentId,
          isAgentCall: false,
          isDone: true,
        }
        await add($, reply)
      }
    }

    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const spawned = await next(e)
    const agentId = spawned.agentId
    if (agentId && e.tool_use_id) {
      await update($, agents, map => ({ ...map, [agentId]: e.tool_use_id }))
    }

    return spawned
  })

  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    const call: MinimapEvent = {
      id: e.tool_use_id,
      kind: 'tool',
      ...describeTool(tool, e as unknown as Record<string, unknown>),
      agentId: e.agentId,
      isAgentCall: AGENT_TOOLS.has(tool),
      isDone: false,
    }
    await add($, call)
    try {
      return await next(e)
    } finally {
      await update($, events, list => list.map(one => (one.id === call.id ? { ...one, isDone: true } : one)))
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const open = await read($, expanded)
    const rows = visibleRows(await read($, events), await read($, agents), open)
    // A docked pane scrolls its own tree and follows the end. An inline frame grows to fit the tree.
    const shown = e.props.placement === 'inline' ? rows.slice(-Math.max(1, e.props.scroll.bodyRows)) : rows
    const width = Math.max(20, e.props.bodyColumns)

    return (
      <Box flexDirection="column">
        {rows.length === 0 && <Text dimColor>No events yet.</Text>}
        {shown.flatMap(({ id, event, depth, childCount, isDone }) => {
          const indent = '  '.repeat(depth)
          const isOpen = open.includes(id)
          const label = event ? event.label : `${childCount} tool calls`
          const count = event && childCount > 0 ? ` +${childCount}` : ''
          const glyph = !event || event.kind === 'tool' ? (isDone ? '● ' : '◐ ') : ''
          const used = indent.length + 2 + glyph.length + label.length + 2 + count.length
          const text = event ? event.text.slice(0, Math.max(0, width - used)) : ''
          const full = event ? event.detail || event.text : ''
          // A row expands to its children, or to the text its line cut.
          const hasMore = childCount > 0 || full !== text
          const chevron = !hasMore ? ' ' : isOpen ? '▾' : '▸'
          const color = !event
            ? 'suggestion'
            : event.kind === 'user'
              ? 'success'
              : event.kind === 'assistant'
                ? 'warning'
                : event.isAgentCall
                  ? 'claude'
                  : 'suggestion'
          const line = (
            <Button
              key={id}
              plain
              onPress={async () => {
                if (hasMore) {
                  await update($, expanded, ids => (ids.includes(id) ? ids.filter(one => one !== id) : [...ids, id]))
                }
                // Only a main-loop row is in the transcript; the engine answers `{ deny }` for the rest.
                if (event) await $.ui.scroll({ to: { requestId: id }, block: 'center' })
              }}
            >
              {indent}
              {chevron}{' '}
              {glyph && (
                <Text color={color} dimColor={isDone}>
                  {glyph}
                </Text>
              )}
              {glyph ? <Text bold>{label}</Text> : <Text bold color={color}>{label}</Text>}
              {text && `: ${text}`}
              {count && <Text dimColor>{count}</Text>}
            </Button>
          )
          if (!isOpen || childCount > 0 || full === text) return [line]

          return [
            line,
            <Box paddingLeft={indent.length + 2}>
              <Text dimColor>{full}</Text>
            </Box>,
          ]
        })}
      </Box>
    )
  })
}
