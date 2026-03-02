import * as React from 'react'
import {
  listRemoteDirectoryEntries,
  RemoteDirectoryEntry,
} from '../../lib/ssh-remote/ssh-exec'
import { SSHConnection } from '../../models/ssh-connection'

interface IRemoteFileExplorerProps {
  readonly connection: SSHConnection
  /** Called when the user selects a path (double-click a git repo, or clicks Select). */
  readonly onPathSelected: (path: string) => void
}

interface IRemoteFileExplorerState {
  /** Current directory being displayed. */
  readonly currentPath: string
  /** Entries in the current directory. */
  readonly entries: ReadonlyArray<RemoteDirectoryEntry>
  /** The currently highlighted entry (single click). */
  readonly selectedEntry: RemoteDirectoryEntry | null
  /** Whether we are currently loading. */
  readonly loading: boolean
  /** Error message if the last operation failed. */
  readonly error: string | null
  /** Breadcrumb segments of the current path. */
  readonly pathSegments: ReadonlyArray<{
    readonly name: string
    readonly path: string
  }>
}

function buildPathSegments(
  currentPath: string
): ReadonlyArray<{ readonly name: string; readonly path: string }> {
  const parts = currentPath.split('/').filter(p => p.length > 0)
  const segments: Array<{ name: string; path: string }> = [
    { name: '/', path: '/' },
  ]
  for (let i = 0; i < parts.length; i++) {
    segments.push({
      name: parts[i],
      path: '/' + parts.slice(0, i + 1).join('/'),
    })
  }
  return segments
}

/**
 * A file explorer that lists directories on a remote SSH machine.
 * Allows navigating into directories and selecting a git repository path.
 */
export class RemoteFileExplorer extends React.Component<
  IRemoteFileExplorerProps,
  IRemoteFileExplorerState
> {
  public constructor(props: IRemoteFileExplorerProps) {
    super(props)
    this.state = {
      currentPath: `/home/${props.connection.username}`,
      entries: [],
      selectedEntry: null,
      loading: false,
      error: null,
      pathSegments: buildPathSegments(`/home/${props.connection.username}`),
    }
  }

  public componentDidMount() {
    this.loadDirectory(this.state.currentPath)
  }

  public componentDidUpdate(prevProps: IRemoteFileExplorerProps) {
    if (prevProps.connection.id !== this.props.connection.id) {
      const startPath = `/home/${this.props.connection.username}`
      this.loadDirectory(startPath)
    }
  }

  private loadDirectory = async (dirPath: string) => {
    this.setState({
      loading: true,
      error: null,
      selectedEntry: null,
      currentPath: dirPath,
      pathSegments: buildPathSegments(dirPath),
    })

    try {
      const entries = await listRemoteDirectoryEntries(
        dirPath,
        this.props.connection
      )
      this.setState({ entries, loading: false })
    } catch (e) {
      this.setState({
        entries: [],
        loading: false,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  private onEntryClick = (entry: RemoteDirectoryEntry) => {
    this.setState({ selectedEntry: entry })
  }

  private onEntryDoubleClick = (entry: RemoteDirectoryEntry) => {
    if (entry.isDirectory) {
      if (entry.isGitRepo) {
        // Double-clicking a git repo selects it
        this.props.onPathSelected(entry.path)
      } else {
        // Double-clicking a regular directory navigates into it
        this.loadDirectory(entry.path)
      }
    }
  }

  private onNavigateUp = () => {
    const parent = this.state.currentPath.replace(/\/[^/]+\/?$/, '') || '/'
    this.loadDirectory(parent)
  }

  private onBreadcrumbClick = (path: string) => {
    this.loadDirectory(path)
  }

  private onSelectCurrent = () => {
    const { selectedEntry, currentPath } = this.state
    if (selectedEntry && selectedEntry.isDirectory) {
      this.props.onPathSelected(selectedEntry.path)
    } else {
      // Select the current directory itself
      this.props.onPathSelected(currentPath)
    }
  }

  private renderEntry = (entry: RemoteDirectoryEntry) => {
    const isSelected = this.state.selectedEntry?.path === entry.path
    const className = [
      'remote-explorer-entry',
      entry.isDirectory ? 'directory' : 'file',
      entry.isGitRepo ? 'git-repo' : '',
      isSelected ? 'selected' : '',
    ]
      .filter(Boolean)
      .join(' ')

    return (
      <div
        key={entry.name}
        className={className}
        onClick={() => this.onEntryClick(entry)}
        onDoubleClick={() => this.onEntryDoubleClick(entry)}
        role="option"
        aria-selected={isSelected}
      >
        <span className="remote-explorer-entry-icon">
          {entry.isGitRepo ? '📦' : entry.isDirectory ? '📁' : '📄'}
        </span>
        <span className="remote-explorer-entry-name">{entry.name}</span>
        {entry.isGitRepo && (
          <span className="remote-explorer-git-badge">git</span>
        )}
      </div>
    )
  }

  public render() {
    const { currentPath, entries, loading, error, pathSegments } = this.state
    const directories = entries.filter(e => e.isDirectory)

    return (
      <div className="remote-file-explorer">
        <div className="remote-explorer-breadcrumbs">
          {pathSegments.map((seg, i) => (
            <React.Fragment key={seg.path}>
              {i > 0 && <span className="remote-explorer-separator">/</span>}
              <button
                className="remote-explorer-breadcrumb"
                onClick={() => this.onBreadcrumbClick(seg.path)}
                type="button"
                disabled={seg.path === currentPath}
              >
                {seg.name === '/' ? '🏠' : seg.name}
              </button>
            </React.Fragment>
          ))}
        </div>

        <div className="remote-explorer-toolbar">
          <button
            className="remote-explorer-up-button"
            onClick={this.onNavigateUp}
            type="button"
            disabled={currentPath === '/' || loading}
            title="Go up one directory"
          >
            ⬆ Up
          </button>
          <button
            className="remote-explorer-select-button"
            onClick={this.onSelectCurrent}
            type="button"
            disabled={loading}
            title="Use this directory as the repository path"
          >
            Select this path
          </button>
        </div>

        <div className="remote-explorer-list" role="listbox">
          {loading && <div className="remote-explorer-loading">Loading…</div>}

          {!loading && error !== null && (
            <div className="remote-explorer-error">{error}</div>
          )}

          {!loading && error === null && directories.length === 0 && (
            <div className="remote-explorer-empty">No subdirectories found</div>
          )}

          {!loading &&
            error === null &&
            directories.map(entry => this.renderEntry(entry))}
        </div>

        <div className="remote-explorer-current-path">
          <span className="remote-explorer-path-label">Path:</span>
          <code>{this.state.selectedEntry?.path ?? currentPath}</code>
        </div>
      </div>
    )
  }
}
