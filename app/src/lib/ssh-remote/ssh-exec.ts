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

    // Build the remote command: cd to repo path, then run git
    const envPrefix = options?.env
      ? Object.entries(options.env)
          .map(([k, v]) => `${shellEscape(k)}=${shellEscape(v)}`)
          .join(' ') + ' '
      : ''

    const gitCommand = args.map(shellEscape).join(' ')
    const remoteCommand = `cd ${shellEscape(
      remotePath
    )} && ${envPrefix}git ${gitCommand}`

    const allArgs = [...sshArgs, remoteCommand]

    const maxBuffer = options?.maxBuffer ?? 100 * 1024 * 1024 // 100MB default

    const process = spawn('ssh', allArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    options?.processCallback?.(process)

    if (options?.stdin && process.stdin) {
      process.stdin.write(options.stdin)
      process.stdin.end()
    }

    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    let totalStdout = 0
    let totalStderr = 0

    process.stdout?.on('data', (chunk: Buffer) => {
      totalStdout += chunk.length
      if (totalStdout <= maxBuffer) {
        stdoutChunks.push(chunk)
      }
    })

    process.stderr?.on('data', (chunk: Buffer) => {
      totalStderr += chunk.length
      if (totalStderr <= maxBuffer) {
        stderrChunks.push(chunk)
      }
    })

    process.on('error', err => {
      reject(new Error(`Failed to launch SSH process: ${err.message}`))
    })

    process.on('close', code => {
      const stdoutBuf = Buffer.concat(stdoutChunks)
      const stderrBuf = Buffer.concat(stderrChunks)

      const encoding = options?.encoding
      const stdout =
        encoding === 'buffer'
          ? stdoutBuf
          : stdoutBuf.toString((encoding as BufferEncoding) || 'utf-8')
      const stderr =
        encoding === 'buffer'
          ? stderrBuf
          : stderrBuf.toString((encoding as BufferEncoding) || 'utf-8')

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

export { buildSSHArgs, shellEscape }
