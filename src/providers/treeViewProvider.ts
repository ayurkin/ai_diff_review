import * as vscode from 'vscode';
import * as path from 'path';
import { GitService } from '../services/gitService';
import { PromptGenerator } from '../services/promptGenerator';
import { ChangedFile } from '../types';

export class TreeViewProvider implements vscode.TreeDataProvider<TreeNode> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private sourceBranch?: string;
    private targetBranch?: string;
    private changedFiles: ChangedFile[] = [];
    private checkedFiles = new Map<string, vscode.TreeItemCheckboxState>();
    private instruction: string = 'Review changes.';

    constructor(
        private gitService: GitService,
        private promptGenerator: PromptGenerator
    ) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    async selectBranches(): Promise<void> {
        const branches = await this.gitService.getBranches();

        if (branches.length === 0) {
            vscode.window.showWarningMessage('No git branches found');
            return;
        }

        // Select target branch (base branch)
        const targetBranch = await vscode.window.showQuickPick(branches, {
            placeHolder: 'Select target branch (base)',
            title: 'Target Branch'
        });

        if (!targetBranch) return;

        // Select source branch (comparison branch)
        const sourceBranch = await vscode.window.showQuickPick(branches, {
            placeHolder: 'Select source branch (compare)',
            title: 'Source Branch'
        });

        if (!sourceBranch) return;

        this.targetBranch = targetBranch;
        this.sourceBranch = sourceBranch;

        await this.loadFiles();
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

    async copyPrompt(): Promise<void> {
        if (!this.sourceBranch || !this.targetBranch) {
            vscode.window.showWarningMessage('Please select branches first');
            return;
        }

        const selectedFiles = this.changedFiles.filter(f =>
            this.checkedFiles.get(f.path) === vscode.TreeItemCheckboxState.Checked
        );

        if (selectedFiles.length === 0) {
            vscode.window.showWarningMessage('No files selected for review');
            return;
        }

        try {
            const prompt = await this.promptGenerator.generate({
                files: selectedFiles,
                sourceBranch: this.sourceBranch,
                targetBranch: this.targetBranch,
                instruction: this.instruction
            });

            await vscode.env.clipboard.writeText(prompt);
            vscode.window.showInformationMessage(`Prompt copied! (${selectedFiles.length} files)`);
        } catch (e: any) {
            vscode.window.showErrorMessage('Error: ' + e.message);
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
        }
    }

    getTreeItem(element: TreeNode): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: TreeNode): Promise<TreeNode[]> {
        if (!this.sourceBranch || !this.targetBranch || this.changedFiles.length === 0) {
            return [];
        }

        if (!element) {
            // Root level - build tree structure from files
            return this.buildFileTree();
        }

        if (element instanceof FolderNode) {
            // Return children of a folder
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
                // File at root level
                const checkboxState = this.checkedFiles.get(file.path) ?? vscode.TreeItemCheckboxState.Unchecked;
                fileNodes.push(new FileNode(file, this.sourceBranch!, this.targetBranch!, checkboxState));
            } else {
                // File in a folder
                const topLevelFolder = parts[0];

                if (!rootNodes.has(topLevelFolder)) {
                    rootNodes.set(topLevelFolder, new FolderNode(topLevelFolder, []));
                }

                const folderNode = rootNodes.get(topLevelFolder)!;
                this.addFileToFolder(folderNode, parts.slice(1), file, parts[0]);
            }
        }

        // Update folder checkbox states
        for (const folder of rootNodes.values()) {
            this.updateFolderCheckboxState(folder);
        }

        // Combine and sort: folders first, then files
        const result: TreeNode[] = [
            ...Array.from(rootNodes.values()).sort((a, b) => {
                const labelA = a.label && typeof a.label === 'string' ? a.label : '';
                const labelB = b.label && typeof b.label === 'string' ? b.label : '';
                return labelA.localeCompare(labelB);
            }),
            ...fileNodes.sort((a, b) => {
                const labelA = a.label && typeof a.label === 'string' ? a.label : '';
                const labelB = b.label && typeof b.label === 'string' ? b.label : '';
                return labelA.localeCompare(labelB);
            })
        ];

        return result;
    }

    private addFileToFolder(folderNode: FolderNode, pathParts: string[], file: ChangedFile, fullFolderPath: string): void {
        if (pathParts.length === 1) {
            // This is the file - add it to this folder
            const checkboxState = this.checkedFiles.get(file.path) ?? vscode.TreeItemCheckboxState.Unchecked;
            folderNode.children.push(new FileNode(file, this.sourceBranch!, this.targetBranch!, checkboxState));
        } else {
            // Navigate deeper into folder structure
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
            // Update the file's checkbox state
            this.checkedFiles.set(node.file.path, state);
        } else if (node instanceof FolderNode) {
            // Update all children recursively
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

    getBranchInfo(): string {
        if (!this.sourceBranch || !this.targetBranch) {
            return 'No branches selected';
        }
        return `${this.targetBranch} ← ${this.sourceBranch}`;
    }
}

// Base class for tree nodes
abstract class TreeNode extends vscode.TreeItem {
    abstract checkboxState: vscode.TreeItemCheckboxState;
}

// Folder node in the tree
class FolderNode extends TreeNode {
    checkboxState: vscode.TreeItemCheckboxState;

    constructor(
        public readonly label: string,
        public children: TreeNode[]
    ) {
        super(label, vscode.TreeItemCollapsibleState.Expanded);
        this.iconPath = new vscode.ThemeIcon('folder');
        this.checkboxState = vscode.TreeItemCheckboxState.Unchecked;
    }
}

// File node in the tree
class FileNode extends TreeNode {
    checkboxState: vscode.TreeItemCheckboxState;

    constructor(
        public readonly file: ChangedFile,
        private sourceBranch: string,
        private targetBranch: string,
        checkboxState: vscode.TreeItemCheckboxState
    ) {
        super(path.basename(file.path), vscode.TreeItemCollapsibleState.None);

        this.iconPath = new vscode.ThemeIcon('file');
        this.checkboxState = checkboxState;
        this.description = this.getStatusLabel(file.status);
        this.tooltip = file.path;

        // Command to open diff when clicked
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
