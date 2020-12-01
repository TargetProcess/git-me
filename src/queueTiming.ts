import { ILogger, LogMethod } from 'loggerism'
import now = require('performance-now')
import { v4 as uuidv4 } from 'uuid'

export type Queue = <T>(fn: () => Promise<T>) => Promise<T>

export const createQueueTimingWrapper = (
  logger: ILogger,
  queue: Queue,
  enableLogging: boolean,
  writeGit: (command: string, correlationId: string) => Promise<string>
) => {
  const log: LogMethod = (enableLogging ? logger.info : logger.debug).bind(logger)

  return async <T>(
    operationName: string,
    fn: (executeGitCommand: (command: string) => Promise<string>) => Promise<T>
  ): Promise<T> => {
    const waitStartTime = now()
    const correlationId = uuidv4()

    return queue(async () => {
      const waitMs = getDuration(waitStartTime)

      const operationStartTime = now()
      const result = await fn((command: string) => {
        return writeGit(command, correlationId)
      })

      const operationMs = getDuration(operationStartTime)
      const totalMs = getDuration(waitStartTime)

      log('Git operation finished', {
        correlationId,
        operation: operationName,
        waitDurationMs: waitMs,
        operationDurationMs: operationMs,
        totalDurationMs: totalMs
      })

      return result
    })
  }
}

const getDuration = (start: number): number => {
  return Math.floor(now() - start)
}
