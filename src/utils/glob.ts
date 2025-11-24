import { minimatch } from 'minimatch';

/**
 * Determine whether the file path matches any configured ignore pattern.
 * Uses minimatch so that users can supply familiar glob syntax.
 */
export function isMatch(filePath: string, patterns: string[]): boolean {
    const normalizedPath = filePath.replace(/\\/g, '/');

    return patterns.some(rawPattern => {
        const pattern = rawPattern.trim();
        if (!pattern) return false;

        // matchBase=true lets bare filenames like "package-lock.json" match anywhere.
        if (minimatch(normalizedPath, pattern, { matchBase: true, dot: true })) {
            return true;
        }

        // Fallback: treat plain directory names as segment matches (e.g., "out").
        const segments = normalizedPath.split('/');
        return segments.includes(pattern);
    });
}
