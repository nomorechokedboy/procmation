const KB = 1024;
const MB = KB * 1024;

// "1.2 MB", "340 KB", "12 B"
export function formatSize(bytes: number): string {
  if (bytes >= MB) {
    return `${(bytes / MB).toFixed(1)} MB`;
  }
  if (bytes >= KB) {
    return `${Math.round(bytes / KB)} KB`;
  }
  return `${bytes} B`;
}
