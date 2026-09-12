// The base YAML is shared configuration, not a release entry point. Prevent a
// direct electron-builder invocation from silently packaging with stable IDs.
exports.default = async function checkPackage(context) {
  const channel = context.packager.info.metadata.releaseChannel;
  if (channel !== "stable" && channel !== "early-access") {
    throw new Error("Use bun run package:win v1.2.3[-beta.1] to select the release identity");
  }
};
