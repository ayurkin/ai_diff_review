import * as cp from 'child_process';
import * as path from 'path';
import { ChangedFile } from '../types';

export class GitService {
    private workspaceRoot: string;

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
    }

    private async exec(args: string[]): Promise<string> {
        return new Promise((resolve, reject) => {
            cp.exec(
                `git ${args.join(' ')}`,
                { cwd: this.workspaceRoot, maxBuffer: 1024 * 1024 * 10 }, // 10MB buffer
                (err, stdout, stderr) => {
                    if (err) {
                        // Игнорируем ошибки, если git просто вернул non-zero exit code (например при empty diff),
                        // но логируем реальные проблемы.
                        console.warn(`Git command warning: ${stderr}`);
                        // reject(err); // В MVP лучше не реджектить жестко, а возвращать пустую строку или хендлить выше
                    }
                    resolve(stdout.trim());
                }
            );
        });
    }

    public async getBranches(): Promise<string[]> {
        try {
            const output = await this.exec(['branch', '--format="%(refname:short)"']);
            return output.split('\n').map(b => b.trim()).filter(b => b.length > 0);
        } catch (error) {
            console.error('Failed to get branches', error);
            return [];
        }
    }

    public async getChangedFiles(targetBranch: string, sourceBranch: string): Promise<ChangedFile[]> {
        try {
            // --name-status показывает статус (M, A, D) и путь
            const output = await this.exec(['diff', '--name-status', `${targetBranch}...${sourceBranch}`]);
            
            if (!output) return [];

            const files: ChangedFile[] = [];
            const lines = output.split('\n');

            for (const line of lines) {
                const [status, filePath] = line.split(/\t/);
                if (filePath) {
                    files.push({
                        status: status.charAt(0) as any,
                        path: filePath.trim()
                    });
                }
            }
            return files;
        } catch (error) {
            console.error('Failed to get changed files', error);
            return [];
        }
    }

    public async getFileDiff(targetBranch: string, sourceBranch: string, filePath: string): Promise<string> {
        try {
            // unified diff для конкретного файла
            return await this.exec(['diff', `${targetBranch}...${sourceBranch}`, '--', filePath]);
        } catch (error) {
            console.error(`Failed to get diff for ${filePath}`, error);
            return '';
        }
    }

    public async getFileContent(branch: string, filePath: string): Promise<string> {
        try {
            // git show sourceBranch:path/to/file
            // Используем ./ чтобы избежать проблем, если путь начинается с дефиса, хотя для путей это редкость
            return await this.exec(['show', `${branch}:${filePath}`]);
        } catch (error) {
            // Если файл удален или его нет в ветке, git show упадет
            return '';
        }
    }
}
