import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { TextBox } from '../lib/text-box'
import { Dispatcher } from '../dispatcher'

interface IAddSSHConnectionDialogProps {
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void
}

interface IAddSSHConnectionDialogState {
  readonly name: string
  readonly hostname: string
  readonly port: string
  readonly username: string
  readonly privateKeyPath: string
  readonly useAgent: boolean
  readonly testing: boolean
  readonly testResult: string | null
}

export class AddSSHConnectionDialog extends React.Component<
  IAddSSHConnectionDialogProps,
  IAddSSHConnectionDialogState
> {
  public constructor(props: IAddSSHConnectionDialogProps) {
    super(props)

    this.state = {
      name: '',
      hostname: '',
      port: '22',
      username: '',
      privateKeyPath: '',
      useAgent: true,
      testing: false,
      testResult: null,
    }
  }

  public render() {
    const disabled =
      this.state.hostname.length === 0 || this.state.username.length === 0

    return (
      <Dialog
        id="add-ssh-connection"
        title={__DARWIN__ ? 'Add SSH Connection' : 'Add SSH connection'}
        ariaDescribedBy="add-ssh-connection-description"
        onDismissed={this.props.onDismissed}
        onSubmit={this.onSubmit}
        loading={this.state.testing}
      >
        <DialogContent>
          <p id="add-ssh-connection-description">
            Add an SSH connection to a remote machine where your git
            repositories are located.
          </p>

          <TextBox
            label="Connection Name"
            value={this.state.name}
            onValueChanged={this.onNameChanged}
            placeholder="e.g. Work Server"
            autoFocus={true}
          />

          <TextBox
            label="Hostname"
            value={this.state.hostname}
            onValueChanged={this.onHostnameChanged}
            placeholder="e.g. 192.168.1.100 or server.example.com"
          />

          <TextBox
            label="Port"
            value={this.state.port}
            onValueChanged={this.onPortChanged}
            placeholder="22"
          />

          <TextBox
            label="Username"
            value={this.state.username}
            onValueChanged={this.onUsernameChanged}
            placeholder="e.g. git or your-username"
          />

          <TextBox
            label="Private Key Path (optional)"
            value={this.state.privateKeyPath}
            onValueChanged={this.onPrivateKeyPathChanged}
            placeholder="e.g. ~/.ssh/id_rsa"
          />

          <label className="use-agent-checkbox">
            <input
              type="checkbox"
              checked={this.state.useAgent}
              onChange={this.onUseAgentChanged}
            />
            Use SSH agent for authentication
          </label>

          {this.state.testResult !== null && (
            <p className="ssh-test-result">{this.state.testResult}</p>
          )}
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={__DARWIN__ ? 'Add Connection' : 'Add connection'}
            okButtonDisabled={disabled || this.state.testing}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private onNameChanged = (name: string) => {
    this.setState({ name })
  }

  private onHostnameChanged = (hostname: string) => {
    this.setState({ hostname })
  }

  private onPortChanged = (port: string) => {
    this.setState({ port })
  }

  private onUsernameChanged = (username: string) => {
    this.setState({ username })
  }

  private onPrivateKeyPathChanged = (privateKeyPath: string) => {
    this.setState({ privateKeyPath })
  }

  private onUseAgentChanged = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ useAgent: event.target.checked })
  }

  private onSubmit = async () => {
    const port = parseInt(this.state.port, 10)
    if (isNaN(port) || port < 1 || port > 65535) {
      this.setState({ testResult: 'Invalid port number (1-65535)' })
      return
    }

    const name =
      this.state.name.trim() || `${this.state.username}@${this.state.hostname}`

    await this.props.dispatcher.addSSHConnection({
      name,
      hostname: this.state.hostname.trim(),
      port,
      username: this.state.username.trim(),
      privateKeyPath: this.state.privateKeyPath.trim() || null,
      useAgent: this.state.useAgent,
    })

    this.props.onDismissed()
  }
}
