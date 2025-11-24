import * as assert from 'assert';
import { isMatch } from './glob';

describe('glob isMatch', () => {
    it('matches filenames anywhere in path', () => {
        assert.ok(isMatch('app/package-lock.json', ['package-lock.json']));
        assert.ok(!isMatch('app/package.json', ['package-lock.json']));
    });

    it('respects wildcard extensions', () => {
        assert.ok(isMatch('src/main.pb.ts', ['*.pb.ts']));
        assert.ok(!isMatch('src/main.ts', ['*.pb.ts']));
    });

    it('matches directory segments', () => {
        assert.ok(isMatch('out/main.js', ['out']));
        assert.ok(isMatch('a/b/out/main.js', ['out']));
        assert.ok(!isMatch('output/main.js', ['out']));
    });

    it('supports glob patterns', () => {
        assert.ok(isMatch('foo/bar/baz.js', ['**/bar/**']));
        assert.ok(!isMatch('foo/baz/bar.js', ['**/bar/**/qux.ts']));
    });
});
