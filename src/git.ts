import { ILogger, LogMethod } from 'loggerism'
import now = require('performance-now')
import spawn from 'promisify-spawn'

export type Timing = ReturnType<typeof makeTiming>
export type Git = ReturnType<typeof git>
export type LogLevel = 'debug' | 'info'

export const git = (timing: Timing) => (repoPath?: string) => async (
  command: string | string[],
  correlationId: string
): Promise<string> => {
  let args: string[]
  let commandName: string
  if (typeof command === 'string') {
    commandName = `git ${command}`
    args = parseCommand(command)
  } else {
    commandName = `git ${command.join(' ')}`
    args = command
  }
  return timing(
    commandName,
    () => (repoPath ? spawn('git', args, { cwd: repoPath }) : spawn('git', args)),
    correlationId
  )
}

export const makeTiming = (logger: ILogger, logLevel: LogLevel = 'debug') => async <T>(
  name: string,
  action: () => Promise<T>,
  correlationId: string
): Promise<T> => {
  const log: LogMethod = (logLevel === 'info' ? logger.info : logger.debug).bind(logger)
  const startTime = now()

  logger.debug(`Executing ${name}`)

  const result = await action()

  const ms = Math.floor(now() - startTime)
  log('Git call finished', {
    command: name,
    durationMs: ms,
    correlationId
  })
  return result
}

export const parseCommand = (command: string): string[] => {
  const result = []
  let accumulator = ''
  const state = {
    isEscaped: false,
    insideQuotes: false,
    shouldBreakOnQuote: true
  }

  for (const char of command) {
    switch (char) {
      case '\\':
        if (state.insideQuotes) {
          state.isEscaped = !state.isEscaped
          break
        }
        accumulator += char
        break
      case ' ':
        state.isEscaped = false
        if (!state.insideQuotes) {
          if (accumulator.length > 0) {
            result.push(accumulator)
          }
          accumulator = ''
          break
        }
        accumulator += char
        break
      case '"':
        if (!state.shouldBreakOnQuote) {
          accumulator += char
          state.insideQuotes = true
          state.shouldBreakOnQuote = false
          break
        }
        if (state.isEscaped) {
          accumulator += char
          state.isEscaped = false
        } else {
          state.insideQuotes = !state.insideQuotes
        }
        break
      case '=':
        if (state.isEscaped || state.insideQuotes) {
          accumulator += char
        } else {
          state.shouldBreakOnQuote = false
        }
        state.isEscaped = false
      default:
        if (state.isEscaped) {
          accumulator += '\\'
          state.isEscaped = false
        }
        accumulator += char
    }
  }
  if (accumulator.length > 0) {
    result.push(accumulator)
  }
  return result
}
