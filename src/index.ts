import * as fs from 'fs-extra'
import { IFileStorage, IReadFileStorage } from 'fs-relative'
import { ILogger } from 'loggerism'
import * as pLimit from 'p-limit'
import * as path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { Git, LogLevel } from './git'
import { createQueueTimingWrapper } from './queueTiming'

export interface IConfig {
  branchName: string
  repoUrl: string
  targetPath: string
  basePath?: string
}

export interface IHistoryOptions {
  // Limit the number of commits to output
  maxCount?: number
  // Skip number commits before starting to show the commit output
  skip?: number
}

export interface IGitStorage {
  useVersion<T>(
    action: (storage: IReadFileStorage, version: string) => Promise<T>,
    version?: string
  ): Promise<T>
  getHistory(path: string, options?: IHistoryOptions): Promise<string[]>
  commitAndPush<T>(
    meta:
      | {
          message: string
          author?: {
            name: string
            email: string
          }
        }
      | string,
    action: (storage: IFileStorage, version: string) => Promise<T>
  ): Promise<{ result: T; version: string }>
}

export { git, Git, makeTiming } from './git'
export { IFileStorage, IReadFileStorage } from 'fs-relative'

export const makeGitStorage = async (
  config: IConfig,
  git: Git,
  logger: ILogger,
  makeReadFileStorage: (basePath: string) => IReadFileStorage,
  makeFileStorage: (basePath: string) => IFileStorage,
  timingLogLevel: LogLevel = 'debug'
): Promise<IGitStorage> => {
  const readGitPath = path.join(config.targetPath, 'read')
  const writeGitPath = path.join(config.targetPath, 'write')
  const readStorage = makeReadFileStorage(
    config.basePath ? path.join(readGitPath, config.basePath) : readGitPath
  )
  const writeStorage = makeFileStorage(
    config.basePath ? path.join(writeGitPath, config.basePath) : writeGitPath
  )

  const readGit = git(readGitPath)
  const writeGit = git(writeGitPath)

  const writeQueue = pLimit(1)
  const queueTiming = createQueueTimingWrapper(logger, writeQueue, timingLogLevel, writeGit)

  const init = async () => {
    await fs.emptyDir(config.targetPath)

    await fs.emptyDir(readGitPath)
    await fs.emptyDir(writeGitPath)

    await git()(`clone -b ${config.branchName} -- ${config.repoUrl} ${readGitPath}`, uuidv4())

    // copy repo to write
    await fs.copy(path.join(config.targetPath, 'read'), path.join(config.targetPath, 'write'))
  }
  await init()

  // only one should do pull for read
  const actualizeCbs = []
  const actualize = (correlationId: string): Promise<string> => {
    return new Promise<string>(async (resolve, reject) => {
      actualizeCbs.push({ resolve, reject })
      if (actualizeCbs.length === 1) {
        return readGit('pull', correlationId)
          .then(() => readGit('log -n 1 --pretty=format:%H', correlationId))
          .then(result => {
            while (actualizeCbs.length > 0) {
              const cb = actualizeCbs.shift()
              cb.resolve(result)
            }
          })
          .catch(e => {
            while (actualizeCbs.length > 0) {
              const cb = actualizeCbs.shift()
              cb.reject(e)
            }
          })
      }
    })
  }

  return {
    useVersion: async <T>(
      action: (storage: IReadFileStorage, version: string) => Promise<T>,
      version?: string
    ): Promise<T> => {
      return queueTiming(
        'useVersion',
        async (executeGitCommand: (command: string) => Promise<string>) => {
          try {
            await executeGitCommand('pull')
            let lastVersion: string
            if (!version) {
              lastVersion = await executeGitCommand('log -n 1 --pretty=format:%H')
            } else {
              await executeGitCommand(`checkout ${version}`)
            }
            const result = await action(writeStorage, version ? version : lastVersion)
            return result
          } finally {
            if (version) {
              await executeGitCommand(`checkout ${config.branchName}`)
            }
          }
        }
      )
    },
    getHistory: async (p: string, options?: IHistoryOptions): Promise<string[]> => {
      const correlationId = uuidv4()

      await actualize(correlationId)
      const rawOptions: string[] = []
      if (options) {
        if (typeof options.maxCount !== 'undefined') {
          rawOptions.push('--max-count=' + options.maxCount)
        }
        if (typeof options.skip !== 'undefined') {
          rawOptions.push('--skip=' + options.skip)
        }
      }
      const result = await readGit(
        `log --pretty=format:%H ${rawOptions.join(' ')} -- ${
          config.basePath ? path.join(config.basePath, p) : p
        }`,
        correlationId
      )
      return result.split('\n')
    },
    commitAndPush: async <T>(
      meta:
        | {
            message: string
            author?: {
              name: string
              email: string
            }
          }
        | string,
      action: (storage: IFileStorage, version: string) => Promise<T>
    ): Promise<{ result: T; version: string }> => {
      return queueTiming(
        'commitAndPush',
        async (executeGitCommand: (command: string) => Promise<string>) => {
          try {
            await executeGitCommand('pull')
            let version = await executeGitCommand('log -n 1 --pretty=format:%H')
            const result = await action(writeStorage, version)
            await executeGitCommand('add -A')
            const message = typeof meta === 'string' ? meta : meta.message
            const author =
              typeof meta === 'string'
                ? ''
                : meta && meta.author ? `${meta.author.name} <${meta.author.email}>` : ''
            try {
              await executeGitCommand(
                `commit -m "${message.replace(/\"/g, '\\"')}" ${
                  author ? '--author="' + author.replace(/\"/g, '\\"') + '"' : ''
                }`
              )
              await executeGitCommand('push')
            } catch (e) {
              if (!e.message || e.message.indexOf('nothing to commit') < 0) {
                throw e
              } else {
                logger.warn(e)
              }
            }
            version = await executeGitCommand('log -n 1 --pretty=format:%H')
            return { result, version }
          } finally {
            await executeGitCommand('reset --hard')
            await executeGitCommand('clean -fd')
          }
        }
      )
    }
  }
}
