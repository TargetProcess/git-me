import { ILogger } from 'loggerism'
import now = require('performance-now')
import spawn from 'promisify-spawn'

export type Timing = <T>(operation: string, action: () => Promise<T>) => Promise<T>
export type Git = (repoPath?: string) => (command: string) => Promise<string>

export const git = (timing: Timing) => (repoPath?: string) => async (
  command: string | string[]
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
    () => (repoPath ? spawn('git', args, { cwd: repoPath }) : spawn('git', args))
  )
}

export const makeTiming = (logger: ILogger) => async <T>(
  name: string,
  action: () => Promise<T>
): Promise<T> => {
  const startTime = now()

  logger.debug(`Executing ${name}`)

  const result = await action()

  const end = new Date()
  const ms = Math.floor(now() - startTime)
  logger.debug(`Executing ${name} (took ${ms} ms)`)
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
