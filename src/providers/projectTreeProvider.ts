import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ChangedFile } from '../types';

export class ProjectTreeProvider implements vscode.TreeDataProvider<ProjectNode> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ProjectNode | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private changedFilesSet: Set<string> = new Set();
    private checkedFiles: Set<string> = new Set();
    
    // Custom ignore list
    private readonly ignoreList = [
        '.git',
        'node_modules',
        'out',
        'dist',
        'build',
        '.vscode',
        '.idea',
        '.DS_Store',
        'coverage'
    ];

    constructor(private workspaceRoot: string) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    /**
     * Update the list of changed files to know which items to disable
     */
    public updateChangedFiles(files: ChangedFile[]): void {
        this.changedFilesSet = new Set(files.map(f => f.path));
        this.refresh();
    }

    /**
     * Returns the list of files selected by the user in this tree
     */
    public getCheckedFiles(): string[] {
        return Array.from(this.checkedFiles);
    }

    /**
     * Handle checkbox toggle
     */
    public toggleFile(node: ProjectNode): void {
        if (this.checkedFiles.has(node.relativePath)) {
            this.checkedFiles.delete(node.relativePath);
            node.checkboxState = vscode.TreeItemCheckboxState.Unchecked;
        } else {
            this.checkedFiles.add(node.relativePath);
            node.checkboxState = vscode.TreeItemCheckboxState.Checked;
        }
        this.refresh();
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
                if (this.ignoreList.includes(dirent.name)) {
                    continue;
                }

                const fullPath = path.join(folderPath, dirent.name);
                const relativePath = path.relative(this.workspaceRoot, fullPath).replace(/\\/g, '/');
                
                // Check if this file is in the changed files list (Tree 1)
                const isChangedFile = this.changedFilesSet.has(relativePath);

                if (dirent.isDirectory()) {
                    nodes.push(new ProjectFolderNode(
                        dirent.name,
                        fullPath,
                        relativePath
                    ));
                } else {
                    // If it's a changed file, we disable selection by NOT adding a checkboxState
                    // and giving it a specific description
                    let state: vscode.TreeItemCheckboxState | undefined;
                    
                    if (isChangedFile) {
                        state = undefined; // No checkbox
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
                        isChangedFile
                    ));
                }
            }

            // Sort folders first, then files
            return nodes.sort((a, b) => {
                if (a instanceof ProjectFolderNode && b instanceof ProjectFileNode) return -1;
                if (a instanceof ProjectFileNode && b instanceof ProjectFolderNode) return 1;
                return a.label!.toString().localeCompare(b.label!.toString());
            });

        } catch (e) {
            console.error(`Error reading directory ${folderPath}:`, e);
            return [];
        }
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
    constructor(label: string, fullPath: string, relativePath: string) {
        super(label, fullPath, relativePath, vscode.TreeItemCollapsibleState.Collapsed);
        this.iconPath = new vscode.ThemeIcon('folder');
    }
}

export class ProjectFileNode extends ProjectNode {
    constructor(
        label: string,
        fullPath: string,
        relativePath: string,
        public checkboxState: vscode.TreeItemCheckboxState | undefined, // Undefined = no checkbox
        isChangedFile: boolean
    ) {
        super(label, fullPath, relativePath, vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon('file');
        this.tooltip = relativePath;
        
        if (isChangedFile) {
            this.description = '(In Changes)';
            this.contextValue = 'changedFile';
            // We intentionally don't set a command here to disable interaction
        }
    }
}
