import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return [r, g, b];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(fgHex: string, bgHex: string): number {
  const l1 = relativeLuminance(hexToRgb(fgHex));
  const l2 = relativeLuminance(hexToRgb(bgHex));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

test('NEXORA foreground/background color tokens satisfy WCAG 2.1 AA >= 4.5:1 contrast', () => {
  const backgrounds = ['#F8F6EF', '#FDFBF6', '#FFFFFF'];
  const textTokens = ['#24231F', '#636159', '#61603B', '#A34E1D'];

  for (const bg of backgrounds) {
    for (const fg of textTokens) {
      const ratio = contrastRatio(fg, bg);
      assert.ok(
        ratio >= 4.5,
        `Contrast ratio for ${fg} on ${bg} is ${ratio.toFixed(2)}:1 (expected >= 4.5:1)`
      );
    }
  }
});

test('all UI components avoid low-contrast #89877F and preserve semantic ARIA & keyboard controls', () => {
  const root = process.cwd();
  const componentsDir = path.join(root, 'src', 'components');
  const files = fs.readdirSync(componentsDir).filter((f) => f.endsWith('.tsx'));
  assert.ok(files.length >= 10, 'Expected component suite in src/components');

  for (const file of files) {
    const content = fs.readFileSync(path.join(componentsDir, file), 'utf8');
    assert.equal(
      /#89877f/i.test(content),
      false,
      `Component ${file} still contains low-contrast #89877F`
    );
  }

  const indexCss = fs.readFileSync(path.join(root, 'src', 'index.css'), 'utf8');
  assert.match(indexCss, /:focus-visible/);
  assert.match(indexCss, /prefers-reduced-motion:\s*reduce/);
  assert.equal(/#89877f/i.test(indexCss), false);

  const sidebar = fs.readFileSync(path.join(componentsDir, 'SidebarShell.tsx'), 'utf8');
  assert.match(sidebar, /href="#main-content"/);
  assert.match(sidebar, /id="main-content"/);
  assert.match(sidebar, /aria-current=/);
  assert.match(sidebar, /aria-expanded=/);
  assert.match(sidebar, /role="dialog"/);
  assert.match(sidebar, /aria-modal="true"/);

  const mentor = fs.readFileSync(path.join(componentsDir, 'AiMentorView.tsx'), 'utf8');
  assert.match(mentor, /role="log"/);
  assert.match(mentor, /aria-live="polite"/);
  assert.match(mentor, /aria-pressed=/);

  const modal = fs.readFileSync(path.join(componentsDir, 'AssessmentModal.tsx'), 'utf8');
  assert.match(modal, /role="dialog"/);
  assert.match(modal, /Escape/);
  assert.match(modal, /role="alert"/);

  const onboarding = fs.readFileSync(path.join(componentsDir, 'OnboardingWizard.tsx'), 'utf8');
  assert.match(onboarding, /role="progressbar"/);
  assert.match(onboarding, /aria-valuenow=/);
});
