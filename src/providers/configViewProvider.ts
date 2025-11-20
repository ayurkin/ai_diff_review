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
                case 'getInitialState': {
                    this.loadBranches();
                    this.sendCurrentConfig();
                    break;
                }
                case 'configChanged': {
                    // Handle Branch/Instruction changes
                    this._targetBranch = data.value.targetBranch;
                    this._sourceBranch = data.value.sourceBranch;
                    this._instruction = data.value.instruction;

                    this._onDidChangeConfig.fire({
                        targetBranch: this._targetBranch,
                        sourceBranch: this._sourceBranch,
                        instruction: this._instruction
                    });
                    break;
                }
                case 'savePatterns': {
                    // Handle Pattern changes (Write to VS Code Settings)
                    const config = vscode.workspace.getConfiguration('aiReview');
                    await config.update(data.key, data.value, vscode.ConfigurationTarget.Global);
                    break;
                }
            }
        });
    }

    private async loadBranches() {
        try {
            const branches = await this.gitService.getBranches();
            this._view?.webview.postMessage({ type: 'setBranches', value: branches });
        } catch (error: any) {
            console.error('Failed to load branches:', error);
        }
    }

    private sendCurrentConfig() {
        const config = vscode.workspace.getConfiguration('aiReview');
        const ignorePatterns = config.get<Record<string, boolean>>('ignorePatterns') || {};
        const diffIgnorePatterns = config.get<Record<string, boolean>>('diffIgnorePatterns') || {};

        this._view?.webview.postMessage({
            type: 'setPatterns',
            ignorePatterns,
            diffIgnorePatterns
        });
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

                /* Form Elements */
                label {
                    display: block;
                    margin-top: 12px;
                    margin-bottom: 4px;
                    font-weight: 600;
                    font-size: 11px;
                    text-transform: uppercase;
                    opacity: 0.9;
                }

                select, textarea, input[type="text"] {
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

                select:focus, textarea:focus, input[type="text"]:focus {
                    outline: 1px solid var(--vscode-focusBorder);
                    border-color: var(--vscode-focusBorder);
                }

                button {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 6px 12px;
                    cursor: pointer;
                }
                button:hover {
                    background: var(--vscode-button-hoverBackground);
                }

                /* Pattern Lists */
                .pattern-section {
                    margin-top: 15px;
                    border-top: 1px solid var(--vscode-panel-border);
                    padding-top: 10px;
                }
                
                details {
                    margin-bottom: 10px;
                }

                summary {
                    cursor: pointer;
                    font-weight: 600;
                    margin-bottom: 8px;
                    outline: none;
                }

                .pattern-list {
                    max-height: 200px;
                    overflow-y: auto;
                    border: 1px solid var(--vscode-input-border);
                    background: var(--vscode-editor-background);
                    padding: 5px;
                }

                .pattern-row {
                    display: flex;
                    align-items: center;
                    padding: 4px 0;
                    border-bottom: 1px solid var(--vscode-panel-border);
                }
                .pattern-row:last-child {
                    border-bottom: none;
                }

                .pattern-row input[type="checkbox"] {
                    margin-right: 8px;
                }

                .pattern-row span {
                    flex: 1;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .delete-btn {
                    background: transparent;
                    color: var(--vscode-errorForeground);
                    padding: 2px 6px;
                    font-size: 12px;
                    opacity: 0.7;
                }
                .delete-btn:hover {
                    background: var(--vscode-list-hoverBackground);
                    opacity: 1;
                }

                .add-row {
                    display: flex;
                    margin-top: 8px;
                    gap: 5px;
                }
                .add-row input {
                    margin-bottom: 0;
                }
            </style>
        </head>
        <body>
            <!-- BRANCH CONFIG -->
            <label for="targetBranch">Target Branch (Base)</label>
            <select id="targetBranch"><option value="">Loading...</option></select>

            <label for="sourceBranch">Source Branch (Compare)</label>
            <select id="sourceBranch"><option value="">Loading...</option></select>

            <label for="instruction">Review Instruction</label>
            <textarea id="instruction" rows="3">Review changes.</textarea>

            <!-- PROJECT FILTERS -->
            <div class="pattern-section">
                <details>
                    <summary>Project Context Filters</summary>
                    <div class="info-text" style="margin-bottom:5px; font-size:10px; opacity:0.8;">
                        Files matching checked patterns are <b>hidden</b> from the context tree.
                    </div>
                    <div id="ignorePatternsList" class="pattern-list"></div>
                    <div class="add-row">
                        <input type="text" id="newIgnorePattern" placeholder="e.g. node_modules">
                        <button id="addIgnorePattern">Add</button>
                    </div>
                </details>
            </div>

            <!-- DIFF FILTERS -->
            <div class="pattern-section">
                <details>
                    <summary>Diff Ignore Filters</summary>
                    <div class="info-text" style="margin-bottom:5px; font-size:10px; opacity:0.8;">
                        Files matching checked patterns are <b>excluded</b> from changes list.
                    </div>
                    <div id="diffPatternsList" class="pattern-list"></div>
                    <div class="add-row">
                        <input type="text" id="newDiffPattern" placeholder="e.g. *.lock">
                        <button id="addDiffPattern">Add</button>
                    </div>
                </details>
            </div>

            <script>
                const vscode = acquireVsCodeApi();

                // --- Elements ---
                const els = {
                    target: document.getElementById('targetBranch'),
                    source: document.getElementById('sourceBranch'),
                    instruction: document.getElementById('instruction'),
                    ignoreList: document.getElementById('ignorePatternsList'),
                    diffList: document.getElementById('diffPatternsList'),
                    newIgnore: document.getElementById('newIgnorePattern'),
                    newDiff: document.getElementById('newDiffPattern'),
                    addIgnoreBtn: document.getElementById('addIgnorePattern'),
                    addDiffBtn: document.getElementById('addDiffPattern')
                };

                // --- State ---
                let state = {
                    targetBranch: '',
                    sourceBranch: '',
                    instruction: 'Review changes.',
                    ignorePatterns: {},
                    diffIgnorePatterns: {}
                };

                // Restore State
                const previousState = vscode.getState();
                if (previousState) {
                    state = { ...state, ...previousState };
                    updateUI();
                }

                // --- Logic: Branches ---
                function notifyConfigChange() {
                    state.targetBranch = els.target.value;
                    state.sourceBranch = els.source.value;
                    state.instruction = els.instruction.value;
                    vscode.setState(state);
                    vscode.postMessage({ type: 'configChanged', value: state });
                }

                els.target.addEventListener('change', notifyConfigChange);
                els.source.addEventListener('change', notifyConfigChange);
                els.instruction.addEventListener('input', notifyConfigChange);

                // --- Logic: Patterns ---
                
                function renderList(container, patterns, keyName) {
                    container.innerHTML = '';
                    Object.keys(patterns).sort().forEach(pattern => {
                        const div = document.createElement('div');
                        div.className = 'pattern-row';
                        
                        const checkbox = document.createElement('input');
                        checkbox.type = 'checkbox';
                        checkbox.checked = patterns[pattern];
                        checkbox.onchange = () => {
                            patterns[pattern] = checkbox.checked;
                            savePatterns(keyName, patterns);
                        };

                        const span = document.createElement('span');
                        span.textContent = pattern;
                        span.title = pattern;

                        const delBtn = document.createElement('button');
                        delBtn.className = 'delete-btn';
                        delBtn.textContent = 'x';
                        delBtn.onclick = () => {
                            delete patterns[pattern];
                            savePatterns(keyName, patterns);
                            renderList(container, patterns, keyName);
                        };

                        div.appendChild(checkbox);
                        div.appendChild(span);
                        div.appendChild(delBtn);
                        container.appendChild(div);
                    });
                }

                function savePatterns(key, patterns) {
                    state[key] = patterns;
                    vscode.setState(state);
                    vscode.postMessage({ type: 'savePatterns', key: key, value: patterns });
                }

                function addPattern(input, container, patterns, keyName) {
                    const val = input.value.trim();
                    if (val) {
                        patterns[val] = true; // Default to checked (hidden)
                        input.value = '';
                        savePatterns(keyName, patterns);
                        renderList(container, patterns, keyName);
                    }
                }

                els.addIgnoreBtn.onclick = () => addPattern(els.newIgnore, els.ignoreList, state.ignorePatterns, 'ignorePatterns');
                els.addDiffBtn.onclick = () => addPattern(els.newDiff, els.diffList, state.diffIgnorePatterns, 'diffIgnorePatterns');

                // --- Initialization ---
                
                window.addEventListener('message', event => {
                    const msg = event.data;
                    if (msg.type === 'setBranches') {
                        const branches = msg.value;
                        const opts = '<option value="">Select...</option>' + 
                            branches.map(b => '<option value="'+b+'">'+b+'</option>').join('');
                        
                        els.target.innerHTML = opts;
                        els.source.innerHTML = opts;

                        if (state.targetBranch) els.target.value = state.targetBranch;
                        if (state.sourceBranch) els.source.value = state.sourceBranch;
                    } 
                    else if (msg.type === 'setPatterns') {
                        state.ignorePatterns = msg.ignorePatterns || {};
                        state.diffIgnorePatterns = msg.diffIgnorePatterns || {};
                        updateUI();
                    }
                });

                function updateUI() {
                    if (state.targetBranch) els.target.value = state.targetBranch;
                    if (state.sourceBranch) els.source.value = state.sourceBranch;
                    els.instruction.value = state.instruction;
                    
                    renderList(els.ignoreList, state.ignorePatterns, 'ignorePatterns');
                    renderList(els.diffList, state.diffIgnorePatterns, 'diffIgnorePatterns');
                }

                // Start
                vscode.postMessage({ type: 'getInitialState' });

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
