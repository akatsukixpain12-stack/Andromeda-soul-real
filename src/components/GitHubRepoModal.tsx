import React, { useState, useEffect } from 'react';
import {
  FolderGit2,
  X,
  Check,
  Search,
  ExternalLink,
  GitBranch,
  FileCode,
  Folder,
  ChevronRight,
  UploadCloud,
  Save,
  RefreshCw,
  Plus,
  ShieldCheck,
  Key,
  AlertCircle,
  FileText,
  Play,
  ArrowLeft
} from 'lucide-react';
import {
  GitHubRepo,
  GitHubFileItem,
  GitHubUser,
  fetchGitHubUser,
  fetchGitHubRepos,
  fetchGitHubBranches,
  fetchGitHubTree,
  fetchGitHubFileContent,
  commitGitHubFile,
  getSavedGitHubToken,
  saveGitHubToken,
  getSavedActiveRepo,
  saveActiveRepo,
  getSavedActiveBranch,
  saveActiveBranch,
} from '../lib/githubClient';

interface GitHubRepoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertRepoContext?: (repoName: string, selectedFilePath?: string, fileContent?: string) => void;
  onRequestCommandConfirmation?: (action: { type: 'github_commit' | 'command'; details: string; onAllow: () => void }) => void;
}

export const GitHubRepoModal: React.FC<GitHubRepoModalProps> = ({
  isOpen,
  onClose,
  onInsertRepoContext,
  onRequestCommandConfirmation,
}) => {
  const [tokenInput, setTokenInput] = useState(() => getSavedGitHubToken());
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [searchRepo, setSearchRepo] = useState('');
  const [selectedRepo, setSelectedRepo] = useState<string>(() => getSavedActiveRepo());
  const [branches, setBranches] = useState<string[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>(() => getSavedActiveBranch());
  const [currentPath, setCurrentPath] = useState<string>('');
  const [files, setFiles] = useState<GitHubFileItem[]>([]);
  
  // File editor state
  const [activeFile, setActiveFile] = useState<{ path: string; name: string; content: string; sha?: string } | null>(null);
  const [editedContent, setEditedContent] = useState('');
  const [commitMessage, setCommitMessage] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitStatus, setCommitStatus] = useState<{ success?: boolean; message?: string } | null>(null);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Check authorization on open
  useEffect(() => {
    if (!isOpen) return;
    checkAuth();
  }, [isOpen]);

  const checkAuth = async (tokenToUse?: string) => {
    const t = tokenToUse !== undefined ? tokenToUse : getSavedGitHubToken();
    if (!t) {
      setIsAuthorized(false);
      setUser(null);
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    const res = await fetchGitHubUser(t);
    if (res.success && res.user) {
      setIsAuthorized(true);
      setUser(res.user);
      loadRepos(t);
    } else {
      setIsAuthorized(false);
      setUser(null);
      if (t) setErrorMsg(res.error || 'Invalid GitHub token');
    }
    setLoading(false);
  };

  const handleSaveToken = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = tokenInput.trim();
    saveGitHubToken(clean);
    await checkAuth(clean);
  };

  const handleDisconnect = () => {
    saveGitHubToken('');
    setTokenInput('');
    setIsAuthorized(false);
    setUser(null);
    setRepos([]);
    setSelectedRepo('');
    setActiveFile(null);
  };

  const loadRepos = async (token?: string) => {
    setLoading(true);
    const res = await fetchGitHubRepos(token);
    if (res.success) {
      setRepos(res.repos);
      if (selectedRepo && res.repos.some((r) => r.full_name === selectedRepo)) {
        loadRepoContents(selectedRepo);
      }
    } else {
      setErrorMsg(res.error || 'Failed to load repositories');
    }
    setLoading(false);
  };

  const loadRepoContents = async (repoName: string, branch?: string, path = '') => {
    setSelectedRepo(repoName);
    saveActiveRepo(repoName);
    setLoading(true);
    setErrorMsg(null);
    setActiveFile(null);

    // Load branches
    const bRes = await fetchGitHubBranches(repoName);
    if (bRes.success && bRes.branches.length > 0) {
      setBranches(bRes.branches);
      const activeB = branch || (bRes.branches.includes(selectedBranch) ? selectedBranch : bRes.branches[0]);
      setSelectedBranch(activeB);
      saveActiveBranch(activeB);

      // Load file tree
      const tRes = await fetchGitHubTree(repoName, activeB, path);
      if (tRes.success) {
        setFiles(tRes.files);
        setCurrentPath(path);
      } else {
        setErrorMsg(tRes.error || 'Failed to load repository files');
      }
    }
    setLoading(false);
  };

  const handleSelectFile = async (file: GitHubFileItem) => {
    if (file.type === 'dir') {
      loadRepoContents(selectedRepo, selectedBranch, file.path);
      return;
    }

    setLoading(true);
    const res = await fetchGitHubFileContent(selectedRepo, file.path, selectedBranch);
    if (res.success && res.content !== undefined) {
      setActiveFile({
        name: file.name,
        path: file.path,
        content: res.content,
        sha: res.sha,
      });
      setEditedContent(res.content);
      setCommitMessage(`Update ${file.name} via Andromeda Soul`);
      setCommitStatus(null);
    } else {
      setErrorMsg(res.error || 'Failed to open file');
    }
    setLoading(false);
  };

  const handleCommitPush = async () => {
    if (!activeFile || !selectedRepo) return;

    const executePush = async () => {
      setIsCommitting(true);
      setCommitStatus(null);
      setErrorMsg(null);

      const res = await commitGitHubFile(
        selectedRepo,
        activeFile.path,
        editedContent,
        commitMessage,
        selectedBranch,
        activeFile.sha
      );

      if (res.success) {
        setCommitStatus({ success: true, message: res.message || 'Committed and pushed successfully!' });
        // Reload files
        loadRepoContents(selectedRepo, selectedBranch, currentPath);
      } else {
        setCommitStatus({ success: false, message: res.error || 'Failed to push commit' });
      }
      setIsCommitting(false);
    };

    if (onRequestCommandConfirmation) {
      onRequestCommandConfirmation({
        type: 'github_commit',
        details: `Push commit to ${selectedRepo} (${selectedBranch})\nFile: ${activeFile.path}\nMessage: "${commitMessage || 'Update file'}"`,
        onAllow: executePush,
      });
    } else {
      executePush();
    }
  };

  const handleInsertIntoChat = () => {
    if (!selectedRepo) return;
    if (onInsertRepoContext) {
      onInsertRepoContext(selectedRepo, activeFile?.path, activeFile ? editedContent : undefined);
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-4xl max-h-[92vh] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden text-slate-900 dark:text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-zinc-900 text-white flex items-center justify-center shadow-md">
              <FolderGit2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-tight">GitHub Workspace & Repo Connect</h2>
                {isAuthorized && (
                  <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                    <Check className="w-3 h-3" /> Connected
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Authorize, choose repositories, modify files, and commit directly like ChatGPT
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* 1. Authorization Section */}
          {!isAuthorized ? (
            <div className="max-w-xl mx-auto py-8 text-center space-y-5">
              <div className="w-16 h-16 mx-auto rounded-3xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-300">
                <Key className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold">Connect your GitHub Account</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Enter your GitHub Personal Access Token (classic with <code className="text-violet-600 dark:text-violet-400 font-mono">repo</code> scope or fine-grained token) to modify files and push commits.
                </p>
              </div>

              <form onSubmit={handleSaveToken} className="space-y-3 text-left">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Personal Access Token (PAT)
                  </label>
                  <input
                    type="password"
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>

                {errorMsg && (
                  <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={loading || !tokenInput.trim()}
                    className="flex-1 min-h-[42px] flex items-center justify-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold shadow-md transition-all cursor-pointer disabled:opacity-50"
                  >
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                    <span>Authorize with GitHub</span>
                  </button>
                  <a
                    href="https://github.com/settings/tokens/new?scopes=repo,read:user,user:email&description=Andromeda%20Soul%20Agent"
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 flex items-center gap-1.5"
                  >
                    <span>Create Token</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </form>
            </div>
          ) : (
            <div className="space-y-6">
              {/* User Bar & Repo Selector */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  {user?.avatar_url && (
                    <img src={user.avatar_url} alt={user.login} className="w-10 h-10 rounded-full border border-slate-200" />
                  )}
                  <div>
                    <div className="font-bold text-xs flex items-center gap-2">
                      <span>{user?.name || user?.login}</span>
                      <span className="text-slate-400 font-normal">(@{user?.login})</span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {user?.public_repos} public repos • Authorized
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => loadRepos()}
                    disabled={loading}
                    className="p-2 rounded-xl text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                    title="Refresh Repositories"
                  >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    onClick={handleDisconnect}
                    className="px-3 py-1.5 rounded-xl text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-900 transition-colors cursor-pointer"
                  >
                    Disconnect
                  </button>
                </div>
              </div>

              {/* Repo Selector & Branch Bar */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    Select Active Repository
                  </label>
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search or enter owner/repo..."
                      value={searchRepo}
                      onChange={(e) => setSearchRepo(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  </div>

                  <div className="mt-2 max-h-48 overflow-y-auto space-y-1 rounded-xl border border-slate-200 dark:border-slate-800 p-1.5 bg-white dark:bg-slate-900">
                    {repos
                      .filter((r) => r.full_name.toLowerCase().includes(searchRepo.toLowerCase()))
                      .slice(0, 15)
                      .map((r) => (
                        <div
                          key={r.id}
                          onClick={() => loadRepoContents(r.full_name, r.default_branch)}
                          className={`px-3 py-2 rounded-lg text-xs flex items-center justify-between cursor-pointer transition-colors ${
                            selectedRepo === r.full_name
                              ? 'bg-violet-500 text-white font-semibold'
                              : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <FolderGit2 className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{r.full_name}</span>
                          </div>
                          {selectedRepo === r.full_name && <Check className="w-3.5 h-3.5 shrink-0" />}
                        </div>
                      ))}
                  </div>
                </div>

                {/* Branch and Actions */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      Target Branch
                    </label>
                    <div className="flex items-center gap-2">
                      <GitBranch className="w-4 h-4 text-violet-500" />
                      <select
                        value={selectedBranch}
                        onChange={(e) => {
                          setSelectedBranch(e.target.value);
                          if (selectedRepo) loadRepoContents(selectedRepo, e.target.value, currentPath);
                        }}
                        disabled={!selectedRepo || branches.length === 0}
                        className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-mono"
                      >
                        {branches.map((b) => (
                          <option key={b} value={b}>
                            {b}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {selectedRepo && (
                    <div className="p-3 rounded-xl bg-violet-500/10 border border-violet-500/20 text-xs space-y-2">
                      <div className="font-semibold text-violet-900 dark:text-violet-300 flex items-center gap-1.5">
                        <FolderGit2 className="w-4 h-4 text-violet-600" />
                        <span>Active: {selectedRepo}</span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400">
                        Chat messages can now reference, inspect, modify, and push commits to this repository.
                      </p>
                      <button
                        onClick={handleInsertIntoChat}
                        className="w-full py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold transition-colors cursor-pointer"
                      >
                        Attach Repo to Current Chat
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* File Explorer & Code Editor */}
              {selectedRepo && (
                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900">
                  {/* Explorer Breadcrumb */}
                  <div className="flex items-center justify-between px-4 py-2.5 bg-slate-100 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-600 dark:text-slate-400">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        onClick={() => loadRepoContents(selectedRepo, selectedBranch, '')}
                        className="hover:text-violet-600 font-semibold cursor-pointer"
                      >
                        {selectedRepo}
                      </button>
                      {currentPath && (
                        <>
                          <span>/</span>
                          <span>{currentPath}</span>
                        </>
                      )}
                    </div>
                    {currentPath && (
                      <button
                        onClick={() => {
                          const parent = currentPath.split('/').slice(0, -1).join('/');
                          loadRepoContents(selectedRepo, selectedBranch, parent);
                        }}
                        className="flex items-center gap-1 text-[11px] text-violet-600 hover:underline cursor-pointer"
                      >
                        <ArrowLeft className="w-3 h-3" /> Up one level
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 min-h-[300px]">
                    {/* Left: Files List */}
                    <div className="p-2 border-r border-slate-200 dark:border-slate-800 max-h-[360px] overflow-y-auto space-y-1">
                      {files.length === 0 && (
                        <div className="p-4 text-center text-xs text-slate-400">
                          {loading ? 'Loading repository tree...' : 'No files found.'}
                        </div>
                      )}
                      {files.map((f) => (
                        <div
                          key={f.path}
                          onClick={() => handleSelectFile(f)}
                          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                            activeFile?.path === f.path
                              ? 'bg-violet-100 dark:bg-violet-950 text-violet-900 dark:text-violet-200 font-semibold'
                              : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {f.type === 'dir' ? (
                            <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          ) : (
                            <FileCode className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          )}
                          <span className="truncate flex-1 font-mono text-[11px]">{f.name}</span>
                          {f.type === 'dir' && <ChevronRight className="w-3 h-3 text-slate-400" />}
                        </div>
                      ))}
                    </div>

                    {/* Right: File Editor & Direct Push */}
                    <div className="md:col-span-2 flex flex-col p-3 bg-slate-50/50 dark:bg-slate-950/50">
                      {activeFile ? (
                        <div className="flex-1 flex flex-col space-y-3">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-mono font-bold text-slate-900 dark:text-slate-100 truncate">
                              {activeFile.path}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              SHA: {activeFile.sha?.substring(0, 7)}
                            </span>
                          </div>

                          <textarea
                            value={editedContent}
                            onChange={(e) => setEditedContent(e.target.value)}
                            className="flex-1 w-full min-h-[220px] p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 font-mono text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500 leading-relaxed"
                          />

                          {/* Commit & Push Bar */}
                          <div className="space-y-2 pt-1">
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                placeholder="Commit message (e.g., Update file via Andromeda Soul)"
                                value={commitMessage}
                                onChange={(e) => setCommitMessage(e.target.value)}
                                className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs"
                              />
                              <button
                                onClick={handleCommitPush}
                                disabled={isCommitting}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold shadow-md transition-all cursor-pointer disabled:opacity-50"
                              >
                                {isCommitting ? (
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <UploadCloud className="w-3.5 h-3.5" />
                                )}
                                <span>Commit & Push</span>
                              </button>
                            </div>

                            {commitStatus && (
                              <div
                                className={`p-2 rounded-xl text-xs flex items-center gap-1.5 ${
                                  commitStatus.success
                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                                    : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 dark:border-rose-800'
                                }`}
                              >
                                {commitStatus.success ? <Check className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                                <span>{commitStatus.message}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-400">
                          <FileText className="w-8 h-8 mb-2 opacity-30" />
                          <p className="text-xs font-semibold">Select a file to inspect or edit</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            You can edit code live and push commits directly to GitHub branch {selectedBranch}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
