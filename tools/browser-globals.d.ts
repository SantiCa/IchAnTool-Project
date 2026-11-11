interface Window {
  showDirectoryPicker?: (options?: { id?: string; mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
  ICHANTOOL_ASSETS?: Record<string, string>;
  ort?: import('../app/js/unetmodel.js').UnetRuntime & {
    env: { wasm: { wasmPaths: string; numThreads: number } };
  };
}
