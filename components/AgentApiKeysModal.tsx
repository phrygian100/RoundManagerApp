import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { AgentApiKeyMeta, createAgentApiKey, listAgentApiKeys, revokeAgentApiKey } from '../services/agentApiKeyService';
import { ThemedText } from './ThemedText';

interface AgentApiKeysModalProps {
  visible: boolean;
  onClose: () => void;
}

const API_BASE_URL = 'https://us-central1-roundmanagerapp.cloudfunctions.net/agentApi';

function showMessage(title: string, message: string) {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
}

async function confirmAction(title: string, message: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    return window.confirm(`${title}\n\n${message}`);
  }
  return new Promise<boolean>((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Revoke', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

function formatDate(iso: string | null): string {
  if (!iso) return 'never';
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

export default function AgentApiKeysModal({ visible, onClose }: AgentApiKeysModalProps) {
  const [keys, setKeys] = useState<AgentApiKeyMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [minting, setMinting] = useState(false);
  const [label, setLabel] = useState('');
  // The plaintext key, shown exactly once after minting.
  const [newKey, setNewKey] = useState<{ keyId: string; key: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const loadKeys = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listAgentApiKeys();
      setKeys(result);
    } catch (error) {
      console.error('Error loading agent API keys:', error);
      showMessage('Error', 'Could not load your API keys. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      setNewKey(null);
      setCopied(false);
      setLabel('');
      loadKeys();
    }
  }, [visible, loadKeys]);

  const handleMint = async () => {
    setMinting(true);
    try {
      const result = await createAgentApiKey(label.trim() || `Key created ${new Date().toLocaleDateString('en-GB')}`);
      setNewKey(result);
      setCopied(false);
      setLabel('');
      await loadKeys();
    } catch (error: any) {
      console.error('Error creating agent API key:', error);
      const message = error?.message || 'Failed to create the key. Please try again.';
      showMessage('Error', message);
    } finally {
      setMinting(false);
    }
  };

  const handleCopy = async () => {
    if (!newKey) return;
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(newKey.key);
        setCopied(true);
        return;
      } catch {
        // fall through to manual instruction
      }
    }
    showMessage('Copy the key', 'Select the key text and copy it manually.');
  };

  const handleRevoke = async (key: AgentApiKeyMeta) => {
    const confirmed = await confirmAction(
      'Revoke key',
      `Revoke "${key.label || key.keyId}"? Anything using this key will immediately lose access. This cannot be undone.`
    );
    if (!confirmed) return;
    try {
      await revokeAgentApiKey(key.keyId);
      await loadKeys();
    } catch (error) {
      console.error('Error revoking agent API key:', error);
      showMessage('Error', 'Failed to revoke the key. Please try again.');
    }
  };

  const activeKeys = keys.filter((k) => !k.revokedAt);
  const revokedKeys = keys.filter((k) => !!k.revokedAt);

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <ThemedText style={styles.title}>AI Assistant API Keys</ThemedText>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            <ThemedText style={styles.explainer}>
              API keys let an AI assistant (like ChatGPT, Claude, or another automation tool running on
              your computer) securely manage your Guvnor account on your behalf: looking up clients and
              balances, recording payments, completing or rescheduling jobs, and sending payment reminder
              emails.
            </ThemedText>
            <ThemedText style={styles.explainer}>
              A key only ever grants access to your own account&apos;s data. Every change made with a key is
              recorded in an audit trail, and keys cannot delete anything. Treat a key like a password:
              anyone who has it can act on your account. If a key leaks, revoke it here immediately.
            </ThemedText>
            <ThemedText style={styles.explainerSmall}>
              Your assistant should send requests to: {API_BASE_URL}/&lt;action&gt; with the header
              &quot;Authorization: Bearer &lt;key&gt;&quot;.
            </ThemedText>

            {newKey && (
              <View style={styles.newKeyBox}>
                <ThemedText style={styles.newKeyTitle}>Your new key (shown only once)</ThemedText>
                <ThemedText style={styles.newKeyWarning}>
                  Copy it now and store it somewhere safe. For security we only keep a fingerprint, so it
                  cannot be shown again.
                </ThemedText>
                <TextInput
                  style={styles.newKeyInput}
                  value={newKey.key}
                  editable={false}
                  selectTextOnFocus
                  multiline={Platform.OS !== 'web'}
                />
                <Pressable style={styles.copyButton} onPress={handleCopy}>
                  <ThemedText style={styles.copyButtonText}>{copied ? 'Copied ✓' : 'Copy key'}</ThemedText>
                </Pressable>
              </View>
            )}

            <View style={styles.mintRow}>
              <TextInput
                style={styles.labelInput}
                placeholder="Key name (e.g. My AI assistant)"
                placeholderTextColor="#9ca3af"
                value={label}
                onChangeText={setLabel}
                editable={!minting}
              />
              <Pressable
                style={[styles.mintButton, minting && styles.buttonDisabled]}
                onPress={handleMint}
                disabled={minting}
              >
                <ThemedText style={styles.mintButtonText}>{minting ? 'Creating...' : 'Generate New Key'}</ThemedText>
              </Pressable>
            </View>

            <ThemedText style={styles.listHeader}>Active keys</ThemedText>
            {loading ? (
              <ActivityIndicator style={{ marginVertical: 12 }} />
            ) : activeKeys.length === 0 ? (
              <ThemedText style={styles.emptyText}>No active keys.</ThemedText>
            ) : (
              activeKeys.map((k) => (
                <View key={k.keyId} style={styles.keyRow}>
                  <View style={styles.keyInfo}>
                    <ThemedText style={styles.keyLabel}>{k.label || 'Unnamed key'}</ThemedText>
                    <ThemedText style={styles.keyMeta}>
                      Created {formatDate(k.createdAt)} · Last used {formatDate(k.lastUsedAt)}
                    </ThemedText>
                  </View>
                  <Pressable style={styles.revokeButton} onPress={() => handleRevoke(k)}>
                    <ThemedText style={styles.revokeButtonText}>Revoke</ThemedText>
                  </Pressable>
                </View>
              ))
            )}

            {revokedKeys.length > 0 && (
              <>
                <ThemedText style={styles.listHeader}>Revoked keys</ThemedText>
                {revokedKeys.map((k) => (
                  <View key={k.keyId} style={[styles.keyRow, styles.keyRowRevoked]}>
                    <View style={styles.keyInfo}>
                      <ThemedText style={[styles.keyLabel, styles.keyLabelRevoked]}>{k.label || 'Unnamed key'}</ThemedText>
                      <ThemedText style={styles.keyMeta}>Revoked {formatDate(k.revokedAt)}</ThemedText>
                    </View>
                  </View>
                ))}
              </>
            )}
          </ScrollView>

          <Pressable style={styles.closeButton} onPress={onClose}>
            <ThemedText style={styles.closeButtonText}>Close</ThemedText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    width: '100%',
    maxWidth: 560,
    maxHeight: '90%',
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#1a1a1a',
  },
  body: {
    flexGrow: 0,
  },
  explainer: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 10,
    lineHeight: 20,
  },
  explainerSmall: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 16,
    lineHeight: 18,
  },
  newKeyBox: {
    backgroundColor: '#eef2ff',
    borderColor: '#4f46e5',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  newKeyTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#3730a3',
    marginBottom: 4,
  },
  newKeyWarning: {
    fontSize: 12,
    color: '#4338ca',
    marginBottom: 8,
    lineHeight: 17,
  },
  newKeyInput: {
    borderWidth: 1,
    borderColor: '#c7d2fe',
    borderRadius: 6,
    backgroundColor: '#fff',
    padding: 8,
    fontSize: 12,
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
    color: '#111827',
    marginBottom: 8,
  },
  copyButton: {
    backgroundColor: '#4f46e5',
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
  },
  copyButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  mintRow: {
    marginBottom: 16,
  },
  labelInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    marginBottom: 8,
    color: '#111827',
  },
  mintButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#9ca3af',
  },
  mintButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
  listHeader: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginTop: 4,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 12,
  },
  keyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  keyRowRevoked: {
    opacity: 0.6,
  },
  keyInfo: {
    flex: 1,
    marginRight: 8,
  },
  keyLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  keyLabelRevoked: {
    textDecorationLine: 'line-through',
  },
  keyMeta: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  revokeButton: {
    backgroundColor: '#fee2e2',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  revokeButtonText: {
    color: '#b91c1c',
    fontWeight: '600',
    fontSize: 13,
  },
  closeButton: {
    marginTop: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    paddingVertical: 10,
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#374151',
    fontWeight: '600',
    fontSize: 15,
  },
});
