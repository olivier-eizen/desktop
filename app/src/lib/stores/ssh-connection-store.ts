import {
  SSHConnection,
  IDatabaseSSHConnection,
  RemoteRepositoryRef,
} from '../../models/ssh-connection'
import { RepositoriesDatabase } from '../databases/repositories-database'

/** Manages CRUD operations for SSH connections and remote repository refs. */
export class SSHConnectionStore {
  private db: RepositoriesDatabase

  public constructor(db: RepositoriesDatabase) {
    this.db = db
  }

  /** Get all stored SSH connections. */
  public async getAll(): Promise<ReadonlyArray<SSHConnection>> {
    const rows = await this.db.sshConnections.toArray()
    return rows.map(toSSHConnection).filter(isDefined)
  }

  /** Get a single SSH connection by ID. */
  public async getById(id: number): Promise<SSHConnection | null> {
    const row = await this.db.sshConnections.get(id)
    return row ? toSSHConnection(row) ?? null : null
  }

  /** Add a new SSH connection. Returns the created connection with its ID. */
  public async add(
    connection: Omit<SSHConnection, 'id'>
  ): Promise<SSHConnection> {
    const row: IDatabaseSSHConnection = {
      name: connection.name,
      hostname: connection.hostname,
      port: connection.port,
      username: connection.username,
      privateKeyPath: connection.privateKeyPath,
      useAgent: connection.useAgent,
    }

    const id = await this.db.sshConnections.add(row)
    return { ...connection, id }
  }

  /** Update an existing SSH connection. */
  public async update(connection: SSHConnection): Promise<void> {
    await this.db.sshConnections.update(connection.id, {
      name: connection.name,
      hostname: connection.hostname,
      port: connection.port,
      username: connection.username,
      privateKeyPath: connection.privateKeyPath,
      useAgent: connection.useAgent,
    })
  }

  /** Delete an SSH connection and all its remote repository refs. */
  public async remove(id: number): Promise<void> {
    await this.db.transaction(
      'rw',
      this.db.sshConnections,
      this.db.remoteRepositoryRefs,
      async () => {
        await this.db.remoteRepositoryRefs
          .where('sshConnectionId')
          .equals(id)
          .delete()
        await this.db.sshConnections.delete(id)
      }
    )
  }

  /** Link a repository to a remote SSH location. */
  public async setRemoteRef(
    repositoryId: number,
    sshConnectionId: number,
    remotePath: string
  ): Promise<void> {
    await this.db.remoteRepositoryRefs.put({
      repositoryId,
      sshConnectionId,
      remotePath,
    })
  }

  /** Get the remote ref for a repository, if any. */
  public async getRemoteRef(
    repositoryId: number
  ): Promise<RemoteRepositoryRef | null> {
    const row = await this.db.remoteRepositoryRefs.get(repositoryId)
    if (!row) {
      return null
    }
    return {
      sshConnectionId: row.sshConnectionId,
      remotePath: row.remotePath,
    }
  }

  /** Remove the remote ref for a repository. */
  public async removeRemoteRef(repositoryId: number): Promise<void> {
    await this.db.remoteRepositoryRefs.delete(repositoryId)
  }
}

function toSSHConnection(
  row: IDatabaseSSHConnection
): SSHConnection | undefined {
  if (row.id === undefined) {
    return undefined
  }
  return {
    id: row.id,
    name: row.name,
    hostname: row.hostname,
    port: row.port,
    username: row.username,
    privateKeyPath: row.privateKeyPath,
    useAgent: row.useAgent,
  }
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined
}
