import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ChangedFile } from '../types';
import { isMatch } from '../utils/glob';
import { TokenEstimator, formatTokens } from '../utils/tokenEstimator';

export class ProjectTreeProvider implements vscode.TreeDataProvider<ProjectNode> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ProjectNode | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private _onDidUpdateSelection = new vscode.EventEmitter<void>();
    readonly onDidUpdateSelection = this._onDidUpdateSelection.event;

    private changedFilesSet: Set<string> = new Set();
    private checkedFiles: Set<string> = new Set();
    
    private activeIgnorePatterns: string[] = [];
    private tokenEstimator = new TokenEstimator();

    constructor(private workspaceRoot: string) {
        this.loadConfig();
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('aiReview.ignorePatterns')) {
                this.loadConfig();
                this.refresh();
            }
        });
    }

    private loadConfig() {
        const config = vscode.workspace.getConfiguration('aiReview');
        const rawConfig = config.get('ignorePatterns');
        
        let patterns: Record<string, boolean> = {};

        // Backward compatibility
        if (Array.isArray(rawConfig)) {
            rawConfig.forEach((p: string) => { patterns[p] = true; });
        } else if (typeof rawConfig === 'object' && rawConfig !== null) {
            patterns = rawConfig as Record<string, boolean>;
        }

        this.activeIgnorePatterns = Object.entries(patterns)
            .filter(([_, isEnabled]) => isEnabled)
            .map(([pattern]) => pattern);
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    public async setAllChecked(checked: boolean): Promise<void> {
        if (!checked) {
            this.checkedFiles.clear();
            this.refresh();
            return;
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Selecting all project files..."
        }, async () => {
            const files = await this.walkDirectory(this.workspaceRoot);
            for (const file of files) {
                if (!this.changedFilesSet.has(file)) {
                    this.checkedFiles.add(file);
                }
            }
            this.refresh();
            this._onDidUpdateSelection.fire();
        });
    }

    private async walkDirectory(dir: string): Promise<string[]> {
        let results: string[] = [];
        try {
            const list = await fs.promises.readdir(dir, { withFileTypes: true });
            for (const dirent of list) {
                const fullPath = path.join(dir, dirent.name);
                const relativePath = path.relative(this.workspaceRoot, fullPath).replace(/\\/g, '/');
                if (isMatch(relativePath, this.activeIgnorePatterns)) continue;

                if (dirent.isDirectory()) {
                    const subFiles = await this.walkDirectory(fullPath);
                    results = results.concat(subFiles);
                } else {
                    results.push(relativePath);
                }
            }
        } catch (e) {
            // ignore access errors
        }
        return results;
    }

    public updateChangedFiles(files: ChangedFile[]): void {
        this.changedFilesSet = new Set(files.map(f => f.path));
        this.refresh();
    }

    public getCheckedFiles(): string[] {
        return Array.from(this.checkedFiles);
    }

    public async handleCheckboxChanges(items: ReadonlyArray<[ProjectNode, vscode.TreeItemCheckboxState]>): Promise<void> {
        const folderItems: Array<[ProjectFolderNode, vscode.TreeItemCheckboxState]> = [];

        for (const [item, state] of items) {
            if (item instanceof ProjectFileNode && item.checkboxState !== undefined) {
                this.setFileCheckbox(item, state);
            } else if (item instanceof ProjectFolderNode) {
                folderItems.push([item, state]);
            }
        }

        for (const [folder, state] of folderItems) {
            folder.checkboxState = state;
            const files = await this.walkDirectory(folder.fullPath);
            const eligible = files.filter(f => !this.changedFilesSet.has(f));

            if (state === vscode.TreeItemCheckboxState.Checked) {
                eligible.forEach(f => this.checkedFiles.add(f));
            } else {
                eligible.forEach(f => this.checkedFiles.delete(f));
            }
        }

        this.refresh();
        this._onDidUpdateSelection.fire();
    }

    private setFileCheckbox(node: ProjectFileNode, state: vscode.TreeItemCheckboxState): void {
        node.checkboxState = state;
        if (state === vscode.TreeItemCheckboxState.Checked) {
            this.checkedFiles.add(node.relativePath);
        } else {
            this.checkedFiles.delete(node.relativePath);
        }
    }

    getTreeItem(element: ProjectNode): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: ProjectNode): Promise<ProjectNode[]> {
        if (!this.workspaceRoot) {
            return [];
        }

        const folderPath = element ? element.fullPath : this.workspaceRoot;
        
        try {
            const dirents = await fs.promises.readdir(folderPath, { withFileTypes: true });
            
            const nodes: ProjectNode[] = [];

            for (const dirent of dirents) {
                const fullPath = path.join(folderPath, dirent.name);
                const relativePath = path.relative(this.workspaceRoot, fullPath).replace(/\\/g, '/');
                
                if (isMatch(relativePath, this.activeIgnorePatterns)) {
                    continue;
                }
                
                const isChangedFile = this.changedFilesSet.has(relativePath);

                if (dirent.isDirectory()) {                    
                    const [state, tokenCount] = await this.computeFolderMetadata(relativePath);
                    nodes.push(new ProjectFolderNode(
                        dirent.name,
                        fullPath,
                        relativePath,
                        state,
                        tokenCount
                    ));
                } else {
                    const tokenCount = await this.getFileTokenCount(relativePath);
                    let state: vscode.TreeItemCheckboxState | undefined;
                    
                    if (isChangedFile) {
                        state = undefined;
                    } else {
                        state = this.checkedFiles.has(relativePath) 
                            ? vscode.TreeItemCheckboxState.Checked 
                            : vscode.TreeItemCheckboxState.Unchecked;
                    }

                    nodes.push(new ProjectFileNode(
                        dirent.name,
                        fullPath,
                        relativePath,
                        state,
                        isChangedFile,
                        tokenCount
                    ));
                }
            }

            return nodes.sort((a, b) => {
                if (a instanceof ProjectFolderNode && b instanceof ProjectFileNode) return -1;
                if (a instanceof ProjectFileNode && b instanceof ProjectFolderNode) return 1;
                return (a.label as string).localeCompare(b.label as string);
            });

        } catch (e) {
            console.error(`Error reading directory ${folderPath}:`, e);
            return [];
        }
    }

    private async computeFolderMetadata(relativePath: string): Promise<[vscode.TreeItemCheckboxState, number]> {
        const files = await this.walkDirectory(path.join(this.workspaceRoot, relativePath));
        const eligible = files.filter(f => !this.changedFilesSet.has(f));

        if (eligible.length === 0) {
            return [vscode.TreeItemCheckboxState.Unchecked, 0];
        }

        let tokenTotal = 0;
        let checkedCount = 0;

        for (const file of eligible) {
            if (this.checkedFiles.has(file)) {
                checkedCount += 1;
            }
            tokenTotal += await this.getFileTokenCount(file);
        }

        const state = checkedCount === eligible.length
            ? vscode.TreeItemCheckboxState.Checked
            : vscode.TreeItemCheckboxState.Unchecked;

        return [state, tokenTotal];
    }

    private async getFileTokenCount(relativePath: string): Promise<number> {
        const fsPath = path.join(this.workspaceRoot, relativePath);
        return this.tokenEstimator.estimateFromFile(fsPath);
    }

    public async getSelectedTokenTotal(): Promise<number> {
        let total = 0;
        for (const file of this.checkedFiles) {
            total += await this.getFileTokenCount(file);
        }
        return total;
    }
}

export abstract class ProjectNode extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly fullPath: string,
        public readonly relativePath: string,
        collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
    }
}

export class ProjectFolderNode extends ProjectNode {
    constructor(label: string, fullPath: string, relativePath: string, public checkboxState: vscode.TreeItemCheckboxState, public tokenCount: number) {
        super(label, fullPath, relativePath, vscode.TreeItemCollapsibleState.Collapsed);
        this.iconPath = new vscode.ThemeIcon('folder');
        this.description = formatTokens(tokenCount);
    }
}

export class ProjectFileNode extends ProjectNode {
    constructor(
        label: string,
        fullPath: string,
        relativePath: string,
        public checkboxState: vscode.TreeItemCheckboxState | undefined,
        isChangedFile: boolean,
        tokenCount: number
    ) {
        super(label, fullPath, relativePath, vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon('file');
        this.tooltip = relativePath;
        const tokenLabel = formatTokens(tokenCount);
        
        if (isChangedFile) {
            this.description = `(In Changes) · ${tokenLabel}`;
            this.contextValue = 'changedFile';
        } else {
            this.description = tokenLabel;
        }
    }
}
