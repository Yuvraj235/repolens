/** Parsing + limits for GitHub repo ingestion. */

export interface RepoRef {
  owner: string;
  repo: string;
  ref: string | null; // branch/tag/sha, or null = default branch
}

// Ingestion caps. Kept modest because the context engine runs in the browser:
// we want indexing to feel instant and the payload to stay small. Real repos
// larger than this still work — they're just truncated, and we say so.
export const CAPS = {
  MAX_FILE_BYTES: 128 * 1024, // skip individual files larger than this
  MAX_TOTAL_BYTES: 4 * 1024 * 1024, // stop indexing once we've kept this much text
  MAX_FILES: 1500,
  MAX_DOWNLOAD_BYTES: 60 * 1024 * 1024, // refuse to buffer a tarball larger than this
};

/**
 * Accepts the shapes people actually paste:
 *   https://github.com/owner/repo
 *   https://github.com/owner/repo.git
 *   https://github.com/owner/repo/tree/some-branch
 *   github.com/owner/repo
 *   owner/repo
 */
export function parseRepoInput(input: string): RepoRef | null {
  const raw = input.trim();
  if (!raw) return null;

  let owner: string | undefined;
  let repo: string | undefined;
  let ref: string | null = null;

  const urlMatch = raw.match(
    /github\.com[/:]([^/\s]+)\/([^/\s#?]+?)(?:\.git)?(?:\/(?:tree|blob)\/([^/\s#?]+))?(?:[/?#].*)?$/i,
  );
  if (urlMatch) {
    owner = urlMatch[1];
    repo = urlMatch[2];
    ref = urlMatch[3] ?? null;
  } else {
    const shorthand = raw.match(/^([^/\s]+)\/([^/\s#?]+?)(?:\.git)?$/);
    if (shorthand) {
      owner = shorthand[1];
      repo = shorthand[2];
    }
  }

  if (!owner || !repo) return null;
  return { owner, repo: repo.replace(/\.git$/i, ""), ref };
}

/** codeload gives us the whole repo in one gzip'd request (no REST rate limit). */
export function tarballUrl(owner: string, repo: string, ref: string): string {
  return `https://codeload.github.com/${owner}/${repo}/tar.gz/${ref}`;
}
