import { GitService } from './gitService';
import { PromptConfig } from '../types';

export class PromptGenerator {
    private gitService: GitService;

    constructor(gitService: GitService) {
        this.gitService = gitService;
    }

    public async generate(config: PromptConfig): Promise<string> {
        const { files, sourceBranch, targetBranch, instruction, contextFiles } = config;

        // 1. Генерация структуры директорий (включаем и измененные, и контекстные файлы)
        const allPaths = [...files.map(f => f.path), ...(contextFiles || [])];
        const uniquePaths = Array.from(new Set(allPaths));
        const dirStructure = this.generateDirectoryStructure(uniquePaths);

        // 2. Сборка контента измененных файлов (Diff + Content)
        let filesXmlContent = '';

        for (const file of files) {
            const isDeleted = file.status === 'D';
            const diff = await this.gitService.getFileDiff(targetBranch, sourceBranch, file.path);
            
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

        // 3. Сборка контента контекстных файлов (Только Content)
        let contextXmlContent = '';
        if (contextFiles && contextFiles.length > 0) {
            contextXmlContent = '<supplementary_files>\n';
            for (const path of contextFiles) {
                // Берем контент из sourceBranch, так как ревьюим его состояние
                const content = await this.gitService.getFileContent(sourceBranch, path);
                if (content) {
                    contextXmlContent += `
<file path="${path}">
<content>
${this.escapeXml(content)}
</content>
</file>
`;
                }
            }
            contextXmlContent += '</supplementary_files>';
        }

        // 4. Сборка итогового промпта
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
    ${contextXmlContent}
</context>

<files>
${filesXmlContent}
</files>
`.trim();
    }

    private generateDirectoryStructure(paths: string[]): string {
        return paths.sort().map(p => `    ${p}`).join('\n');
    }

    private escapeXml(unsafe: string): string {
        return unsafe
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }
}
