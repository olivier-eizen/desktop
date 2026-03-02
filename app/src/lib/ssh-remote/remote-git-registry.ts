import { IGitResult as DugiteResult } from 'dugite'
import { SSHConnection } from '../../models/ssh-connection'
import { execRemoteGit } from './ssh-exec'

/**
 * A registry that maps local repository paths to their SSH remote configurations.
 *
 * When a repository is registered here, all `git()` calls for that path
 * can be intercepted and routed through SSH instead of local execution.
 */
const remoteRegistry = new Map<
  string,
  { connection: SSHConnection; remotePath: string }
>()

/**
 * Register a repository path as remote — all git commands targeting this path
 * will be executed on the remote machine over SSH.
 */
export function registerRemoteRepository(
  localPath: string,
  remotePath: string,
  connection: SSHConnection
): void {
  remoteRegistry.set(normalizeKey(localPath), { connection, remotePath })
}

/**
 * Unregister a repository path from remote execution.
 */
export function unregisterRemoteRepository(localPath: string): void {
  remoteRegistry.delete(normalizeKey(localPath))
}

/**
 * Check if a repository path is registered for remote execution.
 */
export function isRemoteRepository(localPath: string): boolean {
  return remoteRegistry.has(normalizeKey(localPath))
}

/**
 * Get the remote configuration for a repository path, if registered.
 */
export function getRemoteConfig(
  localPath: string
): { connection: SSHConnection; remotePath: string } | undefined {
  return remoteRegistry.get(normalizeKey(localPath))
}

/**
 * Execute a git command on the remote machine for a registered remote repository.
 *
 * The return type matches dugite's IGitResult interface so it can be
 * used as a drop-in replacement in the git() function flow.
 */
export async function execRemoteRegisteredGit(
  args: string[],
  localPath: string,
  options?: {
    readonly env?: Record<string, string>
    readonly stdin?: string
    readonly maxBuffer?: number
    readonly processCallback?: (
      process: import('child_process').ChildProcess
    ) => void
    readonly encoding?: 'buffer' | BufferEncoding
  }
): Promise<DugiteResult> {
  const config = remoteRegistry.get(normalizeKey(localPath))
  if (!config) {
    throw new Error(
      `Repository at "${localPath}" is not registered as a remote repository`
    )
  }

  const result = await execRemoteGit(
    args,
    config.remotePath,
    config.connection,
    options
  )

  // Return in dugite-compatible format
  return {
    stdout: result.stdout as string,
    stderr: result.stderr as string,
    exitCode: result.exitCode,
  }
}

function normalizeKey(path: string): string {
  // Normalize path separators for consistent lookups
  return path.replace(/\\/g, '/').toLowerCase()
}
