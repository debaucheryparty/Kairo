use crate::error::BridgeError;

pub fn validate_package_name(name: &str) -> Result<(), BridgeError> {
    if name.is_empty() {
        return Err(BridgeError::InvalidPackageName {
            name: String::new(),
            reason: "package name cannot be empty".to_string(),
        });
    }

    if name.len() > 128 {
        return Err(BridgeError::InvalidPackageName {
            name: name.to_string(),
            reason: format!("package name exceeds 128 characters (len={})", name.len()),
        });
    }

    let first = name.chars().next().unwrap_or('\0');
    if !first.is_ascii_alphanumeric() {
        return Err(BridgeError::InvalidPackageName {
            name: name.to_string(),
            reason: "package name must start with an alphanumeric character".to_string(),
        });
    }

    for c in name.chars() {
        if !c.is_ascii_alphanumeric() && !matches!(c, '+' | '.' | '-' | '_') {
            return Err(BridgeError::InvalidPackageName {
                name: name.to_string(),
                reason: format!("illegal character '{c}' in package name"),
            });
        }
    }

    Ok(())
}

pub fn validate_package_names(names: &[&str]) -> Result<(), BridgeError> {
    if names.is_empty() {
        return Err(BridgeError::InvalidPackageName {
            name: String::new(),
            reason: "package list cannot be empty".to_string(),
        });
    }

    for name in names {
        validate_package_name(name)?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_package_names() {
        let valids = [
            "curl",
            "libssl-dev",
            "g++",
            "python3.11",
            "gcc_arm_none_eabi",
            "zlib1g-dev",
            "linux-headers-6.6.0-14-amd64",
        ];
        for v in valids {
            assert!(validate_package_name(v).is_ok(), "should be valid: {v}");
        }
    }

    #[test]
    fn test_invalid_package_names() {
        let invalids = [
            "",
            " ",
            "curl; rm -rf /",
            "curl && wget",
            "curl|bash",
            "pkg`id`",
            "pkg$(whoami)",
            "-invalid-start",
            "+invalid-start",
            "pkg with spaces",
            "pkg/name",
            "pkg\nnewline",
        ];
        for inv in invalids {
            assert!(
                validate_package_name(inv).is_err(),
                "should be rejected: {inv}"
            );
        }
    }
}
