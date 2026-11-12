//! Kairo Dots: declarative dotfile profiles.
//!
//! Unlike everything else in the managed userspace, dotfiles are files in
//! the host user's home directory — that is their purpose. Safety comes
//! from three rules: applying over an existing unmanaged file requires
//! explicit authorization, every overwritten original is backed up inside
//! the userspace, and `restore` returns the home directory to its previous
//! state. Profiles support inheritance (layering), `{{var}}` templates, and
//! git-backed import/export.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::{Deserialize, Serialize};

use crate::auth::{AuthContext, OperationLevel, PermissionManager};
use crate::error::CoreError;
use crate::state::{load_state, store_state};
use crate::userspace::ManagedUserspace;

const DOTS_STATE_KIND: &str = "kairo-dots";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DotfileSpec {
    /// Path relative to the user's home directory (e.g. `.bashrc` or
    /// `.config/git/config`).
    pub path: String,
    #[serde(default)]
    pub template: bool,
    /// Unix permission bits. Ignored on Windows.
    #[serde(default)]
    pub mode: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DotProfile {
    pub name: String,
    #[serde(default)]
    pub description: String,
    /// Parent profile: its files are layered underneath this one's.
    #[serde(default)]
    pub extends: Option<String>,
    /// Template variables; they override the built-in variables.
    #[serde(default)]
    pub vars: BTreeMap<String, String>,
    #[serde(default)]
    pub files: Vec<DotfileSpec>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DotContext {
    /// Home directory the dotfiles are applied to.
    pub home: PathBuf,
    /// Extra template variables layered over the built-ins and profile vars.
    #[serde(default)]
    pub vars: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DotfileAction {
    Applied,
    Skipped,
    Conflicted,
    Restored,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DotfileResult {
    pub path: String,
    pub action: DotfileAction,
    #[serde(default)]
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DotApplyReport {
    pub success: bool,
    pub profile: String,
    pub files: Vec<DotfileResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum DotDrift {
    Missing { path: String },
    Modified { path: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ManagedDotfile {
    /// Home-relative path.
    path: String,
    /// SHA-256 of the rendered content Kairo last wrote.
    source_hash: String,
    /// Userspace path of the original file that was overwritten, if any.
    backup: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AppliedDotProfile {
    name: String,
    /// The home directory this profile was applied to; restore targets it.
    home: String,
    applied_at_ms: u64,
    files: Vec<ManagedDotfile>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct DotsState {
    #[serde(default)]
    profiles: Vec<AppliedDotProfile>,
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as u64)
}

fn validate_profile(profile: &DotProfile) -> Result<(), CoreError> {
    crate::package::manifest::validate_name(&profile.name)?;
    if profile.files.is_empty() {
        return Err(CoreError::InvalidArgument(format!(
            "dot profile '{}' contains no files",
            profile.name
        )));
    }
    let mut seen = std::collections::HashSet::new();
    for file in &profile.files {
        if file.path.is_empty()
            || file.path.starts_with('/')
            || file.path.starts_with('\\')
            || file.path.split(['/', '\\']).any(|part| part == "..")
        {
            return Err(CoreError::InvalidArgument(format!(
                "dotfile path '{}' must be relative to the home directory",
                file.path
            )));
        }
        if !seen.insert(file.path.clone()) {
            return Err(CoreError::InvalidArgument(format!(
                "dotfile '{}' appears twice in profile '{}'",
                file.path, profile.name
            )));
        }
    }
    Ok(())
}

pub struct DotsEngine {
    space: Arc<ManagedUserspace>,
    permissions: PermissionManager,
}

impl DotsEngine {
    #[must_use]
    pub fn new(space: Arc<ManagedUserspace>) -> Self {
        Self {
            space,
            permissions: PermissionManager::new(),
        }
    }

    fn profiles_root(&self) -> PathBuf {
        self.space.root().join("dots")
    }

    fn profile_dir(&self, name: &str) -> PathBuf {
        self.profiles_root().join(name)
    }

    fn state_file(&self) -> PathBuf {
        self.space.root().join("state").join("dots.json")
    }

    /// Writes a profile (manifest + file payloads) into the userspace.
    /// Existing files of the same profile are replaced wholesale.
    pub fn save_profile(
        &self,
        profile: &DotProfile,
        payloads: &BTreeMap<String, Vec<u8>>,
    ) -> Result<(), CoreError> {
        validate_profile(profile)?;
        for spec in &profile.files {
            if !payloads.contains_key(&spec.path) {
                return Err(CoreError::InvalidArgument(format!(
                    "profile '{}' declares dotfile '{}' but no payload was provided",
                    profile.name, spec.path
                )));
            }
        }

        let dir = self.profile_dir(&profile.name);
        if dir.exists() {
            std::fs::remove_dir_all(&dir)?;
        }
        std::fs::create_dir_all(dir.join("files"))?;
        std::fs::write(
            dir.join("profile.json"),
            serde_json::to_vec_pretty(profile)?,
        )?;
        for spec in &profile.files {
            let target = dir.join("files").join(&spec.path);
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::write(target, &payloads[&spec.path])?;
        }
        Ok(())
    }

    pub fn list_profiles(&self) -> Result<Vec<String>, CoreError> {
        let mut names = Vec::new();
        let root = self.profiles_root();
        if root.exists() {
            for entry in std::fs::read_dir(&root)? {
                let entry = entry?;
                if entry.path().join("profile.json").is_file() {
                    names.push(entry.file_name().to_string_lossy().to_string());
                }
            }
        }
        names.sort();
        Ok(names)
    }

    pub fn load_profile(&self, name: &str) -> Result<DotProfile, CoreError> {
        crate::package::manifest::validate_name(name)?;
        let manifest = self.profile_dir(name).join("profile.json");
        let bytes = std::fs::read(&manifest).map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                CoreError::NotFound(format!("dot profile '{name}' is not saved"))
            } else {
                CoreError::Io(e)
            }
        })?;
        Ok(serde_json::from_slice(&bytes)?)
    }

    /// Resolves the inheritance chain (base first) and layers the file sets;
    /// a child's dotfile replaces the parent's at the same path.
    fn resolve_layered(
        &self,
        name: &str,
    ) -> Result<(DotProfile, Vec<(DotfileSpec, PathBuf)>), CoreError> {
        let mut chain = Vec::new();
        let mut current = Some(name.to_string());
        let mut visited = std::collections::HashSet::new();
        while let Some(profile_name) = current {
            if !visited.insert(profile_name.clone()) {
                return Err(CoreError::InvalidArgument(format!(
                    "dot profile inheritance cycle through '{profile_name}'"
                )));
            }
            let profile = self.load_profile(&profile_name)?;
            current = profile.extends.clone();
            chain.push(profile);
        }
        chain.reverse();

        let mut layered: Vec<(DotfileSpec, PathBuf)> = Vec::new();
        for profile in &chain {
            let files_dir = self.profile_dir(&profile.name).join("files");
            for spec in &profile.files {
                let source = files_dir.join(&spec.path);
                if let Some(slot) = layered
                    .iter_mut()
                    .find(|(existing, _)| existing.path == spec.path)
                {
                    *slot = (spec.clone(), source);
                } else {
                    layered.push((spec.clone(), source));
                }
            }
        }

        let top = self.load_profile(name)?;
        Ok((top, layered))
    }

    fn rendered(
        &self,
        profile: &DotProfile,
        spec: &DotfileSpec,
        payload: &[u8],
        context: &DotContext,
    ) -> Result<Vec<u8>, CoreError> {
        if !spec.template {
            return Ok(payload.to_vec());
        }

        let mut vars: BTreeMap<String, String> = BTreeMap::new();
        vars.insert(
            "home".to_string(),
            context.home.to_string_lossy().to_string(),
        );
        vars.insert("profile".to_string(), profile.name.clone());
        for (key, value) in &profile.vars {
            vars.insert(key.clone(), value.clone());
        }
        for (key, value) in &context.vars {
            vars.insert(key.clone(), value.clone());
        }

        let text = std::str::from_utf8(payload).map_err(|_| {
            CoreError::InvalidArgument("template payloads must be UTF-8".to_string())
        })?;
        let mut out = String::with_capacity(text.len());
        let mut rest = text;
        while let Some(start) = rest.find("{{") {
            out.push_str(&rest[..start]);
            let after = &rest[start + 2..];
            let Some(end) = after.find("}}") else {
                return Err(CoreError::InvalidArgument(format!(
                    "unterminated '{{{{' in template dotfile '{}'",
                    spec.path
                )));
            };
            let key = after[..end].trim();
            let value = vars.get(key).ok_or_else(|| {
                CoreError::InvalidArgument(format!(
                    "template variable '{key}' is not defined for dotfile '{}'",
                    spec.path
                ))
            })?;
            out.push_str(value);
            rest = &after[end + 2..];
        }
        out.push_str(rest);
        Ok(out.into_bytes())
    }

    /// Applies a profile to the given home directory. Existing unmanaged
    /// files are only overwritten when `authorize_existing` is true; the
    /// originals are backed up inside the userspace either way.
    pub fn apply(
        &self,
        name: &str,
        context: &DotContext,
        authorize_existing: bool,
        auth: &AuthContext,
    ) -> Result<DotApplyReport, CoreError> {
        self.permissions
            .require_level(auth, OperationLevel::Modify)?;
        let (profile, layered) = self.resolve_layered(name)?;
        let state = self.load_all_state();
        let previously = state
            .as_ref()
            .ok()
            .and_then(|all| all.profiles.iter().find(|p| p.name == name).cloned());

        let mut results = Vec::new();
        let mut managed = Vec::new();
        let mut conflicts = 0;

        for (spec, source) in &layered {
            let payload = std::fs::read(source).map_err(|e| {
                CoreError::InvalidArgument(format!(
                    "profile '{}' is missing the payload for '{}': {e}",
                    profile.name, spec.path
                ))
            })?;
            let content = self.rendered(&profile, spec, &payload, context)?;

            let host_path = context.home.join(&spec.path);
            let previous = std::fs::read(&host_path).ok();
            let source_hash = {
                use sha2::{Digest, Sha256};
                let mut hasher = Sha256::new();
                hasher.update(&content);
                format!("{:x}", hasher.finalize())
            };

            if previous.as_deref() == Some(content.as_slice()) {
                results.push(DotfileResult {
                    path: spec.path.clone(),
                    action: DotfileAction::Skipped,
                    detail: String::new(),
                });
                let backup = previously.as_ref().and_then(|applied| {
                    applied
                        .files
                        .iter()
                        .find(|file| file.path == spec.path)
                        .and_then(|file| file.backup.clone())
                });
                managed.push(ManagedDotfile {
                    path: spec.path.clone(),
                    source_hash,
                    backup,
                });
                continue;
            }

            let mut backup: Option<String> = None;
            if previous.is_some() {
                // Three states: Some(Some) = managed with a backup to keep,
                // Some(None) = managed (Kairo created it), None = unmanaged
                // and therefore protected by the authorization gate below.
                let managed_before: Option<Option<String>> = previously
                    .as_ref()
                    .and_then(|applied| {
                        applied
                            .files
                            .iter()
                            .find(|file| file.path == spec.path)
                            .map(|file| file.backup.clone())
                    });

                if let Some(existing_backup) = managed_before {
                    backup = existing_backup;
                } else if !authorize_existing {
                    conflicts += 1;
                    results.push(DotfileResult {
                        path: spec.path.clone(),
                        action: DotfileAction::Conflicted,
                        detail: "existing file is not managed by Kairo".to_string(),
                    });
                    continue;
                } else {
                    let backup_path = self
                        .space
                        .root()
                        .join("dots-backups")
                        .join(now_ms().to_string())
                        .join(&spec.path);
                    if let Some(parent) = backup_path.parent() {
                        std::fs::create_dir_all(parent)?;
                    }
                    std::fs::copy(&host_path, &backup_path)?;
                    backup = Some(backup_path.to_string_lossy().to_string());
                }
            }

            if let Some(parent) = host_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::write(&host_path, &content)?;
            #[cfg(unix)]
            if let Some(mode) = spec.mode {
                use std::os::unix::fs::PermissionsExt;
                std::fs::set_permissions(&host_path, std::fs::Permissions::from_mode(mode))?;
            }
            #[cfg(not(unix))]
            let _ = spec.mode;

            results.push(DotfileResult {
                path: spec.path.clone(),
                action: DotfileAction::Applied,
                detail: backup
                    .as_ref()
                    .map_or_else(String::new, |backup| format!("backup: {backup}")),
            });
            managed.push(ManagedDotfile {
                path: spec.path.clone(),
                source_hash,
                backup,
            });
        }

        self.record_applied(name, context, managed)?;

        Ok(DotApplyReport {
            success: conflicts == 0,
            profile: name.to_string(),
            files: results,
        })
    }

    /// Restores every file the profile last applied: backups go back in
    /// place, files that did not exist before are removed. The home
    /// directory recorded at apply time is the restore target.
    pub fn restore(&self, name: &str, auth: &AuthContext) -> Result<Vec<DotfileResult>, CoreError> {
        self.permissions
            .require_level(auth, OperationLevel::Modify)?;
        let applied = self.load_state_for(name)?;
        let mut results = Vec::new();

        for file in &applied.files {
            let host_path = Path::new(&applied.home).join(&file.path);
            let outcome = match &file.backup {
                Some(backup) => std::fs::copy(backup, &host_path).map(|_| ()),
                None => std::fs::remove_file(&host_path),
            };
            let restored = outcome.is_ok();
            if let Err(e) = outcome {
                tracing::warn!(path = %file.path, error = %e, "failed to restore dotfile");
            }
            results.push(DotfileResult {
                path: file.path.clone(),
                action: if restored {
                    DotfileAction::Restored
                } else {
                    DotfileAction::Failed
                },
                detail: String::new(),
            });
        }

        let mut all = self.load_all_state()?;
        all.profiles.retain(|profile| profile.name != name);
        self.persist_state(&all)?;
        Ok(results)
    }

    /// Compares the last-applied rendered content against the home files.
    pub fn drift(&self, name: &str) -> Result<Vec<DotDrift>, CoreError> {
        let applied = self.load_state_for(name)?;
        let mut drift = Vec::new();

        for file in &applied.files {
            let host_path = Path::new(&applied.home).join(&file.path);
            match std::fs::read(&host_path) {
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                    drift.push(DotDrift::Missing {
                        path: file.path.clone(),
                    });
                }
                Ok(content) => {
                    use sha2::{Digest, Sha256};
                    let mut hasher = Sha256::new();
                    hasher.update(&content);
                    if format!("{:x}", hasher.finalize()) != file.source_hash {
                        drift.push(DotDrift::Modified {
                            path: file.path.clone(),
                        });
                    }
                }
                Err(e) => return Err(CoreError::Io(e)),
            }
        }
        Ok(drift)
    }

    /// Copies the saved profile directory to `target` and, when the target
    /// is not already a git repository, initializes one and commits — the
    /// git-backed export path.
    pub fn export(&self, name: &str, target: &Path) -> Result<PathBuf, CoreError> {
        let source = self.profile_dir(name);
        if !source.join("profile.json").is_file() {
            return Err(CoreError::NotFound(format!(
                "dot profile '{name}' is not saved"
            )));
        }
        let destination = target.join(name);
        copy_dir(&source, &destination)?;

        if !destination.join(".git").exists() {
            run_git(destination.as_path(), &["init", "--quiet"])?;
            run_git(destination.as_path(), &["add", "-A"])?;
            run_git(
                destination.as_path(),
                &[
                    "-c",
                    "user.name=Kairo",
                    "-c",
                    "user.email=kairo@localhost",
                    "commit",
                    "--quiet",
                    "-m",
                    "kairo dots export",
                ],
            )?;
        }
        Ok(destination)
    }

    /// Imports a profile from a git URL or a local path by cloning into the
    /// Imports a profile from a git URL or a local path by cloning into the
    /// userspace under the profile's manifest name.
    pub fn import(&self, source: &str, auth: &AuthContext) -> Result<String, CoreError> {
        self.permissions
            .require_level(auth, OperationLevel::Modify)?;
        let staging = self
            .space
            .root()
            .join("tmp")
            .join(format!("dots-import-{}", now_ms()));
        std::fs::create_dir_all(&staging)?;

        let clone = run_git(
            staging.parent().unwrap_or(Path::new("/")),
            &[
                "clone",
                "--quiet",
                source,
                staging.to_string_lossy().as_ref(),
            ],
        );
        if let Err(e) = clone {
            let _ = std::fs::remove_dir_all(&staging);
            return Err(e);
        }

        let manifest = staging.join("profile.json");
        let loaded = std::fs::read(&manifest);
        let profile: DotProfile = match loaded {
            Ok(bytes) => serde_json::from_slice(&bytes).map_err(|e| {
                let _ = std::fs::remove_dir_all(&staging);
                CoreError::InvalidArgument(format!("imported profile is invalid: {e}"))
            })?,
            Err(_) => {
                let _ = std::fs::remove_dir_all(&staging);
                return Err(CoreError::InvalidArgument(
                    "imported repository has no profile.json at its root".to_string(),
                ));
            }
        };
        if let Err(e) = validate_profile(&profile) {
            let _ = std::fs::remove_dir_all(&staging);
            return Err(e);
        }

        let dir = self.profile_dir(&profile.name);
        if dir.exists() {
            let _ = std::fs::remove_dir_all(&staging);
            return Err(CoreError::InvalidArgument(format!(
                "a profile named '{}' already exists",
                profile.name
            )));
        }
        std::fs::create_dir_all(self.profiles_root())?;
        std::fs::rename(&staging, &dir)?;
        Ok(profile.name.clone())
    }

    fn load_all_state(&self) -> Result<DotsState, CoreError> {
        Ok(
            load_state::<DotsState>(&self.state_file(), DOTS_STATE_KIND)?
                .map_or_else(DotsState::default, |doc| doc.data),
        )
    }

    fn load_state_for(&self, name: &str) -> Result<AppliedDotProfile, CoreError> {
        let all = self.load_all_state()?;
        all.profiles
            .into_iter()
            .find(|profile| profile.name == name)
            .ok_or_else(|| {
                CoreError::NotFound(format!("dot profile '{name}' has not been applied"))
            })
    }

    fn record_applied(
        &self,
        name: &str,
        context: &DotContext,
        files: Vec<ManagedDotfile>,
    ) -> Result<(), CoreError> {
        let mut all = self.load_all_state()?;
        all.profiles.retain(|profile| profile.name != name);
        all.profiles.push(AppliedDotProfile {
            name: name.to_string(),
            home: context.home.to_string_lossy().to_string(),
            applied_at_ms: now_ms(),
            files,
        });
        self.persist_state(&all)
    }

    fn persist_state(&self, state: &DotsState) -> Result<(), CoreError> {
        store_state(&self.state_file(), DOTS_STATE_KIND, state)?;
        Ok(())
    }
}

fn copy_dir(source: &Path, destination: &Path) -> Result<(), CoreError> {
    std::fs::create_dir_all(destination)?;
    for entry in std::fs::read_dir(source)? {
        let entry = entry?;
        let target = destination.join(entry.file_name());
        if entry.path().is_dir() {
            copy_dir(&entry.path(), &target)?;
        } else {
            std::fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

fn run_git(cwd: &Path, args: &[&str]) -> Result<(), CoreError> {
    let output = std::process::Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|e| {
            CoreError::InvalidArgument(format!(
                "git is required for dots import/export but could not be run: {e}"
            ))
        })?;
    if output.status.success() {
        Ok(())
    } else {
        Err(CoreError::InvalidArgument(format!(
            "git {} failed: {}",
            args.first().unwrap_or(&""),
            String::from_utf8_lossy(&output.stderr).trim()
        )))
    }
}
