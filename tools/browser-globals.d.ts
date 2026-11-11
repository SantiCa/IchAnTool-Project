interface DesktopDiagnosticsStatus { enabled: boolean; expiresAt: number; bytes: number; failed: boolean; }
interface DesktopDiagnosticsBridge {
  status(): Promise<DesktopDiagnosticsStatus>;
  setEnabled(enabled: boolean): Promise<DesktopDiagnosticsStatus>;
  record(event: Record<string, unknown>): void;
  export(): Promise<{ saved: boolean }>;
  clear(): Promise<DesktopDiagnosticsStatus>;
  onStatus(callback: (status: DesktopDiagnosticsStatus) => void): () => void;
}

interface Window {
  ichantool?: { S: typeof import('../app/js/state.js').S; ready: Promise<void>; [key: string]: unknown };
  showDirectoryPicker?: (options?: { id?: string; mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
  ICHANTOOL_ASSETS?: Record<string, string>;
  ort?: import('../app/js/unetmodel.js').UnetRuntime & {
    env: { wasm: { wasmPaths: string; numThreads: number } };
  };
}
