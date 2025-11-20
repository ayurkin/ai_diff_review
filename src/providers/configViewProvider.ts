import * as vscode from 'vscode';
import { GitService } from '../services/gitService';

export class ConfigViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'aiReview.configView';
    private _view?: vscode.WebviewView;

    private _targetBranch?: string;
    private _sourceBranch?: string;
    private _instruction: string = 'Review changes.';

    private _onDidChangeConfig = new vscode.EventEmitter<ConfigData>();
    readonly onDidChangeConfig = this._onDidChangeConfig.event;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private gitService: GitService
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'getBranches': {
                    try {
                        const branches = await this.gitService.getBranches();
                        this._view?.webview.postMessage({ type: 'setBranches', value: branches });
                    } catch (error: any) {
                        vscode.window.showErrorMessage(`Failed to get branches: ${error.message || error}`);
                    }
                    break;
                }
                case 'configChanged': {
                    this._targetBranch = data.value.targetBranch;
                    this._sourceBranch = data.value.sourceBranch;
                    this._instruction = data.value.instruction;

                    // Notify listeners that config changed
                    this._onDidChangeConfig.fire({
                        targetBranch: this._targetBranch,
                        sourceBranch: this._sourceBranch,
                        instruction: this._instruction
                    });
                    break;
                }
            }
        });

        // Load initial branches
        this.loadBranches();
    }

    private async loadBranches() {
        try {
            const branches = await this.gitService.getBranches();
            this._view?.webview.postMessage({ type: 'setBranches', value: branches });
        } catch (error: any) {
            console.error('Failed to load branches:', error);
        }
    }

    public getConfig(): ConfigData {
        return {
            targetBranch: this._targetBranch,
            sourceBranch: this._sourceBranch,
            instruction: this._instruction
        };
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    color: var(--vscode-foreground);
                    padding: 10px;
                    background-color: var(--vscode-sideBar-background);
                }

                label {
                    display: block;
                    margin-top: 8px;
                    margin-bottom: 4px;
                    font-weight: 600;
                    font-size: 11px;
                    text-transform: uppercase;
                    opacity: 0.8;
                }

                select, textarea {
                    width: 100%;
                    margin-bottom: 8px;
                    background: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                    padding: 6px 8px;
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    box-sizing: border-box;
                }

                select {
                    cursor: pointer;
                }

                textarea {
                    resize: vertical;
                    min-height: 60px;
                    line-height: 1.4;
                }

                select:focus, textarea:focus {
                    outline: 1px solid var(--vscode-focusBorder);
                    border-color: var(--vscode-focusBorder);
                }

                .info-text {
                    font-size: 11px;
                    opacity: 0.7;
                    margin-top: -4px;
                    margin-bottom: 8px;
                }
            </style>
        </head>
        <body>
            <label for="targetBranch">Target Branch (Base)</label>
            <select id="targetBranch">
                <option value="">Select branch...</option>
            </select>
            <div class="info-text">The base branch to compare against</div>

            <label for="sourceBranch">Source Branch (Compare)</label>
            <select id="sourceBranch">
                <option value="">Select branch...</option>
            </select>
            <div class="info-text">The branch with your changes</div>

            <label for="instruction">Review Instruction</label>
            <textarea id="instruction" rows="4" placeholder="Enter your review instruction for the LLM...">Review changes.</textarea>
            <div class="info-text">Instructions for the AI to follow during review</div>

            <script>
                const vscode = acquireVsCodeApi();

                const targetBranchSelect = document.getElementById('targetBranch');
                const sourceBranchSelect = document.getElementById('sourceBranch');
                const instructionTextarea = document.getElementById('instruction');

                // Restore previous state
                const previousState = vscode.getState();
                if (previousState) {
                    if (previousState.targetBranch) targetBranchSelect.value = previousState.targetBranch;
                    if (previousState.sourceBranch) sourceBranchSelect.value = previousState.sourceBranch;
                    if (previousState.instruction) instructionTextarea.value = previousState.instruction;
                }

                // Notify extension when config changes
                function notifyConfigChange() {
                    const config = {
                        targetBranch: targetBranchSelect.value || undefined,
                        sourceBranch: sourceBranchSelect.value || undefined,
                        instruction: instructionTextarea.value
                    };

                    // Save state
                    vscode.setState(config);

                    // Notify extension
                    vscode.postMessage({
                        type: 'configChanged',
                        value: config
                    });
                }

                targetBranchSelect.addEventListener('change', notifyConfigChange);
                sourceBranchSelect.addEventListener('change', notifyConfigChange);
                instructionTextarea.addEventListener('input', notifyConfigChange);

                // Request branches on load
                vscode.postMessage({ type: 'getBranches' });

                // Listen for messages from extension
                window.addEventListener('message', event => {
                    const message = event.data;
                    if (message.type === 'setBranches') {
                        const branches = message.value;

                        // Store current selections
                        const currentTarget = targetBranchSelect.value;
                        const currentSource = sourceBranchSelect.value;

                        // Populate target branch dropdown
                        targetBranchSelect.innerHTML = '<option value="">Select branch...</option>' +
                            branches.map(b => '<option value="' + b + '">' + b + '</option>').join('');

                        // Populate source branch dropdown
                        sourceBranchSelect.innerHTML = '<option value="">Select branch...</option>' +
                            branches.map(b => '<option value="' + b + '">' + b + '</option>').join('');

                        // Restore selections if they exist
                        if (currentTarget && branches.includes(currentTarget)) {
                            targetBranchSelect.value = currentTarget;
                        } else if (branches.includes('main')) {
                            targetBranchSelect.value = 'main';
                        } else if (branches.includes('master')) {
                            targetBranchSelect.value = 'master';
                        }

                        if (currentSource && branches.includes(currentSource)) {
                            sourceBranchSelect.value = currentSource;
                        }

                        // Trigger change event if values were set
                        if (targetBranchSelect.value || sourceBranchSelect.value) {
                            notifyConfigChange();
                        }
                    }
                });
            </script>
        </body>
        </html>`;
    }
}

export interface ConfigData {
    targetBranch?: string;
    sourceBranch?: string;
    instruction: string;
}
