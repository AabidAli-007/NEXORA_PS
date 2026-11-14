/**
 * Validates public GitHub repository URLs and blocks private/internal SSRF targets.
 */
export interface ParsedGitHubRepo {
  valid: boolean;
  owner?: string;
  repo?: string;
  canonicalUrl?: string;
  error?: string;
}

const PRIVATE_IP_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\.0\.0\.0$/,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^::1$/,
  /^::ffff:/i,
  /^\[?::ffff:/i,
  /^fc00:/i,
  /^fe80:/i,
  /^(0x[0-9a-f]+|\d+|0[0-7]+)$/i,
  /\.internal$/i,
  /\.local$/i,
];

export function validateGitHubRepoUrl(rawUrl: string): ParsedGitHubRepo {
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 512) {
    return { valid: false, error: 'A valid repository URL (max 512 chars) is required.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, error: 'Invalid URL format.' };
  }

  if (parsed.protocol !== 'https:') {
    return { valid: false, error: 'Only HTTPS GitHub URLs are permitted.' };
  }

  if (parsed.username || parsed.password) {
    return { valid: false, error: 'Credentials in repository URLs are blocked.' };
  }

  const host = parsed.hostname.toLowerCase();
  if (PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(host))) {
    return { valid: false, error: 'Private or internal network hosts are blocked.' };
  }

  if (host !== 'github.com' && host !== 'www.github.com') {
    return { valid: false, error: 'Only public github.com repository URLs are supported.' };
  }

  if (parsed.port && parsed.port !== '443') {
    return { valid: false, error: 'Custom ports are not permitted.' };
  }

  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length < 2) {
    return {
      valid: false,
      error: 'URL must follow https://github.com/<owner>/<repository>.',
    };
  }

  const owner = segments[0];
  const repo = segments[1].replace(/\.git$/i, '');
  const slugPattern = /^[a-zA-Z0-9._-]{1,100}$/;
  if (!slugPattern.test(owner) || !slugPattern.test(repo)) {
    return { valid: false, error: 'Invalid GitHub owner or repository name.' };
  }

  return {
    valid: true,
    owner,
    repo,
    canonicalUrl: `https://github.com/${owner}/${repo}`,
  };
}

/**
 * Sanitizes untrusted external text (such as repository READMEs) before passing to AI prompts
 * to reduce prompt-injection risk.
 */
export function sanitizeUntrustedPromptText(text: string, maxLength = 3500): string {
  const cleaned = text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/ignore (all )?previous instructions/gi, '[filtered-directive]')
    .replace(/system\s*:/gi, '[filtered-role]')
    .slice(0, maxLength);
  return cleaned.trim();
}
