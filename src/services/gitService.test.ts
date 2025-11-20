import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import { GitService } from './gitService';

// Helper to create a temporary git repository for testing
async function createTestGitRepo(): Promise<string> {
    const tmpDir = path.join(__dirname, '../../.test-tmp-' + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });

    // Initialize git repo
    cp.execSync('git init', { cwd: tmpDir });
    cp.execSync('git config user.email "test@example.com"', { cwd: tmpDir });
    cp.execSync('git config user.name "Test User"', { cwd: tmpDir });

    // Create initial commit
    fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Test Repo\n');
    cp.execSync('git add .', { cwd: tmpDir });
    cp.execSync('git commit -m "Initial commit"', { cwd: tmpDir });

    return tmpDir;
}

// Helper to cleanup test repo
function cleanupTestGitRepo(tmpDir: string) {
    if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
}

describe('GitService', () => {
    let testRepoPath: string;
    let gitService: GitService;

    beforeEach(async () => {
        testRepoPath = await createTestGitRepo();
        gitService = new GitService(testRepoPath);
    });

    afterEach(() => {
        cleanupTestGitRepo(testRepoPath);
    });

    describe('getBranches()', () => {
        it('should return list of branches', async () => {
            const branches = await gitService.getBranches();

            assert.ok(Array.isArray(branches), 'Should return an array');
            assert.ok(branches.length > 0, 'Should have at least one branch');
            assert.ok(branches.includes('master') || branches.includes('main'), 'Should have default branch');
        });

        it('should handle repository with multiple branches', async () => {
            // Create a new branch
            cp.execSync('git checkout -b feature-branch', { cwd: testRepoPath });
            cp.execSync('git checkout -b test-branch', { cwd: testRepoPath });
            cp.execSync('git checkout master', { cwd: testRepoPath });

            const branches = await gitService.getBranches();

            assert.ok(branches.includes('master'), 'Should include master');
            assert.ok(branches.includes('feature-branch'), 'Should include feature-branch');
            assert.ok(branches.includes('test-branch'), 'Should include test-branch');
            assert.strictEqual(branches.length, 3, 'Should have 3 branches');
        });

        it('should handle branches with special characters', async () => {
            cp.execSync('git checkout -b "release/AMP-4582"', { cwd: testRepoPath });
            cp.execSync('git checkout master', { cwd: testRepoPath });

            const branches = await gitService.getBranches();

            assert.ok(branches.includes('release/AMP-4582'), 'Should handle branch names with slashes');
        });
    });

    describe('getChangedFiles()', () => {
        it('should return empty array when no changes', async () => {
            const files = await gitService.getChangedFiles('master', 'master');

            assert.strictEqual(files.length, 0, 'Should have no changes when comparing same branch');
        });

        it('should detect added files', async () => {
            // Create a new branch with a new file
            cp.execSync('git checkout -b feature', { cwd: testRepoPath });
            fs.writeFileSync(path.join(testRepoPath, 'new-file.txt'), 'new content\n');
            cp.execSync('git add new-file.txt', { cwd: testRepoPath });
            cp.execSync('git commit -m "Add new file"', { cwd: testRepoPath });

            const files = await gitService.getChangedFiles('master', 'feature');

            assert.strictEqual(files.length, 1, 'Should have 1 changed file');
            assert.strictEqual(files[0].path, 'new-file.txt', 'Should detect the new file');
            assert.strictEqual(files[0].status, 'A', 'Status should be Added');
        });

        it('should detect modified files', async () => {
            // Modify existing file on a new branch
            cp.execSync('git checkout -b feature', { cwd: testRepoPath });
            fs.writeFileSync(path.join(testRepoPath, 'README.md'), '# Modified\n');
            cp.execSync('git add README.md', { cwd: testRepoPath });
            cp.execSync('git commit -m "Modify README"', { cwd: testRepoPath });

            const files = await gitService.getChangedFiles('master', 'feature');

            assert.strictEqual(files.length, 1, 'Should have 1 changed file');
            assert.strictEqual(files[0].path, 'README.md', 'Should detect the modified file');
            assert.strictEqual(files[0].status, 'M', 'Status should be Modified');
        });

        it('should detect deleted files', async () => {
            // Delete file on a new branch
            cp.execSync('git checkout -b feature', { cwd: testRepoPath });
            fs.unlinkSync(path.join(testRepoPath, 'README.md'));
            cp.execSync('git add README.md', { cwd: testRepoPath });
            cp.execSync('git commit -m "Delete README"', { cwd: testRepoPath });

            const files = await gitService.getChangedFiles('master', 'feature');

            assert.strictEqual(files.length, 1, 'Should have 1 changed file');
            assert.strictEqual(files[0].path, 'README.md', 'Should detect the deleted file');
            assert.strictEqual(files[0].status, 'D', 'Status should be Deleted');
        });

        it('should work with unpushed local branches', async () => {
            // Create a local branch without pushing (simulates user's issue)
            cp.execSync('git checkout -b local-feature', { cwd: testRepoPath });
            fs.writeFileSync(path.join(testRepoPath, 'local.txt'), 'local content\n');
            cp.execSync('git add local.txt', { cwd: testRepoPath });
            cp.execSync('git commit -m "Add local file"', { cwd: testRepoPath });

            const files = await gitService.getChangedFiles('master', 'local-feature');

            assert.ok(files.length > 0, 'Should detect changes in unpushed local branch');
            assert.ok(files.some(f => f.path === 'local.txt'), 'Should include the local file');
        });
    });

    describe('getFileDiff()', () => {
        it('should return diff for modified file', async () => {
            // Create a branch with modifications
            cp.execSync('git checkout -b feature', { cwd: testRepoPath });
            fs.writeFileSync(path.join(testRepoPath, 'README.md'), '# Modified\nWith new line\n');
            cp.execSync('git add README.md', { cwd: testRepoPath });
            cp.execSync('git commit -m "Modify README"', { cwd: testRepoPath });

            const diff = await gitService.getFileDiff('master', 'feature', 'README.md');

            assert.ok(diff.length > 0, 'Should return non-empty diff');
            assert.ok(diff.includes('Modified'), 'Diff should contain new content');
            assert.ok(diff.includes('Test Repo'), 'Diff should contain old content');
        });

        it('should return empty string for unchanged file', async () => {
            const diff = await gitService.getFileDiff('master', 'master', 'README.md');

            assert.strictEqual(diff, '', 'Should return empty string for unchanged file');
        });
    });

    describe('getFileContent()', () => {
        it('should return file content from branch', async () => {
            const content = await gitService.getFileContent('master', 'README.md');

            assert.ok(content.includes('Test Repo'), 'Should return file content');
        });

        it('should return empty string for non-existent file', async () => {
            const content = await gitService.getFileContent('master', 'non-existent.txt');

            assert.strictEqual(content, '', 'Should return empty string for non-existent file');
        });

        it('should return content from specific branch', async () => {
            // Create different content on different branches
            cp.execSync('git checkout -b feature', { cwd: testRepoPath });
            fs.writeFileSync(path.join(testRepoPath, 'README.md'), '# Feature Branch\n');
            cp.execSync('git add README.md', { cwd: testRepoPath });
            cp.execSync('git commit -m "Update on feature"', { cwd: testRepoPath });
            cp.execSync('git checkout master', { cwd: testRepoPath });

            const masterContent = await gitService.getFileContent('master', 'README.md');
            const featureContent = await gitService.getFileContent('feature', 'README.md');

            assert.ok(masterContent.includes('Test Repo'), 'Master should have original content');
            assert.ok(featureContent.includes('Feature Branch'), 'Feature should have updated content');
            assert.notStrictEqual(masterContent, featureContent, 'Content should differ between branches');
        });
    });

    describe('Error Handling', () => {
        it('should handle invalid workspace path', async () => {
            const badService = new GitService('/non/existent/path');

            const branches = await badService.getBranches();
            assert.strictEqual(branches.length, 0, 'Should return empty array for invalid path');
        });
    });
});
