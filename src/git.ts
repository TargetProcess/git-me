import { ILogger } from 'loggerism'
import now = require('performance-now')
import spawn from 'promisify-spawn'

export type Timing = <T>(operation: string, action: () => Promise<T>) => Promise<T>
export type Git = (repoPath?: string) => (command: string) => Promise<string>

export const git = (timing: Timing) => (repoPath?: string) => async (
  command: string
): Promise<string> => {
  const commandName = `git ${command}`
  const args = parseCommand(command)
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
  let isEscaped = false
  let insideQuotes = false
  let accumulator = ''

  for (const char of command) {
    switch (char) {
      case '\\':
        if (insideQuotes) {
          isEscaped = true
        }
        accumulator += char
        break
      case ' ':
        isEscaped = false
        if (!insideQuotes) {
          if (accumulator.length > 0) {
            result.push(accumulator)
          }
          accumulator = ''
          break
        }
      case '"':
        if (!isEscaped) {
          insideQuotes = true
        }
        accumulator += char
        break
      default:
        accumulator += char
    }
  }
  if (accumulator.length > 0) {
    result.push(accumulator)
  }
  return result
}
