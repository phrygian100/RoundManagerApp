import { getFunctions, httpsCallable } from 'firebase/functions';

export type AgentApiKeyMeta = {
  keyId: string;
  label: string;
  createdAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export async function createAgentApiKey(label: string): Promise<{ keyId: string; key: string }> {
  const fn = httpsCallable(getFunctions(), 'createAgentApiKey');
  const result = await fn({ label });
  return result.data as { keyId: string; key: string };
}

export async function listAgentApiKeys(): Promise<AgentApiKeyMeta[]> {
  const fn = httpsCallable(getFunctions(), 'listAgentApiKeys');
  const result = await fn({});
  return (result.data as { keys: AgentApiKeyMeta[] }).keys;
}

export async function revokeAgentApiKey(keyId: string): Promise<void> {
  const fn = httpsCallable(getFunctions(), 'revokeAgentApiKey');
  await fn({ keyId });
}
