import * as vscode from 'vscode';
import { GitService } from './services/gitService';
import { PromptGenerator } from './services/promptGenerator';
import { TreeViewProvider } from './providers/treeViewProvider';
import { ProjectTreeProvider, ProjectFileNode } from './providers/projectTreeProvider';
import { ConfigViewProvider } from './providers/configViewProvider';
import { GitContentProvider } from './providers/gitContentProvider';
import { ChangedFile } from './types';

export function activate(context: vscode.ExtensionContext) {
    console.log('AI Review: STARTING ACTIVATION');

    const workspaceRoot = (vscode.workspace.workspaceFolders && (vscode.workspace.workspaceFolders.length > 0))
        ? vscode.workspace.workspaceFolders[0].uri.fsPath
        : '';

    console.log(`AI Review: Workspace root: ${workspaceRoot}`);

    if (!workspaceRoot) {
        vscode.window.showErrorMessage('AI Review: No workspace folder open. Please open a folder to use this extension.');
        return;
    }

    const gitService = new GitService(workspaceRoot);
    const promptGenerator = new PromptGenerator(gitService);
    
    const treeViewProvider = new TreeViewProvider(gitService, promptGenerator);
    const projectTreeProvider = new ProjectTreeProvider(workspaceRoot);
    const configViewProvider = new ConfigViewProvider(context.extensionUri, gitService);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            ConfigViewProvider.viewType,
            configViewProvider,
            { webviewOptions: { retainContextWhenHidden: true } }
        )
    );

    const treeView = vscode.window.createTreeView('aiReview.view', {
        treeDataProvider: treeViewProvider,
        showCollapseAll: true,
        canSelectMany: false
    });
    context.subscriptions.push(treeView);

    const projectTreeView = vscode.window.createTreeView('aiReview.contextView', {
        treeDataProvider: projectTreeProvider,
        showCollapseAll: true,
        canSelectMany: false
    });
    context.subscriptions.push(projectTreeView);

    context.subscriptions.push(
        configViewProvider.onDidChangeConfig(async (config) => {
            await treeViewProvider.updateConfig(
                config.targetBranch,
                config.sourceBranch,
                config.instruction
            );
        })
    );

    context.subscriptions.push(
        treeViewProvider.onDidChangeTreeData(() => {
            const changedFiles = treeViewProvider.getChangedFiles();
            projectTreeProvider.updateChangedFiles(changedFiles);
        })
    );

    if (treeView.onDidChangeCheckboxState) {
        context.subscriptions.push(
            treeView.onDidChangeCheckboxState(async (e) => {
                for (const [item, state] of e.items) {
                    if ('checkboxState' in item) {
                        await treeViewProvider.handleCheckboxChange(item as any, state);
                    }
                }
            })
        );
    }

    if (projectTreeView.onDidChangeCheckboxState) {
        context.subscriptions.push(
            projectTreeView.onDidChangeCheckboxState(async (e) => {
                for (const [item, state] of e.items) {
                     if (item instanceof ProjectFileNode) {
                        projectTreeProvider.toggleFile(item);
                     }
                }
            })
        );
    }

    // --- Commands ---

    context.subscriptions.push(
        vscode.commands.registerCommand('aiReview.selectBranches', async () => {
            await treeViewProvider.selectBranches();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('aiReview.selectTargetBranch', async () => {
            await treeViewProvider.selectTargetBranch();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('aiReview.selectSourceBranch', async () => {
            await treeViewProvider.selectSourceBranch();
        })
    );

    // NEW COMMANDS: Select/Deselect All
    context.subscriptions.push(
        vscode.commands.registerCommand('aiReview.changed.selectAll', () => {
            treeViewProvider.setAllChecked(true);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('aiReview.changed.deselectAll', () => {
            treeViewProvider.setAllChecked(false);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('aiReview.context.selectAll', async () => {
            await projectTreeProvider.setAllChecked(true);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('aiReview.context.deselectAll', async () => {
            await projectTreeProvider.setAllChecked(false);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('aiReview.copyPrompt', async () => {
            if (!treeViewProvider.sourceBranch || !treeViewProvider.targetBranch) {
                vscode.window.showWarningMessage('Please select branches first');
                return;
            }

            const changedFiles = treeViewProvider.getCheckedFiles();
            const contextFiles = projectTreeProvider.getCheckedFiles();

            if (changedFiles.length === 0 && contextFiles.length === 0) {
                vscode.window.showWarningMessage('No files selected for review');
                return;
            }

            try {
                const prompt = await promptGenerator.generate({
                    files: changedFiles,
                    contextFiles: contextFiles,
                    sourceBranch: treeViewProvider.sourceBranch,
                    targetBranch: treeViewProvider.targetBranch,
                    instruction: treeViewProvider.instruction
                });

                await vscode.env.clipboard.writeText(prompt);
                vscode.window.showInformationMessage(`Prompt copied! (${changedFiles.length} changes, ${contextFiles.length} context files)`);
            } catch (e: any) {
                vscode.window.showErrorMessage('Error generating prompt: ' + e.message);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('aiReview.setInstruction', async () => {
            await treeViewProvider.setInstruction();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('aiReview.refresh', () => {
            treeViewProvider.refresh();
            projectTreeProvider.refresh();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('aiReview.openDiff', async (file: ChangedFile, source: string, target: string) => {
            const leftUri = vscode.Uri.parse(`ai-review://git/${file.path}?ref=${target}`);
            const rightUri = vscode.Uri.parse(`ai-review://git/${file.path}?ref=${source}`);
            const title = `${file.path} (${target} ↔ ${source})`;
            await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('aiReview.focus', () => {
            vscode.commands.executeCommand('aiReview.view.focus');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('aiReview.openSettings', () => {
            vscode.commands.executeCommand('workbench.action.openSettings', 'aiReview.ignorePatterns');
        })
    );

    const gitContentProvider = new GitContentProvider(gitService);
    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider('ai-review', gitContentProvider)
    );

    console.log('AI Review: Activation complete');
}

export function deactivate() {}
