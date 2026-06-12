import { api } from '@/lib/api';

export async function downloadBlob(path: string, filename: string): Promise<void> {
  const { data } = await api.get<Blob>(path, { responseType: 'blob' });
  const url = URL.createObjectURL(data);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
