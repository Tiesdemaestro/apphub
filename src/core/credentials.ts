import * as SecureStore from 'expo-secure-store';
const KEY = 'apphub.github.token.v1';
export function getGithubToken() { return SecureStore.getItemAsync(KEY); }
export async function saveGithubToken(token: string) {
  const value = token.trim();
  if (!/^[A-Za-z0-9_]{20,255}$/.test(value)) throw new Error('Plak een geldig GitHub-token zonder spaties.');
  await SecureStore.setItemAsync(KEY, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
}
export function deleteGithubToken() { return SecureStore.deleteItemAsync(KEY); }
