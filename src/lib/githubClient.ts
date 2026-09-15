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

const STORAGE_KEY_GITHUB_TOKEN = 'andromeda_github_token_v1';
const STORAGE_KEY_SELECTED_REPO = 'andromeda_selected_github_repo_v1';
const STORAGE_KEY_SELECTED_BRANCH = 'andromeda_selected_github_branch_v1';

export function getSavedGitHubToken(): string {
  try {
    return localStorage.getItem(STORAGE_KEY_GITHUB_TOKEN) || '';
  } catch {
    return '';
  }
}

export function saveGitHubToken(token: string): void {
  try {
    if (token) {
      localStorage.setItem(STORAGE_KEY_GITHUB_TOKEN, token);
    } else {
      localStorage.removeItem(STORAGE_KEY_GITHUB_TOKEN);
    }
  } catch {}
}

export function getSavedActiveRepo(): string {
  try {
    return localStorage.getItem(STORAGE_KEY_SELECTED_REPO) || '';
  } catch {
    return '';
  }
}

export function saveActiveRepo(repo: string): void {
  try {
    if (repo) {
      localStorage.setItem(STORAGE_KEY_SELECTED_REPO, repo);
    } else {
      localStorage.removeItem(STORAGE_KEY_SELECTED_REPO);
    }
  } catch {}
}

export function getSavedActiveBranch(): string {
  try {
    return localStorage.getItem(STORAGE_KEY_SELECTED_BRANCH) || 'main';
  } catch {
    return 'main';
  }
}

export function saveActiveBranch(branch: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_SELECTED_BRANCH, branch || 'main');
  } catch {}
}

export const setSavedActiveRepo = saveActiveRepo;
export const setSavedActiveBranch = saveActiveBranch;

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
