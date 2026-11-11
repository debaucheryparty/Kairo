pub mod apt;
pub mod pacman;
pub mod unsupported;
pub mod validation;

pub use apt::AptPackageManager;
pub use pacman::PacmanPackageManager;
pub use unsupported::UnsupportedPackageManager;
pub use validation::{validate_package_name, validate_package_names};
