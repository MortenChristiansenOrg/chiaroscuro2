// koffi is a Windows-only native FFI module installed at runtime, not in dev dependencies.
// This declaration provides minimal types so tsc doesn't error on the dynamic require.
declare module "koffi" {
  function load(lib: string): KoffiLib;
  function pointer(name: string, type: unknown): unknown;
  function opaque(): unknown;
  // biome-ignore lint/suspicious/noExplicitAny: FFI callback types are opaque
  function proto(name: string, returnType: unknown, argTypes: unknown[]): any;

  interface KoffiLib {
    // biome-ignore lint/suspicious/noExplicitAny: FFI function signatures are dynamic
    func(signature: string): any;
    // biome-ignore lint/suspicious/noExplicitAny: FFI function signatures are dynamic
    func(name: string, returnType: unknown, argTypes: unknown[]): any;
  }
}
