use std::fs::{self, File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use kairo_protocol::v1::{
    FileEntry, FileType, ListDirectoryResponse, ReadFileResponse, WriteFileResponse,
};
use thiserror::Error;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum FsError {
    #[error("path not found: {0}")]
    NotFound(String),

    #[error("permission denied: {0}")]
    PermissionDenied(String),

    #[error("path traversal detected: {0}")]
    PathTraversal(String),

    #[error("revision conflict: expected {expected}, actual {actual}")]
    Conflict { expected: String, actual: String },

    #[error("io error: {0}")]
    Io(String),
}

impl From<std::io::Error> for FsError {
    fn from(err: std::io::Error) -> Self {
        match err.kind() {
            std::io::ErrorKind::NotFound => Self::NotFound(err.to_string()),
            std::io::ErrorKind::PermissionDenied => Self::PermissionDenied(err.to_string()),
            _ => Self::Io(err.to_string()),
        }
    }
}

pub struct FilesystemHandler {
    root: PathBuf,
}

impl FilesystemHandler {
    #[must_use]
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    pub fn sanitize_path(&self, requested: &str) -> Result<PathBuf, FsError> {
        let req_path = Path::new(requested);
        for comp in req_path.components() {
            if matches!(comp, Component::ParentDir) {
                return Err(FsError::PathTraversal(requested.to_string()));
            }
        }

        let clean_relative = requested.trim_start_matches(['/', '\\']);
        let full = self.root.join(clean_relative);

        Ok(full)
    }

    pub fn list_directory(&self, path: &str) -> Result<ListDirectoryResponse, FsError> {
        let full_path = self.sanitize_path(path)?;
        if !full_path.exists() {
            return Err(FsError::NotFound(path.to_string()));
        }

        let read_dir = fs::read_dir(&full_path)?;
        let mut entries = Vec::new();

        for entry_res in read_dir {
            let entry = entry_res?;
            let metadata = entry.metadata()?;
            let file_name = entry.file_name().to_string_lossy().to_string();

            let file_type = if metadata.is_dir() {
                FileType::Directory as i32
            } else if metadata.is_symlink() {
                FileType::Symlink as i32
            } else {
                FileType::File as i32
            };

            let mtime_secs = metadata
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map_or(0, |d| d.as_secs() as i64);

            let revision = format!("{:x}-{:x}", mtime_secs, metadata.len());

            entries.push(FileEntry {
                path: file_name,
                file_type,
                size: metadata.len(),
                modified_at: mtime_secs,
                revision,
            });
        }

        Ok(ListDirectoryResponse { entries })
    }

    pub fn read_file(
        &self,
        path: &str,
        offset: u64,
        length: u64,
    ) -> Result<ReadFileResponse, FsError> {
        let full_path = self.sanitize_path(path)?;
        if !full_path.is_file() {
            return Err(FsError::NotFound(path.to_string()));
        }

        let mut file = File::open(&full_path)?;
        let metadata = file.metadata()?;
        let total_size = metadata.len();

        let mtime_secs = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map_or(0, |d| d.as_secs() as i64);
        let revision = format!("{:x}-{:x}", mtime_secs, total_size);

        if offset >= total_size {
            return Ok(ReadFileResponse {
                content: Vec::new(),
                revision,
            });
        }

        file.seek(SeekFrom::Start(offset))?;

        let to_read = if length == 0 {
            total_size.saturating_sub(offset)
        } else {
            length.min(total_size.saturating_sub(offset))
        };

        let mut content = vec![0u8; to_read as usize];
        file.read_exact(&mut content)?;

        Ok(ReadFileResponse { content, revision })
    }

    pub fn write_file(
        &self,
        path: &str,
        content: &[u8],
        expected_revision: Option<&str>,
    ) -> Result<WriteFileResponse, FsError> {
        let full_path = self.sanitize_path(path)?;

        if let Some(parent) = full_path.parent()
            && !parent.exists()
        {
            fs::create_dir_all(parent)?;
        }

        if full_path.exists() {
            let metadata = full_path.metadata()?;
            let mtime_secs = metadata
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map_or(0, |d| d.as_secs() as i64);
            let current_rev = format!("{:x}-{:x}", mtime_secs, metadata.len());

            if let Some(expected) = expected_revision
                && !expected.is_empty()
                && expected != current_rev
            {
                return Err(FsError::Conflict {
                    expected: expected.to_string(),
                    actual: current_rev,
                });
            }
        }

        let temp_path = full_path.with_extension(format!(
            "tmp.{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_or(0, |d| d.as_nanos())
        ));
        {
            let mut file = OpenOptions::new()
                .write(true)
                .create(true)
                .truncate(true)
                .open(&temp_path)?;
            file.write_all(content)?;
            file.sync_all()?;
        }

        fs::rename(&temp_path, &full_path)?;

        let metadata = full_path.metadata()?;
        let mtime_secs = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map_or(0, |d| d.as_secs() as i64);
        let revision = format!("{:x}-{:x}", mtime_secs, metadata.len());

        Ok(WriteFileResponse { revision })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_list_and_read_write_roundtrip() {
        let temp = TempDir::new().unwrap();
        let fs_handler = FilesystemHandler::new(temp.path());

        let write_res = fs_handler
            .write_file("test.txt", b"hello kairo fs", None)
            .expect("write should succeed");
        assert!(!write_res.revision.is_empty());

        let list_res = fs_handler.list_directory("").expect("list should succeed");
        assert_eq!(list_res.entries.len(), 1);
        assert_eq!(list_res.entries[0].path, "test.txt");
        assert_eq!(list_res.entries[0].file_type, FileType::File as i32);

        let read_res = fs_handler
            .read_file("test.txt", 0, 0)
            .expect("read should succeed");
        assert_eq!(read_res.content, b"hello kairo fs");
        assert_eq!(read_res.revision, write_res.revision);
    }

    #[test]
    fn test_revision_conflict() {
        let temp = TempDir::new().unwrap();
        let fs_handler = FilesystemHandler::new(temp.path());

        fs_handler
            .write_file("conflict.txt", b"v1", None)
            .expect("write v1");

        let err = fs_handler
            .write_file("conflict.txt", b"v2", Some("wrong-rev"))
            .unwrap_err();

        assert!(matches!(err, FsError::Conflict { .. }));
    }

    #[test]
    fn test_path_traversal_rejected() {
        let temp = TempDir::new().unwrap();
        let fs_handler = FilesystemHandler::new(temp.path());

        let err = fs_handler.list_directory("../etc").unwrap_err();
        assert_eq!(err, FsError::PathTraversal("../etc".to_string()));
    }
}
