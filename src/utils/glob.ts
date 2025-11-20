/**
 * Simple glob matcher.
 * Supports:
 * - Exact matches: "node_modules"
 * - Extension matches: "*.js"
 * - Ends with: "lock"
 */
export function isMatch(filePath: string, patterns: string[]): boolean {
    return patterns.some(pattern => {
        // Handle wildcard extensions (e.g. *.log)
        if (pattern.startsWith('*.')) {
            const ext = pattern.slice(1); // .log
            return filePath.endsWith(ext);
        }
        
        // Handle directory/path matches
        return filePath.includes(pattern) || filePath === pattern;
    });
}
