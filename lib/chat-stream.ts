export interface StreamChatOptions {
  endpoint: string
  body: unknown
  onChunk?: (content: string) => void
}

export interface StreamChatResult {
  content: string
  requestId: string | null
}

export async function streamChatCompletion({
  endpoint,
  body,
  onChunk,
}: StreamChatOptions): Promise<StreamChatResult> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok || !response.body) {
    throw new Error(`Stream failed: HTTP ${response.status}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullContent = ''
  let requestId: string | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith('data: ') || line === 'data: [DONE]') continue

      const chunk = JSON.parse(line.slice(6)) as {
        content?: string
        error?: string
        requestId?: string
      }

      if (typeof chunk.requestId === 'string' && chunk.requestId.length > 0) {
        requestId = chunk.requestId
      }
      if (chunk.error) {
        throw new Error(chunk.error)
      }
      if (chunk.content) {
        fullContent += chunk.content
        onChunk?.(fullContent)
      }
    }
  }

  return {
    content: fullContent,
    requestId,
  }
}
