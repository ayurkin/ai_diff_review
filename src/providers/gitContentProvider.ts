import * as vscode from 'vscode';
import { GitService } from '../services/gitService';

/**
 * Этот провайдер позволяет открывать файлы из git по URI вида:
 * ai-review://git/path/to/file?ref=branchName
 */
export class GitContentProvider implements vscode.TextDocumentContentProvider {
    // Событие обновления документа (если вдруг ветка обновится)
    onDidChange?: vscode.Event<vscode.Uri> | undefined;

    constructor(private gitService: GitService) {}

    async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
        // Парсим query params: ?ref=branchName
        const query = new URLSearchParams(uri.query);
        const ref = query.get('ref');
        
        if (!ref) {
            return '';
        }

        // uri.path в VSCode extension API обычно начинается с /, git его не всегда любит
        // убираем ведущий слэш если есть
        let fsPath = uri.path;
        if (fsPath.startsWith('/') || fsPath.startsWith('\\')) {
            fsPath = fsPath.substring(1);
        }

        return await this.gitService.getFileContent(ref, fsPath);
    }
}
