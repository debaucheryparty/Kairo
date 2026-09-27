fn main() -> Result<(), Box<dyn std::error::Error>> {
    prost_build::compile_protos(
        &[
            "../../proto/kairo/v1/common.proto",
            "../../proto/kairo/v1/handshake.proto",
            "../../proto/kairo/v1/filesystem.proto",
            "../../proto/kairo/v1/terminal.proto",
            "../../proto/kairo/v1/process.proto",
            "../../proto/kairo/v1/metrics.proto",
        ],
        &["../../proto"],
    )?;
    Ok(())
}
