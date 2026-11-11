interface Window {
  ICHANTOOL_ASSETS?: Record<string, string>;
  ort?: import('../app/js/unetmodel.js').UnetRuntime & {
    env: { wasm: { wasmPaths: string; numThreads: number } };
  };
}
