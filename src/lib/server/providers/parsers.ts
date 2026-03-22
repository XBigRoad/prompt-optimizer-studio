import type {
  AnthropicMessagesResponse,
  CohereChatResponse,
  GeminiGenerateContentResponse,
  OpenAiChatCompletionResponse,
  OpenAiResponsesResponse,
} from '@/lib/server/providers/base'

export function extractOpenAiResponseText(response: OpenAiChatCompletionResponse) {
  const content = response.choices?.[0]?.message?.content
  if (typeof content === 'string') {
    return content
  }
  if (Array.isArray(content)) {
    return content.map((part) => part.text ?? '').join('\n')
  }
  if (response.error?.message) {
    throw new Error(response.error.message)
  }
  throw new Error('模型返回了空响应。')
}

export function extractOpenAiResponsesText(response: OpenAiResponsesResponse) {
  const text = (response.output ?? [])
    .flatMap((item) => item.type === 'message' ? item.content ?? [] : [])
    .filter((part) => part.type === 'output_text' && typeof part.text === 'string')
    .map((part) => part.text ?? '')
    .join('\n')
    .trim()

  if (text) {
    return text
  }

  if (response.error?.message) {
    throw new Error(response.error.message)
  }

  throw new Error('OpenAI Responses API 返回了空响应。')
}

export function extractAnthropicResponseText(response: AnthropicMessagesResponse) {
  const text = (response.content ?? [])
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text ?? '')
    .join('\n')
    .trim()

  if (text) {
    return text
  }

  if (response.error?.message) {
    throw new Error(response.error.message)
  }

  throw new Error('Anthropic 返回了空响应。')
}

export function extractGeminiResponseText(response: GeminiGenerateContentResponse) {
  const text = (response.candidates ?? [])
    .flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => part.text ?? '')
    .join('\n')
    .trim()

  if (text) {
    return text
  }

  if (response.error?.message) {
    throw new Error(response.error.message)
  }

  if (response.promptFeedback?.blockReason) {
    throw new Error(`Gemini 阻止了该请求：${response.promptFeedback.blockReason}`)
  }

  throw new Error('Gemini 返回了空响应。')
}

export function extractCohereResponseText(response: CohereChatResponse) {
  const text = (response.message?.content ?? [])
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text ?? '')
    .join('\n')
    .trim()

  if (text) {
    return text
  }

  if (response.error?.message) {
    throw new Error(response.error.message)
  }

  throw new Error('Cohere 返回了空响应。')
}

export function parseOpenAiResponsesEventStream(payload: string): OpenAiResponsesResponse {
  const blocks = payload
    .split(/\n\s*\n/g)
    .map((block) => block.trim())
    .filter(Boolean)

  let finalResponse: OpenAiResponsesResponse | null = null
  let lastPayload: unknown = null

  for (const block of blocks) {
    const lines = block.split('\n')
    const event = lines.find((line) => line.startsWith('event:'))?.slice('event:'.length).trim()
    const data = lines
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice('data:'.length).trim())
      .join('\n')

    if (!data || data === '[DONE]') {
      continue
    }

    const parsed = JSON.parse(data) as { response?: OpenAiResponsesResponse }
    lastPayload = parsed
    if ((event === 'response.completed' || event === 'response.failed') && parsed.response) {
      finalResponse = parsed.response
    }
  }

  if (finalResponse) {
    return finalResponse
  }

  if (isOpenAiResponsesWrapper(lastPayload)) {
    return lastPayload.response
  }

  if (isOpenAiResponsesResponse(lastPayload)) {
    return lastPayload
  }

  throw new Error('OpenAI Responses API 返回了无法解析的事件流。')
}

function isOpenAiResponsesWrapper(payload: unknown): payload is { response: OpenAiResponsesResponse } {
  return typeof payload === 'object' && payload !== null && 'response' in payload
}

function isOpenAiResponsesResponse(payload: unknown): payload is OpenAiResponsesResponse {
  return typeof payload === 'object' && payload !== null
}
