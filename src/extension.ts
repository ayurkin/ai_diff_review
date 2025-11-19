import * as vscode from 'vscode';
import { GitService } from './services/gitService';
import { PromptGenerator } from './services/promptGenerator';
import { TreeViewProvider } from './providers/treeViewProvider';
import { GitContentProvider } from './providers/gitContentProvider';
import { ChangedFile } from './types';

export function activate(context: vscode.ExtensionContext) {
    console.log('AI Review: STARTING ACTIVATION');

    const workspaceRoot = (vscode.workspace.workspaceFolders && (vscode.workspace.workspaceFolders.length > 0))
        ? vscode.workspace.workspaceFolders[0].uri.fsPath
        : '';

    console.log(`AI Review: Workspace root: ${workspaceRoot}`);

    const gitService = new GitService(workspaceRoot);
    const promptGenerator = new PromptGenerator(gitService);
    const treeViewProvider = new TreeViewProvider(gitService, promptGenerator);

    // Create tree view
    const treeView = vscode.window.createTreeView('aiReview.view', {
        treeDataProvider: treeViewProvider,
        showCollapseAll: true,
        canSelectMany: false
    });

    context.subscriptions.push(treeView);

    // Handle checkbox state changes
    if (treeView.onDidChangeCheckboxState) {
        context.subscriptions.push(
            treeView.onDidChangeCheckboxState(async (e) => {
                for (const [item, state] of e.items) {
                    await treeViewProvider.handleCheckboxChange(item, state);
                }
            })
        );
    }

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('aiReview.selectBranches', async () => {
            await treeViewProvider.selectBranches();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('aiReview.copyPrompt', async () => {
            await treeViewProvider.copyPrompt();
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

    // Register git content provider for diff viewing
    const gitContentProvider = new GitContentProvider(gitService);
    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider('ai-review', gitContentProvider)
    );

    console.log('AI Review: Activation complete');
}

export function deactivate() {}
