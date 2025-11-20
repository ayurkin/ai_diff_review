import * as vscode from 'vscode';
import * as path from 'path';
import { GitService } from '../services/gitService';
import { PromptGenerator } from '../services/promptGenerator';
import { ChangedFile } from '../types';

export class TreeViewProvider implements vscode.TreeDataProvider<TreeNode> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    // Exposed properties for the extension coordinator
    public sourceBranch?: string;
    public targetBranch?: string;
    public instruction: string = 'Review changes.';
    
    private changedFiles: ChangedFile[] = [];
    private checkedFiles = new Map<string, vscode.TreeItemCheckboxState>();

    constructor(
        private gitService: GitService,
        private promptGenerator: PromptGenerator
    ) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    // API for ProjectTreeProvider integration
    public getChangedFiles(): ChangedFile[] {
        return this.changedFiles;
    }

    // API for copyPrompt command
    public getCheckedFiles(): ChangedFile[] {
        return this.changedFiles.filter(f =>
            this.checkedFiles.get(f.path) === vscode.TreeItemCheckboxState.Checked
        );
    }

    async updateConfig(targetBranch?: string, sourceBranch?: string, instruction?: string): Promise<void> {
        let shouldLoadFiles = false;

        if (targetBranch !== undefined && targetBranch !== this.targetBranch) {
            this.targetBranch = targetBranch || undefined;
            shouldLoadFiles = true;
        }

        if (sourceBranch !== undefined && sourceBranch !== this.sourceBranch) {
            this.sourceBranch = sourceBranch || undefined;
            shouldLoadFiles = true;
        }

        if (instruction !== undefined) {
            this.instruction = instruction;
        }

        if (shouldLoadFiles && this.targetBranch && this.sourceBranch) {
            await this.loadFiles();
        } else {
            this.refresh();
        }
    }

    async selectTargetBranch(): Promise<void> {
        try {
            const branches = await this.gitService.getBranches();

            if (branches.length === 0) {
                vscode.window.showWarningMessage('No git branches found. Make sure you have committed at least once.');
                return;
            }

            const targetBranch = await vscode.window.showQuickPick(branches, {
                placeHolder: 'Select target branch (base)',
                title: 'Target Branch'
            });

            if (!targetBranch) return;

            this.targetBranch = targetBranch;
            this.refresh();

            if (this.sourceBranch) {
                await this.loadFiles();
            }
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to get branches: ${error.message || error}`);
        }
    }

    async selectSourceBranch(): Promise<void> {
        try {
            const branches = await this.gitService.getBranches();

            if (branches.length === 0) {
                vscode.window.showWarningMessage('No git branches found.');
                return;
            }

            const sourceBranch = await vscode.window.showQuickPick(branches, {
                placeHolder: 'Select source branch (compare)',
                title: 'Source Branch'
            });

            if (!sourceBranch) return;

            this.sourceBranch = sourceBranch;
            this.refresh();

            if (this.targetBranch) {
                await this.loadFiles();
            }
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to get branches: ${error.message || error}`);
        }
    }

    async selectBranches(): Promise<void> {
        await this.selectTargetBranch();
        if (this.targetBranch) {
            await this.selectSourceBranch();
        }
    }

    async loadFiles(): Promise<void> {
        if (!this.sourceBranch || !this.targetBranch) {
            vscode.window.showWarningMessage('Please select branches first');
            return;
        }

        this.changedFiles = await this.gitService.getChangedFiles(this.targetBranch, this.sourceBranch);

        // Check all files by default
        this.checkedFiles.clear();
        for (const file of this.changedFiles) {
            this.checkedFiles.set(file.path, vscode.TreeItemCheckboxState.Checked);
        }

        this.refresh();

        if (this.changedFiles.length === 0) {
            vscode.window.showInformationMessage('No changes found between branches');
        }
    }

    async setInstruction(): Promise<void> {
        const instruction = await vscode.window.showInputBox({
            prompt: 'Enter review instruction',
            value: this.instruction,
            placeHolder: 'Review changes.'
        });

        if (instruction !== undefined) {
            this.instruction = instruction;
            this.refresh();
        }
    }

    getTreeItem(element: TreeNode): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: TreeNode): Promise<TreeNode[]> {
        if (!element) {
            if (this.sourceBranch && this.targetBranch && this.changedFiles.length > 0) {
                return this.buildFileTree();
            }
            return [];
        }

        if (element instanceof FolderNode) {
            return element.children;
        }

        return [];
    }

    private buildFileTree(): TreeNode[] {
        const rootNodes: Map<string, FolderNode> = new Map();
        const fileNodes: FileNode[] = [];

        for (const file of this.changedFiles) {
            const parts = file.path.split('/');

            if (parts.length === 1) {
                const checkboxState = this.checkedFiles.get(file.path) ?? vscode.TreeItemCheckboxState.Unchecked;
                fileNodes.push(new FileNode(file, this.sourceBranch!, this.targetBranch!, checkboxState));
            } else {
                const topLevelFolder = parts[0];
                if (!rootNodes.has(topLevelFolder)) {
                    rootNodes.set(topLevelFolder, new FolderNode(topLevelFolder, []));
                }
                const folderNode = rootNodes.get(topLevelFolder)!;
                this.addFileToFolder(folderNode, parts.slice(1), file, parts[0]);
            }
        }

        // Update folder states based on children
        for (const folder of rootNodes.values()) {
            this.updateFolderCheckboxState(folder);
        }

        // Sort - Explicitly cast label to string to satisfy TypeScript
        return [
            ...Array.from(rootNodes.values()).sort((a, b) => (a.label as string).localeCompare(b.label as string)),
            ...fileNodes.sort((a, b) => (a.label as string).localeCompare(b.label as string))
        ];
    }

    private addFileToFolder(folderNode: FolderNode, pathParts: string[], file: ChangedFile, fullFolderPath: string): void {
        if (pathParts.length === 1) {
            const checkboxState = this.checkedFiles.get(file.path) ?? vscode.TreeItemCheckboxState.Unchecked;
            folderNode.children.push(new FileNode(file, this.sourceBranch!, this.targetBranch!, checkboxState));
        } else {
            const nextFolder = pathParts[0];
            const nextFolderPath = fullFolderPath + '/' + nextFolder;

            let childFolder = folderNode.children.find(
                child => child instanceof FolderNode && child.label === nextFolder
            ) as FolderNode | undefined;

            if (!childFolder) {
                childFolder = new FolderNode(nextFolder, []);
                folderNode.children.push(childFolder);
            }

            this.addFileToFolder(childFolder, pathParts.slice(1), file, nextFolderPath);
        }
    }

    private updateFolderCheckboxState(folder: FolderNode): void {
        let allChecked = true;
        let noneChecked = true;

        for (const child of folder.children) {
            if (child instanceof FolderNode) {
                this.updateFolderCheckboxState(child);
            }
            if (child.checkboxState === vscode.TreeItemCheckboxState.Checked) {
                noneChecked = false;
            } else {
                allChecked = false;
            }
        }

        if (allChecked && folder.children.length > 0) {
            folder.checkboxState = vscode.TreeItemCheckboxState.Checked;
        } else if (noneChecked) {
            folder.checkboxState = vscode.TreeItemCheckboxState.Unchecked;
        } else {
            folder.checkboxState = vscode.TreeItemCheckboxState.Unchecked; 
        }
    }

    async handleCheckboxChange(node: TreeNode, state: vscode.TreeItemCheckboxState): Promise<void> {
        node.checkboxState = state;
        if (node instanceof FileNode) {
            this.checkedFiles.set(node.file.path, state);
        } else if (node instanceof FolderNode) {
            this.updateFolderChildren(node, state);
        }
        this.refresh();
    }

    private updateFolderChildren(folder: FolderNode, state: vscode.TreeItemCheckboxState): void {
        for (const child of folder.children) {
            child.checkboxState = state;
            if (child instanceof FileNode) {
                this.checkedFiles.set(child.file.path, state);
            } else if (child instanceof FolderNode) {
                this.updateFolderChildren(child, state);
            }
        }
    }
}

