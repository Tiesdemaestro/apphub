export interface ProjectStorage {
  getItem<T>(key: string): Promise<T | null>;
  setItem<T>(key: string, value: T): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface ProjectMedia {
  /** Returns a portable project-scoped reference, not an absolute iOS file URI. */
  pickPhoto(): Promise<string | null>;
  resolvePhoto(reference: string): string | null;
  removePhoto(reference: string): Promise<void>;
}

export interface ProjectProps {
  storage: ProjectStorage;
  media: ProjectMedia;
  onBusyChange?(busy: boolean): void;
}
