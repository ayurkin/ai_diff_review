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

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'getInitialState': {
                    this.loadBranches();
                    this.sendCurrentConfig();
                    break;
                }
                case 'configChanged': {
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
        // Refined icons to match VS Code Codicons (thinner, cleaner)
        const icons = {
            chevronRight: `<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M10.072 8.024L5.715 3.667l.618-.62L11 7.716v.618L6.333 13l-.618-.619 4.357-4.357z"/></svg>`,
            chevronDown: `<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M7.976 10.072l4.357-4.357.62.618L8.284 11h-.618L3 6.333l.619-.618 4.357 4.357z"/></svg>`,
            check: `<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M14.431 3.323l-8.47 10-.79-.036-3.35-4.77.818-.574 2.978 4.24 8.051-9.506.764.646z"/></svg>`,
            close: `<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.707.708L7.293 8l-3.646 3.646.707.708L8 8.707z"/></svg>`,
            add: `<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M14 7v1H9v5H8V8H3V7h5V2h1v5h5z"/></svg>`
        };

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                :root {
                    /* Variables for native feel */
                    --header-bg: var(--vscode-sideBarSectionHeader-background);
                    --header-fg: var(--vscode-sideBarSectionHeader-foreground);
                    --header-border: var(--vscode-sideBarSectionHeader-border, transparent);
                    --list-hover: var(--vscode-list-hoverBackground);
                    --list-text: var(--vscode-sideBar-foreground);
                    --input-bg: var(--vscode-input-background);
                    --input-fg: var(--vscode-input-foreground);
                    --input-border: var(--vscode-input-border);
                }

                body {
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    color: var(--vscode-foreground);
                    padding: 0;
                    margin: 0;
                    background-color: var(--vscode-sideBar-background);
                    overflow-x: hidden;
                }

                /* 1. FORM SECTION */
                .form-container {
                    padding: 10px 20px 15px 20px;
                }

                .section-label {
                    font-size: 11px;
                    font-weight: 700;
                    text-transform: uppercase;
                    color: var(--vscode-sideBarSectionHeader-foreground);
                    margin-top: 12px;
                    margin-bottom: 6px;
                    display: block;
                    opacity: 0.8;
                }

                select, textarea {
                    width: 100%;
                    box-sizing: border-box;
                    background-color: var(--input-bg);
                    color: var(--input-fg);
                    border: 1px solid var(--input-border);
                    padding: 3px 6px;
                    font-family: inherit;
                    font-size: 13px;
                    margin-bottom: 6px;
                    border-radius: 2px;
                }

                select:focus, textarea:focus {
                    outline: 1px solid var(--vscode-focusBorder);
                    border-color: var(--vscode-focusBorder);
                }

                /* 2. HEADERS (Native Style) */
                details {
                    width: 100%;
                }

                details > summary {
                    list-style: none;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    background-color: var(--header-bg);
                    color: var(--header-fg);
                    padding: 3px 0px; /* Reduced padding to match sidebar tree headers */
                    font-weight: 700;
                    font-size: 11px;
                    text-transform: uppercase;
                    outline: none;
                    border-top: 1px solid var(--header-border);
                    height: 22px;
                    box-sizing: border-box;
                }
                
                details > summary::-webkit-details-marker { display: none; }

                .chevron-icon {
                    width: 16px;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    margin-right: 4px;
                }
                
                details[open] .chevron-right { display: none; }
                details:not([open]) .chevron-down { display: none; }

                /* 3. LIST ITEMS (Tree Style) */
                .list-wrapper {
                    padding: 0;
                    margin-bottom: 10px;
                }

                .list-item {
                    display: flex;
                    align-items: center;
                    height: 22px; /* Fixed tree row height */
                    padding-left: 20px;
                    padding-right: 6px;
                    cursor: pointer;
                    color: var(--list-text);
                    font-size: 13px;
                    position: relative; /* For absolute positioning actions */
                    border: 1px solid transparent; /* Maintain box model consistency */
                    border-width: 1px 0; /* Only top/bottom so width doesn't jump */
                }

                .list-item:hover {
                    background-color: var(--list-hover);
                }

                /* CHECKBOX (Native Style) */
                .custom-checkbox {
                    appearance: none;
                    width: 13px;
                    height: 13px;
                    border: 1px solid var(--vscode-checkbox-border);
                    background-color: var(--vscode-checkbox-background);
                    border-radius: 2px; /* Slightly rounded */
                    margin: 0 6px 0 0;
                    position: relative;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                }

                .custom-checkbox:checked {
                    background-color: var(--vscode-checkbox-background);
                    border-color: var(--vscode-focusBorder);
                }

                .custom-checkbox::after {
                    content: '';
                    width: 11px;
                    height: 11px;
                    display: none;
                    background-color: var(--vscode-checkbox-foreground);
                    mask: url('data:image/svg+xml;utf8,${encodeURIComponent(icons.check)}') no-repeat center;
                    -webkit-mask: url('data:image/svg+xml;utf8,${encodeURIComponent(icons.check)}') no-repeat center;
                }

                .custom-checkbox:checked::after {
                    display: block;
                }

                .item-label {
                    flex: 1;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                /* ACTIONS (Absolute to prevent jumping) */
                .item-actions {
                    display: none;
                    position: absolute;
                    right: 8px;
                    height: 100%;
                    align-items: center;
                }

                .list-item:hover .item-actions {
                    display: flex;
                }

                button.icon-btn {
                    background: none;
                    border: none;
                    color: var(--vscode-icon-foreground);
                    cursor: pointer;
                    padding: 2px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 3px;
                }
                button.icon-btn:hover {
                    background-color: var(--vscode-toolbar-hoverBackground);
                }

                /* ADD ROW */
                .add-row {
                    display: flex;
                    height: 26px;
                    padding: 0 20px;
                    align-items: center;
                    margin-top: 2px;
                }
                
                .add-row input {
                    flex: 1;
                    height: 24px;
                    background: transparent;
                    border: 1px solid transparent;
                    color: var(--vscode-inputPlaceholder-foreground);
                    padding: 0 4px;
                    font-size: 12px;
                    outline: none;
                }
                
                .add-row input:focus {
                    background-color: var(--input-bg);
                    border-color: var(--vscode-focusBorder);
                    color: var(--input-fg);
                }
                
                .add-row input::placeholder {
                    color: var(--vscode-disabledForeground);
                    font-style: italic;
                }

            </style>
        </head>
        <body>
            
            <!-- CONFIG FORM -->
            <div class="form-container">
                <span class="section-label">Target Branch</span>
                <select id="targetBranch"><option>Loading...</option></select>

                <span class="section-label">Source Branch</span>
                <select id="sourceBranch"><option>Loading...</option></select>

                <span class="section-label">Review Instruction</span>
                <textarea id="instruction" rows="3" placeholder="Enter instructions..."></textarea>
            </div>

            <!-- CONTEXT IGNORE LIST -->
            <details>
                <summary>
                    <div class="chevron-icon">
                        <span class="chevron-right">${icons.chevronRight}</span>
                        <span class="chevron-down">${icons.chevronDown}</span>
                    </div>
                    Context Ignore List
                </summary>
                <div class="list-wrapper">
                    <div id="ignoreList"></div>
                    <div class="add-row">
                        <input type="text" id="newIgnore" placeholder="Add pattern (e.g. node_modules)">
                        <button id="addIgnoreBtn" class="icon-btn" title="Add" style="visibility:hidden">${icons.add}</button>
                    </div>
                </div>
            </details>

            <!-- DIFF IGNORE LIST -->
            <details>
                <summary>
                    <div class="chevron-icon">
                        <span class="chevron-right">${icons.chevronRight}</span>
                        <span class="chevron-down">${icons.chevronDown}</span>
                    </div>
                    Diff Ignore List
                </summary>
                <div class="list-wrapper">
                    <div id="diffList"></div>
                    <div class="add-row">
                        <input type="text" id="newDiff" placeholder="Add pattern (e.g. *.lock)">
                        <button id="addDiffBtn" class="icon-btn" title="Add" style="visibility:hidden">${icons.add}</button>
                    </div>
                </div>
            </details>

            <script>
                const vscode = acquireVsCodeApi();
                const els = {
                    target: document.getElementById('targetBranch'),
                    source: document.getElementById('sourceBranch'),
                    instruction: document.getElementById('instruction'),
                    ignoreList: document.getElementById('ignoreList'),
                    diffList: document.getElementById('diffList'),
                    newIgnore: document.getElementById('newIgnore'),
                    newDiff: document.getElementById('newDiff'),
                    addIgnoreBtn: document.getElementById('addIgnoreBtn'),
                    addDiffBtn: document.getElementById('addDiffBtn')
                };

                let state = {
                    targetBranch: '',
                    sourceBranch: '',
                    instruction: '',
                    ignorePatterns: {},
                    diffIgnorePatterns: {}
                };

                // --- STATE RESTORE ---
                const prevState = vscode.getState();
                if (prevState) {
                    state = { ...state, ...prevState };
                    render();
                }

                // --- UI LOGIC for Inputs ---
                // Only show Add button when typing
                els.newIgnore.oninput = (e) => els.addIgnoreBtn.style.visibility = e.target.value ? 'visible' : 'hidden';
                els.newDiff.oninput = (e) => els.addDiffBtn.style.visibility = e.target.value ? 'visible' : 'hidden';

                // --- EVENTS ---
                function saveState() {
                    vscode.setState(state);
                }

                function notifyConfig() {
                    state.targetBranch = els.target.value;
                    state.sourceBranch = els.source.value;
                    state.instruction = els.instruction.value;
                    saveState();
                    vscode.postMessage({ type: 'configChanged', value: state });
                }

                els.target.onchange = notifyConfig;
                els.source.onchange = notifyConfig;
                els.instruction.oninput = notifyConfig;

                // --- LIST LOGIC ---
                function togglePattern(keyName, pattern, checked) {
                    state[keyName][pattern] = checked;
                    saveState();
                    vscode.postMessage({ type: 'savePatterns', key: keyName, value: state[keyName] });
                }

                function deletePattern(keyName, pattern) {
                    delete state[keyName][pattern];
                    saveState();
                    vscode.postMessage({ type: 'savePatterns', key: keyName, value: state[keyName] });
                    renderLists();
                }

                function addPattern(keyName, inputEl, btnEl) {
                    const val = inputEl.value.trim();
                    if (val) {
                        state[keyName][val] = true; // Default checked
                        inputEl.value = '';
                        btnEl.style.visibility = 'hidden';
                        saveState();
                        vscode.postMessage({ type: 'savePatterns', key: keyName, value: state[keyName] });
                        renderLists();
                    }
                }

                els.addIgnoreBtn.onclick = () => addPattern('ignorePatterns', els.newIgnore, els.addIgnoreBtn);
                els.addDiffBtn.onclick = () => addPattern('diffIgnorePatterns', els.newDiff, els.addDiffBtn);
                
                els.newIgnore.onkeydown = (e) => { if(e.key === 'Enter') addPattern('ignorePatterns', els.newIgnore, els.addIgnoreBtn); };
                els.newDiff.onkeydown = (e) => { if(e.key === 'Enter') addPattern('diffIgnorePatterns', els.newDiff, els.addDiffBtn); };

                // --- RENDERING ---
                function renderList(container, patterns, keyName) {
                    container.innerHTML = '';
                    const sortedKeys = Object.keys(patterns).sort();
                    
                    sortedKeys.forEach(key => {
                        const row = document.createElement('div');
                        row.className = 'list-item';
                        
                        // Checkbox
                        const checkbox = document.createElement('input');
                        checkbox.type = 'checkbox';
                        checkbox.className = 'custom-checkbox';
                        checkbox.checked = patterns[key];
                        checkbox.onchange = (e) => togglePattern(keyName, key, e.target.checked);

                        // Label
                        const label = document.createElement('span');
                        label.className = 'item-label';
                        label.textContent = key;
                        label.title = key;
                        label.onclick = () => { checkbox.click(); };

                        // Actions (Absolute Positioned)
                        const actions = document.createElement('div');
                        actions.className = 'item-actions';
                        const delBtn = document.createElement('button');
                        delBtn.className = 'icon-btn';
                        delBtn.title = 'Remove';
                        delBtn.innerHTML = '${icons.close}';
                        delBtn.onclick = (e) => {
                            e.stopPropagation();
                            deletePattern(keyName, key);
                        };
                        actions.appendChild(delBtn);

                        row.appendChild(checkbox);
                        row.appendChild(label);
                        row.appendChild(actions);
                        container.appendChild(row);
                    });
                }

                function renderLists() {
                    renderList(els.ignoreList, state.ignorePatterns, 'ignorePatterns');
                    renderList(els.diffList, state.diffIgnorePatterns, 'diffIgnorePatterns');
                }

                function render() {
                    if (state.targetBranch && els.target.innerHTML.includes(state.targetBranch)) els.target.value = state.targetBranch;
                    if (state.sourceBranch && els.source.innerHTML.includes(state.sourceBranch)) els.source.value = state.sourceBranch;
                    els.instruction.value = state.instruction;
                    renderLists();
                }

                // --- MESSAGE HANDLING ---
                window.addEventListener('message', event => {
                    const msg = event.data;
                    if (msg.type === 'setBranches') {
                        const opts = '<option value="">Select...</option>' + 
                            msg.value.map(b => '<option value="'+b+'">'+b+'</option>').join('');
                        els.target.innerHTML = opts;
                        els.source.innerHTML = opts;
                        render();
                    } else if (msg.type === 'setPatterns') {
                        state.ignorePatterns = msg.ignorePatterns || {};
                        state.diffIgnorePatterns = msg.diffIgnorePatterns || {};
                        saveState();
                        render();
                    }
                });

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
