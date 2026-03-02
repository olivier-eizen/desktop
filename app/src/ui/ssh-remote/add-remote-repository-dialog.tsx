import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { TextBox } from '../lib/text-box'
import { Dispatcher } from '../dispatcher'
import { SSHConnection } from '../../models/ssh-connection'

interface IAddRemoteRepositoryDialogProps {
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void
  readonly sshConnections: ReadonlyArray<SSHConnection>
}

interface IAddRemoteRepositoryDialogState {
  readonly selectedConnectionId: number | null
  readonly remotePath: string
  readonly verifying: boolean
  readonly verifyResult: string | null
}

export class AddRemoteRepositoryDialog extends React.Component<
  IAddRemoteRepositoryDialogProps,
  IAddRemoteRepositoryDialogState
> {
  public constructor(props: IAddRemoteRepositoryDialogProps) {
    super(props)

    this.state = {
      selectedConnectionId:
        props.sshConnections.length > 0 ? props.sshConnections[0].id : null,
      remotePath: '',
      verifying: false,
      verifyResult: null,
    }
  }

  public render() {
    const disabled =
      this.state.selectedConnectionId === null ||
      this.state.remotePath.length === 0

    const hasConnections = this.props.sshConnections.length > 0

    return (
      <Dialog
        id="add-remote-repository"
        title={__DARWIN__ ? 'Add Remote Repository' : 'Add remote repository'}
        ariaDescribedBy="add-remote-repository-description"
        onDismissed={this.props.onDismissed}
        onSubmit={this.onSubmit}
        loading={this.state.verifying}
      >
        <DialogContent>
          <p id="add-remote-repository-description">
            Add a git repository from a remote machine over SSH.
          </p>

          {!hasConnections && (
            <p className="ssh-no-connections-warning">
              No SSH connections configured yet.{' '}
              <button
                className="link-button"
                onClick={this.onAddConnection}
                type="button"
              >
                Add an SSH connection
              </button>{' '}
              first.
            </p>
          )}

          {hasConnections && (
            <>
              <label htmlFor="ssh-connection-select">SSH Connection</label>
              <select
                id="ssh-connection-select"
                value={this.state.selectedConnectionId ?? ''}
                onChange={this.onConnectionChanged}
              >
                {this.props.sshConnections.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.username}@{c.hostname}:{c.port})
                  </option>
                ))}
              </select>

              <TextBox
                label="Remote Repository Path"
                value={this.state.remotePath}
                onValueChanged={this.onRemotePathChanged}
                placeholder="e.g. /home/user/projects/my-repo"
              />

              <button
                className="link-button"
                onClick={this.onTestConnection}
                type="button"
                disabled={disabled || this.state.verifying}
              >
                Test connection & verify repository
              </button>

              {this.state.verifyResult !== null && (
                <p className="ssh-verify-result">{this.state.verifyResult}</p>
              )}
            </>
          )}
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={__DARWIN__ ? 'Add Repository' : 'Add repository'}
            okButtonDisabled={disabled || this.state.verifying}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private onConnectionChanged = (
    event: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const id = parseInt(event.target.value, 10)
    this.setState({
      selectedConnectionId: isNaN(id) ? null : id,
      verifyResult: null,
    })
  }

  private onRemotePathChanged = (remotePath: string) => {
    this.setState({ remotePath, verifyResult: null })
  }

  private onAddConnection = () => {
    this.props.dispatcher.showAddSSHConnectionDialog()
  }

  private onTestConnection = async () => {
    const { selectedConnectionId, remotePath } = this.state
    if (selectedConnectionId === null || remotePath.length === 0) {
      return
    }

    this.setState({ verifying: true, verifyResult: null })

    const result = await this.props.dispatcher.testSSHRemoteRepository(
      selectedConnectionId,
      remotePath.trim()
    )

    this.setState({
      verifying: false,
      verifyResult: result.ok
        ? 'Connection successful — repository verified!'
        : `Error: ${result.error}`,
    })
  }

  private onSubmit = async () => {
    const { selectedConnectionId, remotePath } = this.state
    if (selectedConnectionId === null || remotePath.length === 0) {
      return
    }

    await this.props.dispatcher.addRemoteRepository(
      selectedConnectionId,
      remotePath.trim()
    )

    this.props.onDismissed()
  }
}
