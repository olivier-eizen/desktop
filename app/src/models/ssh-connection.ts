/**
 * Represents an SSH connection configuration for a remote machine
 * that hosts git repositories.
 */
export type SSHConnection = {
  /** Unique identifier (database primary key) */
  readonly id: number

  /** A user-friendly name for this connection (e.g. "Work Server") */
  readonly name: string

  /** The SSH hostname or IP address */
  readonly hostname: string

  /** The SSH port (defaults to 22) */
  readonly port: number

  /** The SSH username */
  readonly username: string

  /**
   * Path to the SSH private key file. If not set, the system's default
   * SSH key (~/.ssh/id_rsa, etc.) will be used.
   */
  readonly privateKeyPath: string | null

  /** Whether to use the system SSH agent for authentication */
  readonly useAgent: boolean
}

/**
 * Represents a remote repository accessible over SSH.
 * This binds a local-style repository concept to a remote machine + path.
 */
export type RemoteRepositoryRef = {
  /** The SSH connection used to access this repository */
  readonly sshConnectionId: number

  /** The absolute path to the git repository on the remote machine */
  readonly remotePath: string
}

/** Database row for persisting SSH connections */
export type IDatabaseSSHConnection = {
  readonly id?: number
  readonly name: string
  readonly hostname: string
  readonly port: number
  readonly username: string
  readonly privateKeyPath: string | null
  readonly useAgent: boolean
}

/** Database extension for repositories with remote SSH info */
export type IDatabaseRemoteRepositoryRef = {
  readonly repositoryId: number
  readonly sshConnectionId: number
  readonly remotePath: string
}