abstract class TreeNode extends vscode.TreeItem {
    abstract checkboxState: vscode.TreeItemCheckboxState;
}

class FolderNode extends TreeNode {
    checkboxState: vscode.TreeItemCheckboxState;
    constructor(public readonly label: string, public children: TreeNode[]) {
        super(label, vscode.TreeItemCollapsibleState.Expanded);
        this.iconPath = new vscode.ThemeIcon('folder');
        this.checkboxState = vscode.TreeItemCheckboxState.Unchecked;
    }
}

class FileNode extends TreeNode {
    checkboxState: vscode.TreeItemCheckboxState;
    constructor(
        public readonly file: ChangedFile,
        sourceBranch: string,
        targetBranch: string,
        checkboxState: vscode.TreeItemCheckboxState
    ) {
        super(path.basename(file.path), vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon('file');
        this.checkboxState = checkboxState;
        this.description = this.getStatusLabel(file.status);
        this.tooltip = file.path;
        this.command = {
            command: 'aiReview.openDiff',
            title: 'Open Diff',
            arguments: [file, sourceBranch, targetBranch]
        };
    }

    private getStatusLabel(status: string): string {
        switch (status) {
            case 'M': return 'Modified';
            case 'A': return 'Added';
            case 'D': return 'Deleted';
            default: return status;
        }
    }
}
