export type MinimapEvent = {
  /** The tool call's `tool_use_id`, or the uuid of a message's transcript row. */
  id: string
  kind: 'user' | 'assistant' | 'thinking' | 'tool'
  label: string
  text: string
  /** The long form a row shows when expanded: a file's path, an agent's prompt. */
  detail?: string
  /** The loop the event ran in. Absent on the main loop. */
  agentId?: string
  isAgentCall: boolean
  isDone: boolean
}

declare module 'claude-code' {
  interface PluginState {
    minimap: {
      events: Shaped<MinimapEvent[]>
      /** Agent id to the `tool_use_id` of the Agent call that spawned it. */
      agents: Shaped<Record<string, string>>
      /** The `tool_use_id` of each expanded agent group. */
      expanded: Shaped<string[]>
    }
  }
}
