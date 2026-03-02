import { ChildProcess, spawn } from 'child_process'
import { SSHConnection } from '../../models/ssh-connection'

/**
 * Build the SSH command prefix for executing commands on a remote machine.
 *
 * Uses the system's `ssh` binary to establish connections, supporting:
 * - Custom port
 * - Private key authentication
 * - SSH agent forwarding
 * - Strict host key checking disabled for convenience (can be toggled)
 */
function buildSSHArgs(connection: SSHConnection): ReadonlyArray<string> {
  const args: string[] = []

  // Batch mode: never prompt for passwords interactively
  args.push('-o', 'BatchMode=yes')

  // Connection timeout
  args.push('-o', 'ConnectTimeout=10')

  if (connection.port !== 22) {
    args.push('-p', String(connection.port))
  }

  if (connection.privateKeyPath) {
    args.push('-i', connection.privateKeyPath)
  }

  if (connection.useAgent) {
    args.push('-o', 'ForwardAgent=yes')
  }

  args.push(`${connection.username}@${connection.hostname}`)

  return args
}

/**
 * Escape a shell argument for safe use inside a remote SSH command.
 * Uses single-quoting with proper escaping of embedded single quotes.
 */
function shellEscape(arg: string): string {
  return "'" + arg.replace(/'/g, "'\\''") + "'"
}

/**
 * Execute a git command on a remote machine over SSH.
 *
 * This mirrors the interface of dugite's `exec()` but routes the command
 * through SSH to be run on the remote host.
 *
 * @param args     The git command arguments (e.g. ['status', '--porcelain=2'])
 * @param remotePath The absolute path to the repository on the remote machine
 * @param connection The SSH connection configuration
 * @param options  Additional execution options
 */
export async function execRemoteGit(
  args: ReadonlyArray<string>,
  remotePath: string,
  connection: SSHConnection,
  options?: {
    readonly env?: Record<string, string>
    readonly stdin?: string
    readonly maxBuffer?: number
    readonly processCallback?: (process: ChildProcess) => void
    readonly encoding?: 'buffer' | BufferEncoding
  }
): Promise<{
  readonly stdout: string | Buffer
  readonly stderr: string | Buffer
  readonly exitCode: number
}> {
  return new Promise((resolve, reject) => {
    const sshArgs = buildSSHArgs(connection)

    // Build the remote command: cd to repo path, then run git.
    // Filter out env vars that are null/undefined or that reference local
    // paths which are meaningless on the remote machine (e.g. GIT_LFS_PROGRESS).
    const remoteEnvVars = options?.env
      ? Object.entries(options.env).filter(
          ([k, v]) => typeof v === 'string' && k !== 'GIT_LFS_PROGRESS'
        )
      : []

    const envPrefix =
      remoteEnvVars.length > 0
        ? remoteEnvVars
            .map(([k, v]) => `${k}=${shellEscape(v as string)}`)
            .join(' ') + ' '
        : ''

    const gitCommand = args.map(shellEscape).join(' ')
    const remoteCommand = `cd ${shellEscape(
      remotePath
    )} && ${envPrefix}git ${gitCommand}`

    log.debug(`[SSH] Remote command: ${remoteCommand}`)

    const allArgs = [...sshArgs, remoteCommand]

    const maxBuffer = options?.maxBuffer ?? 100 * 1024 * 1024 // 100MB default

    const process = spawn('ssh', allArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    // Set encoding so that processCallback consumers (e.g. byline-based
    // progress parsers) receive strings rather than Buffer objects.
    if (options?.encoding !== 'buffer') {
      process.stdout?.setEncoding('utf8')
      process.stderr?.setEncoding('utf8')
    }

    options?.processCallback?.(process)

    if (options?.stdin && process.stdin) {
      process.stdin.write(options.stdin)
      process.stdin.end()
    }

    const useStringMode = options?.encoding !== 'buffer'
    const stdoutStrChunks: string[] = []
    const stderrStrChunks: string[] = []
    const stdoutBufChunks: Buffer[] = []
    const stderrBufChunks: Buffer[] = []
    let totalStdout = 0
    let totalStderr = 0

    process.stdout?.on('data', (chunk: Buffer | string) => {
      const len =
        typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length
      totalStdout += len
      if (totalStdout <= maxBuffer) {
        if (useStringMode) {
          stdoutStrChunks.push(chunk as string)
        } else {
          stdoutBufChunks.push(chunk as Buffer)
        }
      }
    })

    process.stderr?.on('data', (chunk: Buffer | string) => {
      const len =
        typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length
      totalStderr += len
      if (totalStderr <= maxBuffer) {
        if (useStringMode) {
          stderrStrChunks.push(chunk as string)
        } else {
          stderrBufChunks.push(chunk as Buffer)
        }
      }
    })

    process.on('error', err => {
      reject(new Error(`Failed to launch SSH process: ${err.message}`))
    })

    process.on('close', code => {
      let stdout: string | Buffer
      let stderr: string | Buffer

      if (useStringMode) {
        stdout = stdoutStrChunks.join('')
        stderr = stderrStrChunks.join('')
      } else {
        stdout = Buffer.concat(stdoutBufChunks)
        stderr = Buffer.concat(stderrBufChunks)
      }

      resolve({
        stdout,
        stderr,
        exitCode: code ?? 128,
      })
    })
  })
}

/**
 * Execute a non-git command on a remote machine over SSH.
 * Useful for file operations like reading file contents, listing directories, etc.
 */
export async function execRemoteCommand(
  command: string,
  connection: SSHConnection,
  options?: {
    readonly maxBuffer?: number
    readonly encoding?: BufferEncoding
  }
): Promise<{
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}> {
  return new Promise((resolve, reject) => {
    const sshArgs = [...buildSSHArgs(connection), command]
    const process = spawn('ssh', sshArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []

    process.stdout?.on('data', (chunk: Buffer) => stdoutChunks.push(chunk))
    process.stderr?.on('data', (chunk: Buffer) => stderrChunks.push(chunk))

    process.on('error', err => {
      reject(new Error(`Failed to launch SSH process: ${err.message}`))
    })

    process.on('close', code => {
      const encoding = options?.encoding ?? 'utf-8'
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString(encoding),
        stderr: Buffer.concat(stderrChunks).toString(encoding),
        exitCode: code ?? 128,
      })
    })
  })
}

/**
 * Test whether an SSH connection is viable by running a simple command.
 */
export async function testSSHConnection(
  connection: SSHConnection
): Promise<{ readonly ok: boolean; readonly error?: string }> {
  try {
    const result = await execRemoteCommand('echo ok', connection, {
      maxBuffer: 1024,
    })

    if (result.exitCode === 0 && result.stdout.trim() === 'ok') {
      return { ok: true }
    }

    return {
      ok: false,
      error: result.stderr || `Unexpected exit code: ${result.exitCode}`,
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

/**
 * Verify that a remote path contains a git repository.
 */
export async function verifyRemoteRepository(
  remotePath: string,
  connection: SSHConnection
): Promise<{ readonly ok: boolean; readonly error?: string }> {
  try {
    const result = await execRemoteGit(
      ['rev-parse', '--is-inside-work-tree'],
      remotePath,
      connection
    )

    if (result.exitCode === 0 && (result.stdout as string).trim() === 'true') {
      return { ok: true }
    }

    return {
      ok: false,
      error: `Path "${remotePath}" does not appear to be a git repository`,
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

/**
 * Read a file from the remote machine via SSH.
 */
export async function readRemoteFile(
  filePath: string,
  connection: SSHConnection,
  encoding: BufferEncoding = 'utf-8'
): Promise<string> {
  const result = await execRemoteCommand(
    `cat ${shellEscape(filePath)}`,
    connection,
    { encoding }
  )

  if (result.exitCode !== 0) {
    throw new Error(
      `Failed to read remote file "${filePath}": ${result.stderr}`
    )
  }

  return result.stdout
}

/**
 * Check if a file exists on the remote machine.
 */
export async function remoteFileExists(
  filePath: string,
  connection: SSHConnection
): Promise<boolean> {
  const result = await execRemoteCommand(
    `test -e ${shellEscape(filePath)} && echo exists`,
    connection
  )

  return result.exitCode === 0 && result.stdout.trim() === 'exists'
}

/**
 * List files in a remote directory.
 */
export async function listRemoteDirectory(
  dirPath: string,
  connection: SSHConnection
): Promise<ReadonlyArray<string>> {
  const result = await execRemoteCommand(
    `ls -1 ${shellEscape(dirPath)}`,
    connection
  )

  if (result.exitCode !== 0) {
    throw new Error(
      `Failed to list remote directory "${dirPath}": ${result.stderr}`
    )
  }

  return result.stdout.split('\n').filter(line => line.length > 0)
}

/** A single entry returned by listRemoteDirectoryEntries. */
export type RemoteDirectoryEntry = {
  /** File / directory name (not the full path) */
  readonly name: string
  /** Absolute path on the remote machine */
  readonly path: string
  /** Whether this entry is a directory */
  readonly isDirectory: boolean
  /** Whether this directory contains a .git folder (only checked for dirs) */
  readonly isGitRepo: boolean
}

/**
 * List entries in a remote directory with type information.
 *
 * Returns an array of entries with their name, full path, whether they are a
 * directory, and whether they look like a git repository (contain `.git`).
 */
export async function listRemoteDirectoryEntries(
  dirPath: string,
  connection: SSHConnection
): Promise<ReadonlyArray<RemoteDirectoryEntry>> {
  // Use a single SSH round-trip: for every item that is a directory, also
  // probe for .git inside it. Output format per line:
  //   <type> <hasGit> <name>
  // where type is "d" (directory) or "f" (file/other) and hasGit is "g" or "-".
  const script =
    `cd ${shellEscape(dirPath)} 2>/dev/null || exit 1\n` +
    `for f in * .[!.]* ..?*; do\n` +
    `  [ -e "$f" ] || continue\n` +
    `  if [ -d "$f" ]; then\n` +
    `    if [ -d "$f/.git" ]; then\n` +
    `      echo "d g $f"\n` +
    `    else\n` +
    `      echo "d - $f"\n` +
    `    fi\n` +
    `  else\n` +
    `    echo "f - $f"\n` +
    `  fi\n` +
    `done`

  const result = await execRemoteCommand(script, connection)

  if (result.exitCode !== 0) {
    throw new Error(
      `Failed to list remote directory "${dirPath}": ${result.stderr}`
    )
  }

  const normalizedDir = dirPath.endsWith('/') ? dirPath : dirPath + '/'

  return result.stdout
    .split('\n')
    .filter(line => line.length > 0)
    .map(line => {
      const type = line.charAt(0)
      const git = line.charAt(2)
      const name = line.substring(4)
      return {
        name,
        path: normalizedDir + name,
        isDirectory: type === 'd',
        isGitRepo: git === 'g',
      }
    })
    .sort((a, b) => {
      // Directories first, then alphabetical
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    })
}

export { buildSSHArgs, shellEscape }
