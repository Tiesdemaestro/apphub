import Storage from 'expo-sqlite/kv-store';
import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { createProjectStorage, projectKey } from '../core/storage';
import type { ProjectMedia, ProjectProps } from './types';

function createProjectMedia(projectId: string, photosAllowed: boolean): ProjectMedia {
  projectKey(projectId, 'media');
  const directory = new Directory(Paths.document, 'apphub', projectId, 'photos');
  function photoFile(reference: string): File | null {
    if (!photosAllowed || !reference.startsWith('apphub-photo:')) return null;
    const filename = reference.slice('apphub-photo:'.length);
    if (!/^[a-zA-Z0-9-]+\.(jpg|jpeg|png|heic|heif|webp)$/.test(filename)) return null;
    return new File(directory, filename);
  }
  return {
    async pickPhoto() {
      if (!photosAllowed) throw new Error('Dit project heeft geen fotofunctie.');
      let target: File | undefined;
      try {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'], allowsEditing: false, quality: 0.8,
        });
        if (result.canceled) return null;
        const asset = result.assets[0];
        if (!asset) throw new Error('Er is geen foto geselecteerd.');
        if (asset.fileSize && asset.fileSize > 20_000_000) throw new Error('Kies een foto kleiner dan 20 MB.');
        directory.create({ intermediates: true, idempotent: true });
        const extension = /\.(jpe?g|png|heic|heif|webp)$/i.exec(asset.uri)?.[1]?.toLowerCase() ?? 'jpg';
        const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 12)}.${extension}`;
        target = new File(directory, filename);
        await new File(asset.uri).copy(target);
        if (target.size > 20_000_000) {
          throw new Error('Kies een foto kleiner dan 20 MB.');
        }
        return `apphub-photo:${filename}`;
      } catch (error) {
        try { if (target?.exists) target.delete(); } catch { /* Preserve the useful original error. */ }
        throw new Error(error instanceof Error && error.message.includes('20 MB')
          ? error.message : 'De foto kon niet worden toegevoegd. Probeer opnieuw of controleer fototoegang in Instellingen.');
      }
    },
    resolvePhoto(reference) { return photoFile(reference)?.uri ?? null; },
    async removePhoto(reference: string) {
      const file = photoFile(reference);
      if (!file) throw new Error('Deze foto hoort niet bij dit project.');
      if (file.exists) file.delete();
    },
  };
}

export function createNativeSDK(projectId: string, photosAllowed = false): ProjectProps {
  return {
    storage: createProjectStorage(projectId, Storage),
    media: createProjectMedia(projectId, photosAllowed),
  };
}
