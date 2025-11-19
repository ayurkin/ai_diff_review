import * as vscode from 'vscode';
import { GitService } from './services/gitService';
import { PromptGenerator } from './services/promptGenerator';
import { SidebarProvider } from './providers/sidebarProvider';
import { GitContentProvider } from './providers/gitContentProvider';

export function activate(context: vscode.ExtensionContext) {
    console.log('AI Review: STARTING ACTIVATION (Explorer Mode)');

    // 1. Команда для принудительного фокуса (помогает, если панель не прогрузилась)
    context.subscriptions.push(
        vscode.commands.registerCommand('aiReview.focus', () => {
            vscode.commands.executeCommand('aiReview.view.focus');
        })
    );

    const workspaceRoot = (vscode.workspace.workspaceFolders && (vscode.workspace.workspaceFolders.length > 0))
        ? vscode.workspace.workspaceFolders[0].uri.fsPath
        : '';

    console.log(`AI Review: Workspace root: ${workspaceRoot}`);

    const gitService = new GitService(workspaceRoot);
    const promptGenerator = new PromptGenerator(gitService);

    const viewId = 'aiReview.view'; 
    
    const sidebarProvider = new SidebarProvider(context.extensionUri, gitService, promptGenerator);
    
    // 2. Регистрируем провайдер
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(viewId, sidebarProvider, {
            webviewOptions: {
                retainContextWhenHidden: true
            }
        })
    );
    console.log(`AI Review: Registered provider for: ${viewId}`);

    const gitContentProvider = new GitContentProvider(gitService);
    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider('ai-review', gitContentProvider)
    );
}

export function deactivate() {}
