import * as fs from 'fs/promises';

export class TokenEstimator {
    private cache = new Map<string, number>();

    async estimateFromFile(fsPath: string, fallback?: () => Promise<string>): Promise<number> {
        if (this.cache.has(fsPath)) {
            return this.cache.get(fsPath)!;
        }

        let content = '';
        try {
            content = await fs.readFile(fsPath, 'utf8');
        } catch {
            if (fallback) {
                try {
                    content = await fallback();
                } catch {
                    content = '';
                }
            }
        }

        const tokens = this.estimateTokens(content);
        this.cache.set(fsPath, tokens);
        return tokens;
    }

    estimateTokens(text: string): number {
        if (!text) return 0;
        // Rough heuristic: 1 token ~= 4 chars.
        return Math.max(1, Math.ceil(text.length / 4));
    }
}

export function formatTokens(count: number): string {
    if (count >= 1000) {
        const shortened = Math.round((count / 1000) * 10) / 10;
        return `${shortened % 1 === 0 ? shortened.toFixed(0) : shortened}K`;
    }
    return `${count}`;
}
