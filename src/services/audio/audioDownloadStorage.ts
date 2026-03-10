import * as FileSystem from 'expo-file-system/legacy';
import type { AudioFileSystemAdapter } from './audioDownloadService';

export const AUDIO_DOWNLOAD_ROOT_URI = `${
  FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? 'file:///'
}everybible-audio/`;

export const expoAudioFileSystemAdapter: AudioFileSystemAdapter = {
  ensureDirectory: async (directoryUri) => {
    await FileSystem.makeDirectoryAsync(directoryUri, { intermediates: true });
  },
  fileExists: async (fileUri) => {
    const info = await FileSystem.getInfoAsync(fileUri);
    return info.exists;
  },
  downloadFile: async (from, to) => {
    await FileSystem.downloadAsync(from, to);
  },
};
