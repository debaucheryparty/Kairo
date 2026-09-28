import React, { useEffect, useState } from 'react';
import type { FileEntry, KairoClient } from '@kairo/runtime';

interface FinderProps {
  client: KairoClient;
}

export function Finder({ client }: FinderProps) {
  const [currentPath, setCurrentPath] = useState('');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<FileEntry | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editBuffer, setEditBuffer] = useState('');
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const [showNewFile, setShowNewFile] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [isWatching, setIsWatching] = useState(false);

  const loadDirectory = async (path: string) => {
    setLoading(true);
    setError(null);
    setSelectedFile(null);
    setFileContent(null);
    setIsEditing(false);
    try {
      const list = await client.listDirectory(path);
      const sorted = [...list].sort((a, b) => {
        if (a.fileType === 2 && b.fileType !== 2) return -1;
        if (a.fileType !== 2 && b.fileType === 2) return 1;
        return a.path.localeCompare(b.path);
      });
      setEntries(sorted);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDirectory(currentPath);

    let cancelled = false;
    client
      .watchDirectory(currentPath)
      .then((ok) => {
        if (!cancelled) setIsWatching(ok);
      })
      .catch(() => {
        if (!cancelled) setIsWatching(false);
      });

    const unsubscribe = client.onFileEvent(() => {
      client
        .listDirectory(currentPath)
        .then((list) => {
          if (cancelled) return;
          const sorted = [...list].sort((a, b) => {
            if (a.fileType === 2 && b.fileType !== 2) return -1;
            if (a.fileType !== 2 && b.fileType === 2) return 1;
            return a.path.localeCompare(b.path);
          });
          setEntries(sorted);
        })
        .catch(() => {});
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [currentPath]);

  const handleEntryClick = async (entry: FileEntry) => {
    if (entry.fileType === 2) {
      const nextPath = currentPath ? `${currentPath}/${entry.path}` : entry.path;
      setCurrentPath(nextPath);
    } else {
      setSelectedFile(entry);
      setIsEditing(false);
      setSaveStatus(null);
      try {
        const filePath = currentPath ? `${currentPath}/${entry.path}` : entry.path;
        const res = await client.readFile(filePath);
        const text = new TextDecoder().decode(res.content);
        setFileContent(text);
        setEditBuffer(text);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }
  };

  const handleSaveFile = async () => {
    if (!selectedFile) return;
    try {
      const filePath = currentPath ? `${currentPath}/${selectedFile.path}` : selectedFile.path;
      const content = new TextEncoder().encode(editBuffer);
      const res = await client.writeFile(filePath, content, selectedFile.revision);
      setSelectedFile({ ...selectedFile, revision: res.revision, size: content.byteLength });
      setFileContent(editBuffer);
      setIsEditing(false);
      setSaveStatus('Saved successfully');
      loadDirectory(currentPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCreateFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFileName.trim()) return;
    try {
      const filePath = currentPath ? `${currentPath}/${newFileName.trim()}` : newFileName.trim();
      await client.writeFile(filePath, new Uint8Array(0));
      setNewFileName('');
      setShowNewFile(false);
      loadDirectory(currentPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const navigateUp = () => {
    if (!currentPath) return;
    const parts = currentPath.split('/');
    parts.pop();
    setCurrentPath(parts.join('/'));
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="finder-app">
      <div className="finder-toolbar">
        <button
          type="button"
          className="btn-toolbar"
          onClick={navigateUp}
          disabled={!currentPath}
          title="Go Up"
        >
          ⬆️ Up
        </button>
        <button
          type="button"
          className="btn-toolbar"
          onClick={() => loadDirectory(currentPath)}
          title="Refresh"
        >
          🔄 Refresh
        </button>
        <button
          type="button"
          className="btn-toolbar"
          onClick={() => setShowNewFile(!showNewFile)}
          title="New File"
        >
          📄 New File
        </button>
        <div className="finder-breadcrumbs">
          <span
            className="breadcrumb-item"
            onClick={() => setCurrentPath('')}
          >
            ~
          </span>
          {currentPath.split('/').filter(Boolean).map((part, index, arr) => (
            <React.Fragment key={part + index}>
              <span className="breadcrumb-separator">/</span>
              <span
                className="breadcrumb-item"
                onClick={() => setCurrentPath(arr.slice(0, index + 1).join('/'))}
              >
                {part}
              </span>
            </React.Fragment>
          ))}
        </div>
        {isWatching && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '999px',
              background: 'rgba(16, 185, 129, 0.12)',
              color: '#34d399',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              marginLeft: 'auto',
            }}
            title="Real-time directory watching active"
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: '#10b981',
                boxShadow: '0 0 6px #10b981',
              }}
            />
            Live Sync
          </div>
        )}
      </div>

      {showNewFile && (
        <form className="new-file-bar" onSubmit={handleCreateFile}>
          <input
            type="text"
            className="form-input-sm"
            placeholder="filename.txt"
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            autoFocus
          />
          <button type="submit" className="btn-sm btn-primary-sm">Create</button>
          <button
            type="button"
            className="btn-sm"
            onClick={() => setShowNewFile(false)}
          >
            Cancel
          </button>
        </form>
      )}

      {error && <div className="finder-error-bar">{error}</div>}

      <div className="finder-body">
        <div className="finder-list">
          {loading ? (
            <div className="finder-empty">Loading directory...</div>
          ) : entries.length === 0 ? (
            <div className="finder-empty">Empty directory</div>
          ) : (
            entries.map((entry) => {
              const isDir = entry.fileType === 2;
              const isSelected = selectedFile?.path === entry.path;
              return (
                <div
                  key={entry.path}
                  className={`finder-item ${isDir ? 'dir' : 'file'} ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleEntryClick(entry)}
                >
                  <span className="item-icon">{isDir ? '📁' : '📄'}</span>
                  <span className="item-name">{entry.path}</span>
                  {!isDir && (
                    <span className="item-size">{formatSize(entry.size)}</span>
                  )}
                </div>
              );
            })
          )}
        </div>

        {selectedFile && (
          <div className="finder-preview">
            <div className="preview-header">
              <span className="preview-filename">{selectedFile.path}</span>
              <div className="preview-actions">
                {saveStatus && <span className="save-status">{saveStatus}</span>}
                {isEditing ? (
                  <>
                    <button type="button" className="btn-sm btn-primary-sm" onClick={handleSaveFile}>
                      Save
                    </button>
                    <button
                      type="button"
                      className="btn-sm"
                      onClick={() => {
                        setEditBuffer(fileContent || '');
                        setIsEditing(false);
                      }}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn-sm"
                    onClick={() => setIsEditing(true)}
                  >
                    Edit
                  </button>
                )}
              </div>
            </div>

            <div className="preview-content">
              {isEditing ? (
                <textarea
                  className="preview-editor"
                  value={editBuffer}
                  onChange={(e) => setEditBuffer(e.target.value)}
                  spellCheck={false}
                />
              ) : (
                <pre className="preview-text">{fileContent ?? 'Loading file...'}</pre>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
