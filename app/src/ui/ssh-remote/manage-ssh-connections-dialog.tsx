import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Dispatcher } from '../dispatcher'
import { SSHConnection } from '../../models/ssh-connection'

interface IManageSSHConnectionsDialogProps {
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void
  readonly sshConnections: ReadonlyArray<SSHConnection>
}

interface IManageSSHConnectionsDialogState {
  readonly selectedId: number | null
  readonly testing: boolean
  readonly testResult: string | null
}

export class ManageSSHConnectionsDialog extends React.Component<
  IManageSSHConnectionsDialogProps,
  IManageSSHConnectionsDialogState
> {
  public constructor(props: IManageSSHConnectionsDialogProps) {
    super(props)

    this.state = {
      selectedId: null,
      testing: false,
      testResult: null,
    }
  }

  public render() {
    return (
      <Dialog
        id="manage-ssh-connections"
        title={__DARWIN__ ? 'Manage SSH Connections' : 'Manage SSH connections'}
        ariaDescribedBy="manage-ssh-connections-description"
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <p id="manage-ssh-connections-description">
            Manage your SSH connections to remote machines.
          </p>

          <div className="ssh-connections-list">
            {this.props.sshConnections.length === 0 && (
              <p className="no-connections">No SSH connections configured.</p>
            )}

            {this.props.sshConnections.map(c => (
              <div
                key={c.id}
                className={`ssh-connection-item ${
                  this.state.selectedId === c.id ? 'selected' : ''
                }`}
                onClick={() => this.onSelect(c.id)}
                role="button"
                tabIndex={0}
              >
                <div className="ssh-connection-name">{c.name}</div>
                <div className="ssh-connection-detail">
                  {c.username}@{c.hostname}:{c.port}
                </div>
              </div>
            ))}
          </div>

          <div className="ssh-connections-actions">
            <button
              className="button-component"
              onClick={this.onAdd}
              type="button"
            >
              {__DARWIN__ ? 'Add Connection' : 'Add connection'}
            </button>
            <button
              className="button-component"
              onClick={this.onRemove}
              type="button"
              disabled={this.state.selectedId === null}
            >
              Remove
            </button>
            <button
              className="button-component"
              onClick={this.onTest}
              type="button"
              disabled={this.state.selectedId === null || this.state.testing}
            >
              {this.state.testing ? 'Testing...' : 'Test'}
            </button>
          </div>

          {this.state.testResult !== null && (
            <p className="ssh-test-result">{this.state.testResult}</p>
          )}
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText="Done"
            cancelButtonVisible={false}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private onSelect = (id: number) => {
    this.setState({ selectedId: id, testResult: null })
  }

  private onAdd = () => {
    this.props.dispatcher.showAddSSHConnectionDialog()
  }

  private onRemove = async () => {
    if (this.state.selectedId !== null) {
      await this.props.dispatcher.removeSSHConnection(this.state.selectedId)
      this.setState({ selectedId: null, testResult: null })
    }
  }

  private onTest = async () => {
    if (this.state.selectedId === null) {
      return
    }

    this.setState({ testing: true, testResult: null })
    const result = await this.props.dispatcher.testSSHConnection(
      this.state.selectedId
    )
    this.setState({
      testing: false,
      testResult: result.ok
        ? 'Connection successful!'
        : `Connection failed: ${result.error}`,
    })
  }
}
