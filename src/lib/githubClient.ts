/**
 * Andromeda GitHub Integration Client
 * Allows choosing repo, listing branches/files, reading, editing/modifying files, and pushing commits.
 */

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  description: string;
  default_branch: string;
  html_url: string;
  updated_at: string;
}

export interface GitHubFileItem {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size: number;
  sha: string;
  html_url: string;
  download_url?: string;
}

export interface GitHubUser {
  login: string;
  name: string;
  avatar_url: string;
  html_url: string;
  public_repos: number;
}

const STORAGE_KEY_GITHUB_TOKEN_PREFIX = 'andromeda_github_token_user_';
const STORAGE_KEY_SELECTED_REPO_PREFIX = 'andromeda_selected_github_repo_user_';
const STORAGE_KEY_SELECTED_BRANCH_PREFIX = 'andromeda_selected_github_branch_user_';

export function getSavedGitHubToken(userId?: string): string {
  try {
    if (userId && userId !== 'guest') {
      return localStorage.getItem(`${STORAGE_KEY_GITHUB_TOKEN_PREFIX}${userId}`) || '';
    }
    return '';
  } catch {
    return '';
  }
}

export function saveGitHubToken(token: string, userId?: string): void {
  try {
    if (userId && userId !== 'guest') {
      const key = `${STORAGE_KEY_GITHUB_TOKEN_PREFIX}${userId}`;
      if (token) {
        localStorage.setItem(key, token);
      } else {
        localStorage.removeItem(key);
      }
    }
  } catch {}
}

export function getSavedActiveRepo(userId?: string): string {
  try {
    if (userId && userId !== 'guest') {
      return localStorage.getItem(`${STORAGE_KEY_SELECTED_REPO_PREFIX}${userId}`) || '';
    }
    return '';
  } catch {
    return '';
  }
}

export function saveActiveRepo(repo: string, userId?: string): void {
  try {
    if (userId && userId !== 'guest') {
      const key = `${STORAGE_KEY_SELECTED_REPO_PREFIX}${userId}`;
      if (repo) {
        localStorage.setItem(key, repo);
      } else {
        localStorage.removeItem(key);
      }
    }
  } catch {}
}

export function getSavedActiveBranch(userId?: string): string {
  try {
    if (userId && userId !== 'guest') {
      return localStorage.getItem(`${STORAGE_KEY_SELECTED_BRANCH_PREFIX}${userId}`) || 'main';
    }
    return 'main';
  } catch {
    return 'main';
  }
}

export function saveActiveBranch(branch: string, userId?: string): void {
  try {
    if (userId && userId !== 'guest') {
      const key = `${STORAGE_KEY_SELECTED_BRANCH_PREFIX}${userId}`;
      localStorage.setItem(key, branch || 'main');
    }
  } catch {}
}

export const setSavedActiveRepo = saveActiveRepo;
export const setSavedActiveBranch = saveActiveBranch;

export function maskToken(token: string): string {
  if (!token) return '';
  if (token.length <= 8) return '••••••••';
  const prefix = token.slice(0, 4);
  const suffix = token.slice(-4);
  return `${prefix}••••••••${suffix}`;
}

export async function fetchGitHubUser(token?: string): Promise<{ success: boolean; user?: GitHubUser; error?: string }> {
  try {
    const activeToken = token || getSavedGitHubToken();
    const res = await fetch(`/api/github/user${activeToken ? `?token=${encodeURIComponent(activeToken)}` : ''}`);
    const data = await res.json();
    if (data.success && data.user) {
      return { success: true, user: data.user };
    }
    return { success: false, error: data.error || 'Failed to authenticate with GitHub' };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error connecting to GitHub' };
  }
}

export async function fetchGitHubRepos(token?: string): Promise<{ success: boolean; repos: GitHubRepo[]; error?: string }> {
  try {
    const activeToken = token || getSavedGitHubToken();
    const res = await fetch(`/api/github/repos${activeToken ? `?token=${encodeURIComponent(activeToken)}` : ''}`);
    const data = await res.json();
    if (data.success && Array.isArray(data.repos)) {
      return { success: true, repos: data.repos };
    }
    return { success: false, repos: [], error: data.error || 'Failed to fetch repositories' };
  } catch (err: any) {
    return { success: false, repos: [], error: err.message || 'Network error fetching repositories' };
  }
}

export async function fetchGitHubBranches(repo: string, token?: string): Promise<{ success: boolean; branches: string[]; error?: string }> {
  try {
    const activeToken = token || getSavedGitHubToken();
    const res = await fetch(`/api/github/branches?repo=${encodeURIComponent(repo)}${activeToken ? `&token=${encodeURIComponent(activeToken)}` : ''}`);
    const data = await res.json();
    if (data.success && Array.isArray(data.branches)) {
      return { success: true, branches: data.branches.map((b: any) => b.name) };
    }
    return { success: false, branches: ['main', 'master'], error: data.error };
  } catch (err: any) {
    return { success: false, branches: ['main', 'master'], error: err.message };
  }
}

export async function fetchGitHubTree(repo: string, branch = 'main', path = '', token?: string): Promise<{ success: boolean; files: GitHubFileItem[]; error?: string }> {
  try {
    const activeToken = token || getSavedGitHubToken();
    const res = await fetch(`/api/github/tree?repo=${encodeURIComponent(repo)}&branch=${encodeURIComponent(branch)}&path=${encodeURIComponent(path)}${activeToken ? `&token=${encodeURIComponent(activeToken)}` : ''}`);
    const data = await res.json();
    if (data.success && Array.isArray(data.files)) {
      return { success: true, files: data.files };
    }
    return { success: false, files: [], error: data.error || 'Failed to fetch directory tree' };
  } catch (err: any) {
    return { success: false, files: [], error: err.message };
  }
}

export async function fetchGitHubFileContent(repo: string, filePath: string, branch = 'main', token?: string): Promise<{ success: boolean; content?: string; sha?: string; error?: string }> {
  try {
    const activeToken = token || getSavedGitHubToken();
    const res = await fetch(`/api/github/file?repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(filePath)}&branch=${encodeURIComponent(branch)}${activeToken ? `&token=${encodeURIComponent(activeToken)}` : ''}`);
    const data = await res.json();
    if (data.success) {
      return { success: true, content: data.content, sha: data.sha };
    }
    return { success: false, error: data.error || 'Failed to read file' };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function commitGitHubFile(
  repo: string,
  filePath: string,
  content: string,
  commitMessage?: string,
  branch = 'main',
  sha?: string,
  token?: string
): Promise<{ success: boolean; commitSha?: string; commitUrl?: string; message?: string; error?: string }> {
  try {
    const activeToken = token || getSavedGitHubToken();
    const res = await fetch('/api/github/commit-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repo,
        path: filePath,
        content,
        commitMessage: commitMessage || `Update ${filePath} via Andromeda Soul`,
        branch,
        sha,
        githubToken: activeToken,
      }),
    });
    const data = await res.json();
    if (data.success) {
      return {
        success: true,
        commitSha: data.commitSha,
        commitUrl: data.commitUrl,
        message: data.message,
      };
    }
    return { success: false, error: data.error || 'Failed to commit file' };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error pushing commit' };
  }
}
