fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("cargo:rerun-if-changed=../../proto/kairo/v1/common.proto");
    println!("cargo:rerun-if-changed=../../proto/kairo/v1/handshake.proto");
    println!("cargo:rerun-if-changed=../../proto/kairo/v1/filesystem.proto");
    println!("cargo:rerun-if-changed=../../proto/kairo/v1/terminal.proto");
    println!("cargo:rerun-if-changed=../../proto/kairo/v1/process.proto");
    println!("cargo:rerun-if-changed=../../proto/kairo/v1/metrics.proto");
    println!("cargo:rerun-if-changed=../../proto/kairo/v1/system.proto");

    prost_build::compile_protos(
        &[
            "../../proto/kairo/v1/common.proto",
            "../../proto/kairo/v1/handshake.proto",
            "../../proto/kairo/v1/filesystem.proto",
            "../../proto/kairo/v1/terminal.proto",
            "../../proto/kairo/v1/process.proto",
            "../../proto/kairo/v1/metrics.proto",
            "../../proto/kairo/v1/system.proto",
        ],
        &["../../proto"],
    )?;
    Ok(())
}
