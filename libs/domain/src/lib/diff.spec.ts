import { parseUnifiedDiff } from './diff.js';

const patch = `diff --git a/src/a.ts b/src/a.ts
index 1..2 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,2 +1,3 @@
 const a = 1;
-const b = 2;
+const b = 3;
+const c = 4;
diff --git a/README.md b/README.md
--- a/README.md
+++ b/README.md
@@ -1 +1 @@
-old
+new
`;

describe('parseUnifiedDiff', () => {
  it('lists the files and counts added and removed lines, ignoring headers', () => {
    const diff = parseUnifiedDiff(patch);
    expect(diff.files).toEqual(['src/a.ts', 'README.md']);
    expect(diff.changedLines).toBe(5);
    expect(diff.patch).toBe(patch);
  });
});
