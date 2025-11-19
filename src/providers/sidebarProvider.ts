import * as vscode from 'vscode';
import { GitService } from '../services/gitService';
import { PromptGenerator } from '../services/promptGenerator';
import { ChangedFile } from '../types';

export class SidebarProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'aiReview.view';
    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private gitService: GitService,
        private promptGenerator: PromptGenerator
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        console.log('AI Review: resolveWebviewView called!');

        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'getBranches': {
                    const branches = await this.gitService.getBranches();
                    this._view?.webview.postMessage({ type: 'setBranches', value: branches });
                    break;
                }
                case 'getFiles': {
                    const { target, source } = data.value;
                    const files = await this.gitService.getChangedFiles(target, source);
                    this._view?.webview.postMessage({ type: 'setFiles', value: files });
                    break;
                }
                case 'openDiff': {
                    this.openDiff(data.value);
                    break;
                }
                case 'copyPrompt': {
                    await this.generateAndCopy(data.value);
                    break;
                }
            }
        });
    }
    
    private async openDiff(data: { file: ChangedFile, source: string, target: string }) {
        const { file, source, target } = data;
        const leftUri = vscode.Uri.parse(`ai-review://git/${file.path}?ref=${target}`);
        const rightUri = vscode.Uri.parse(`ai-review://git/${file.path}?ref=${source}`);
        const title = `${file.path} (${target} ↔ ${source})`;
        await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title);
    }

    private async generateAndCopy(data: { files: ChangedFile[], selectedPaths: string[], source: string, target: string, instruction: string }) {
        try {
            const filesToReview = data.files.filter(f => data.selectedPaths.includes(f.path));
            if (filesToReview.length === 0) {
                vscode.window.showWarningMessage('No files selected for review');
                return;
            }
            const prompt = await this.promptGenerator.generate({
                files: filesToReview,
                sourceBranch: data.source,
                targetBranch: data.target,
                instruction: data.instruction
            });
            await vscode.env.clipboard.writeText(prompt);
            vscode.window.showInformationMessage(`Prompt copied! (${filesToReview.length} files)`);
        } catch (e: any) {
            vscode.window.showErrorMessage('Error: ' + e.message);
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        // Icons (Simple SVG paths to match VS Code style)
        const iconChevronRight = `<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M10.072 8.024L5.715 3.667l.618-.62L11 7.716v.618L6.333 13l-.618-.619 4.357-4.357z"/></svg>`;
        const iconChevronDown = `<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M7.976 10.072l4.357-4.357.62.618L8.284 11h-.618L3 6.333l.619-.618 4.357 4.357z"/></svg>`;
        const iconFolder = `<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M7.71 4l.7 1H13.5l.5.5v8l-.5.5h-11l-.5-.5v-9l.5-.5H7.71zM3 5v9h10V6H8l-.7-1H3z"/></svg>`;
        const iconFile = `<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M13.5 4l.5.5v9l-.5.5h-10l-.5-.5v-11l.5-.5h6l.5.5L13.5 4zm-1 0l-3-3H4v10h9V4z"/></svg>`;
        const iconCheckAll = `<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M10.5 3.5l.85.85-4.5 4.5-2.5-2.5.85-.85 1.65 1.65 3.65-3.65z"/><path d="M14.5 3.5l.85.85-4.5 4.5-2.5-2.5.85-.85 1.65 1.65 3.65-3.65z" opacity="0.6"/></svg>`;
        const iconUncheckAll = `<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M3 3h10v10H3V3zm1 1v8h8V4H4z"/></svg>`;

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
                
                /* Inputs */
                select, textarea { 
                    width: 100%; 
                    margin-bottom: 10px; 
                    background: var(--vscode-input-background); 
                    color: var(--vscode-input-foreground); 
                    border: 1px solid var(--vscode-input-border); 
                    padding: 5px; 
                    font-family: inherit;
                }
                select:focus, textarea:focus {
                    outline: 1px solid var(--vscode-focusBorder);
                    border-color: var(--vscode-focusBorder);
                }

                /* Primary Button */
                button.primary-btn { 
                    background: var(--vscode-button-background); 
                    color: var(--vscode-button-foreground); 
                    cursor: pointer; 
                    border: none;
                    padding: 6px 10px;
                    width: 100%;
                }
                button.primary-btn:hover { 
                    background: var(--vscode-button-hoverBackground); 
                }

                /* Toolbar */
                .toolbar {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-top: 15px;
                    margin-bottom: 5px;
                    padding-bottom: 5px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                }
                .toolbar-title {
                    font-size: 11px;
                    font-weight: bold;
                    text-transform: uppercase;
                    opacity: 0.8;
                }
                .toolbar-actions {
                    display: flex;
                    gap: 2px;
                }
                .icon-btn {
                    background: transparent;
                    border: 1px solid transparent;
                    color: var(--vscode-icon-foreground);
                    cursor: pointer;
                    padding: 2px;
                    width: 22px;
                    height: 22px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 3px;
                }
                .icon-btn:hover {
                    background-color: var(--vscode-toolbar-hoverBackground);
                }

                /* Tree */
                .file-list {
                    list-style: none;
                    padding: 0;
                    margin: 0;
                }
                .tree-item {
                    display: flex;
                    align-items: center;
                    padding: 2px 0;
                    cursor: pointer;
                    color: var(--vscode-sideBar-foreground);
                }
                .tree-item:hover {
                    background: var(--vscode-list-hoverBackground);
                    color: var(--vscode-list-hoverForeground);
                }
                
                /* Tree Indentation & Icons */
                .tree-toggle {
                    width: 16px;
                    height: 16px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    margin-right: 2px;
                    color: var(--vscode-icon-foreground);
                }
                .tree-icon {
                    width: 16px;
                    height: 16px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    margin-right: 6px;
                    color: var(--vscode-icon-foreground);
                }
                
                .folder-content {
                    list-style: none;
                    padding-left: 16px; /* Indent children */
                    margin: 0;
                }
                .folder-content.collapsed { display: none; }

                /* Checkbox (Custom VS Code Style) */
                .tree-checkbox {
                    appearance: none;
                    width: 16px;
                    height: 16px;
                    border: 1px solid var(--vscode-checkbox-border);
                    background-color: transparent; /* No background as requested */
                    border-radius: 3px;
                    margin-right: 6px;
                    position: relative;
                    cursor: pointer;
                    flex-shrink: 0;
                }
                .tree-checkbox:checked {
                    background-color: var(--vscode-checkbox-background);
                    border-color: var(--vscode-checkbox-border);
                }
                .tree-checkbox:checked::after {
                    content: '';
                    position: absolute;
                    left: 5px;
                    top: 1px;
                    width: 3px;
                    height: 8px;
                    border: solid var(--vscode-checkbox-foreground);
                    border-width: 0 2px 2px 0;
                    transform: rotate(45deg);
                }
                .tree-checkbox:focus {
                    outline: 1px solid var(--vscode-focusBorder);
                    outline-offset: -1px;
                }

                /* Labels */
                .file-name, .folder-name {
                    flex-grow: 1;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                }
                
                .file-status {
                    margin-left: 6px;
                    font-size: 0.9em;
                    opacity: 0.8;
                }
                .status-M { color: var(--vscode-gitDecoration-modifiedResourceForeground); }
                .status-A { color: var(--vscode-gitDecoration-addedResourceForeground); }
                .status-D { color: var(--vscode-gitDecoration-deletedResourceForeground); }
            </style>
        </head>
        <body>
            <h3>AI Review Helper</h3>
            
            <label>Source Branch</label>
            <select id="sourceBranch"></select>
            
            <label>Target Branch</label>
            <select id="targetBranch"></select>
            
            <button id="loadBtn" class="primary-btn">Load Changes</button>
            
            <hr style="border: 0; border-bottom: 1px solid var(--vscode-panel-border); margin: 15px 0;" />
            
            <label>Prompt Instruction</label>
            <textarea id="instruction" rows="3">Review changes.</textarea>
            
            <div id="fileContainer">
                <div class="toolbar">
                    <span class="toolbar-title">Files (<span id="fileCount">0</span>)</span>
                    <div class="toolbar-actions">
                        <button id="selectAllBtn" class="icon-btn" title="Select All">${iconCheckAll}</button>
                        <button id="deselectAllBtn" class="icon-btn" title="Deselect All">${iconUncheckAll}</button>
                    </div>
                </div>
                <ul class="file-list" id="fileList"></ul>
            </div>
            
            <div style="margin-top: 15px;">
                <button id="copyBtn" class="primary-btn">Copy Prompt</button>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                const sourceSelect = document.getElementById('sourceBranch');
                const targetSelect = document.getElementById('targetBranch');
                const loadBtn = document.getElementById('loadBtn');
                const copyBtn = document.getElementById('copyBtn');
                const selectAllBtn = document.getElementById('selectAllBtn');
                const deselectAllBtn = document.getElementById('deselectAllBtn');
                const fileList = document.getElementById('fileList');
                const instruction = document.getElementById('instruction');
                let currentFiles = [];

                // Icons
                const ICONS = {
                    chevronRight: '${iconChevronRight}',
                    chevronDown: '${iconChevronDown}',
                    folder: '${iconFolder}',
                    file: '${iconFile}'
                };

                // Build tree structure
                function buildFileTree(files) {
                    const root = { children: {} };
                    files.forEach(file => {
                        const parts = file.path.split('/');
                        let current = root;
                        for (let i = 0; i < parts.length; i++) {
                            const part = parts[i];
                            const isFile = i === parts.length - 1;
                            if (isFile) {
                                if (!current.files) current.files = [];
                                current.files.push(file);
                            } else {
                                if (!current.children[part]) {
                                    current.children[part] = { children: {} };
                                }
                                current = current.children[part];
                            }
                        }
                    });
                    return root;
                }

                function createFolderElement(folderName, folderPath, children) {
                    const folderItem = document.createElement('li');
                    const folderHeader = document.createElement('div');
                    folderHeader.className = 'tree-item';

                    // Toggle (Chevron)
                    const toggle = document.createElement('span');
                    toggle.className = 'tree-toggle';
                    toggle.innerHTML = ICONS.chevronDown; // Default expanded
                    toggle.dataset.expanded = 'true';

                    // Checkbox
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.className = 'tree-checkbox';
                    checkbox.checked = true;
                    checkbox.dataset.folderPath = folderPath;

                    // Folder Icon
                    const icon = document.createElement('span');
                    icon.className = 'tree-icon';
                    icon.innerHTML = ICONS.folder;

                    // Folder Name
                    const name = document.createElement('span');
                    name.className = 'folder-name';
                    name.innerText = folderName;

                    folderHeader.appendChild(toggle);
                    folderHeader.appendChild(checkbox);
                    folderHeader.appendChild(icon);
                    folderHeader.appendChild(name);

                    // Content
                    const content = document.createElement('ul');
                    content.className = 'folder-content';
                    content.appendChild(children);

                    folderItem.appendChild(folderHeader);
                    folderItem.appendChild(content);

                    // Event Handlers
                    const toggleFn = (e) => {
                        e.stopPropagation();
                        const expanded = toggle.dataset.expanded === 'true';
                        if (expanded) {
                            content.classList.add('collapsed');
                            toggle.innerHTML = ICONS.chevronRight;
                            toggle.dataset.expanded = 'false';
                        } else {
                            content.classList.remove('collapsed');
                            toggle.innerHTML = ICONS.chevronDown;
                            toggle.dataset.expanded = 'true';
                        }
                    };

                    toggle.onclick = toggleFn;
                    name.onclick = toggleFn;
                    icon.onclick = toggleFn;

                    checkbox.onclick = (e) => {
                        e.stopPropagation();
                        const checked = checkbox.checked;
                        const childCheckboxes = content.querySelectorAll('input[type="checkbox"]');
                        childCheckboxes.forEach(cb => cb.checked = checked);
                    };

                    return folderItem;
                }

                function createFileElement(file) {
                    const li = document.createElement('li');
                    const fileDiv = document.createElement('div');
                    fileDiv.className = 'tree-item';

                    // Indent spacer for files (to align with folder names which have chevron)
                    const spacer = document.createElement('span');
                    spacer.className = 'tree-toggle'; // Re-use class for width
                    
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.className = 'tree-checkbox file-checkbox';
                    checkbox.checked = true;
                    checkbox.dataset.path = file.path;

                    const icon = document.createElement('span');
                    icon.className = 'tree-icon';
                    icon.innerHTML = ICONS.file;

                    const name = document.createElement('span');
                    name.className = 'file-name';
                    name.innerText = file.path.split('/').pop();
                    
                    // Status Decoration
                    const status = document.createElement('span');
                    status.className = 'file-status status-' + file.status;
                    status.innerText = file.status;

                    fileDiv.appendChild(spacer);
                    fileDiv.appendChild(checkbox);
                    fileDiv.appendChild(icon);
                    fileDiv.appendChild(name);
                    fileDiv.appendChild(status);
                    
                    li.appendChild(fileDiv);

                    // Click name to open diff
                    const openDiff = () => vscode.postMessage({
                        type: 'openDiff',
                        value: { file, source: sourceSelect.value, target: targetSelect.value }
                    });
                    name.onclick = openDiff;
                    icon.onclick = openDiff;

                    return li;
                }

                function renderTree(node, path = '') {
                    const fragment = document.createDocumentFragment();

                    // Folders
                    Object.keys(node.children).sort().forEach(folderName => {
                        const folderPath = path ? path + '/' + folderName : folderName;
                        const childNode = node.children[folderName];
                        const childrenFragment = renderTree(childNode, folderPath);
                        fragment.appendChild(createFolderElement(folderName, folderPath, childrenFragment));
                    });

                    // Files
                    if (node.files) {
                        node.files.sort((a, b) => a.path.localeCompare(b.path)).forEach(file => {
                            fragment.appendChild(createFileElement(file));
                        });
                    }

                    return fragment;
                }

                selectAllBtn.addEventListener('click', () => {
                    document.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
                });

                deselectAllBtn.addEventListener('click', () => {
                    document.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
                });

                vscode.postMessage({ type: 'getBranches' });

                loadBtn.addEventListener('click', () => {
                    fileList.innerHTML = '<li style="padding:10px">Loading...</li>';
                    vscode.postMessage({ type: 'getFiles', value: { source: sourceSelect.value, target: targetSelect.value } });
                });

                copyBtn.addEventListener('click', () => {
                    const checkboxes = document.querySelectorAll('.file-checkbox:checked');
                    const selectedPaths = Array.from(checkboxes).map(cb => cb.dataset.path);
                    vscode.postMessage({
                        type: 'copyPrompt',
                        value: {
                            files: currentFiles,
                            selectedPaths: selectedPaths,
                            source: sourceSelect.value,
                            target: targetSelect.value,
                            instruction: instruction.value
                        }
                    });
                });

                window.addEventListener('message', event => {
                    const message = event.data;
                    if (message.type === 'setBranches') {
                        const opts = message.value.map(b => '<option value="'+b+'">'+b+'</option>').join('');
                        sourceSelect.innerHTML = opts;
                        targetSelect.innerHTML = opts;
                        if(message.value.includes('main')) targetSelect.value = 'main';
                        else if(message.value.includes('master')) targetSelect.value = 'master';
                    } else if (message.type === 'setFiles') {
                        currentFiles = message.value;
                        document.getElementById('fileCount').innerText = currentFiles.length;
                        fileList.innerHTML = '';

                        if (currentFiles.length > 0) {
                            const tree = buildFileTree(currentFiles);
                            fileList.appendChild(renderTree(tree));
                        } else {
                            fileList.innerHTML = '<li style="padding:10px">No changes found.</li>';
                        }
                    }
                });
            </script>
        </body>
        </html>`;
    }
}
