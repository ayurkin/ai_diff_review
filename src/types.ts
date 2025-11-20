export interface ChangedFile {
    path: string;
    status: 'A' | 'M' | 'D' | 'R' | 'U' | '?'; // Git status codes
}

export interface GitConfig {
    workspaceRoot: string;
}

export interface PromptConfig {
    sourceBranch: string;
    targetBranch: string;
    instruction: string; // Пользовательский промпт
    files: ChangedFile[]; // Отфильтрованный список файлов для ревью (diffs)
    contextFiles?: string[]; // Список дополнительных файлов (только контент)
}
