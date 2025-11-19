import { GitService } from './gitService';
import { PromptConfig } from '../types';

export class PromptGenerator {
    private gitService: GitService;

    constructor(gitService: GitService) {
        this.gitService = gitService;
    }

    public async generate(config: PromptConfig): Promise<string> {
        const { files, sourceBranch, targetBranch, instruction } = config;

        // 1. Генерация структуры директорий
        const dirStructure = this.generateDirectoryStructure(files.map(f => f.path));

        // 2. Сборка контента файлов
        let filesXmlContent = '';

        for (const file of files) {
            // Пропускаем удаленные файлы для полного контента, но дифф можно показать
            const isDeleted = file.status === 'D';

            const diff = await this.gitService.getFileDiff(targetBranch, sourceBranch, file.path);
            
            // Если файл удален, контента в source ветке нет. 
            // Если добавлен, контент есть.
            // Если изменен, контент есть.
            let content = '';
            if (!isDeleted) {
                content = await this.gitService.getFileContent(sourceBranch, file.path);
            }

            filesXmlContent += `
<file path="${file.path}" status="${file.status}">
<diff>
${this.escapeXml(diff)}
</diff>
${!isDeleted ? `<content_source_branch>\n${this.escapeXml(content)}\n</content_source_branch>` : ''}
</file>
`;
        }

        // 3. Сборка итогового промпта
        return `
<instructions>
${instruction}
</instructions>

<context>
    <branches>
        <source>${sourceBranch}</source>
        <target>${targetBranch}</target>
    </branches>
    <directory_structure>
${dirStructure}
    </directory_structure>
</context>

<files>
${filesXmlContent}
</files>
`.trim();
    }

    private generateDirectoryStructure(paths: string[]): string {
        // Простая визуализация дерева. 
        // Для MVP можно просто вывести список путей, но дерево лучше для понимания контекста.
        // Тут упрощенная версия - просто отсортированный список с отступами эмулировать сложно без построения дерева.
        // Для надежности пока вернем просто список, чтобы не загромождать код, 
        // но в идеале тут алгоритм построения ASCII tree.
        return paths.sort().map(p => `    ${p}`).join('\n');
    }

    private escapeXml(unsafe: string): string {
        // Базовая защита, чтобы не сломать XML структуру, если в коде есть теги
        // Можно использовать CDATA, но LLM иногда путаются в CDATA внутри Markdown блоков.
        // Простая замена символов надежнее.
        return unsafe
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }
}
