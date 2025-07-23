import React, { useEffect, useState } from 'react';
import { Alert, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { ThemedText } from './ThemedText';

interface GoCardlessApiTokenModalProps {
  visible: boolean;
  onClose: () => void;
  currentToken?: string;
  onSave: (token: string) => Promise<void>;
}

export default function GoCardlessApiTokenModal({
  visible,
  onClose,
  currentToken,
  onSave
}: GoCardlessApiTokenModalProps) {
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);

  // Initialize modal with current token
  useEffect(() => {
    setToken(currentToken || '');
  }, [currentToken]);

  const handleSave = async () => {
    if (!token.trim()) {
      Alert.alert('Error', 'GoCardless API token is required.');
      return;
    }

    // Basic validation for GoCardless API token format
    if (!token.trim().startsWith('live_') && !token.trim().startsWith('sandbox_')) {
      Alert.alert(
        'Invalid Token Format',
        'GoCardless API tokens should start with "live_" or "sandbox_". Please check your token and try again.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Continue Anyway', onPress: () => saveToken() }
        ]
      );
      return;
    }

    await saveToken();
  };

  const saveToken = async () => {
    setSaving(true);
    try {
      await onSave(token.trim());
      
      // Show success message
      if (Platform.OS === 'web') {
        alert('GoCardless API token saved successfully!');
      } else {
        Alert.alert('Success', 'GoCardless API token saved successfully!');
      }
      
      onClose();
    } catch (error) {
      console.error('Error saving GoCardless API token:', error);
      Alert.alert('Error', 'Failed to save API token. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (saving) return; // Prevent closing while saving
    
    // Reset to original values
    setToken(currentToken || '');
    onClose();
  };

  const handleClearToken = () => {
    Alert.alert(
      'Clear API Token',
      'Are you sure you want to clear the GoCardless API token? This will disable GoCardless integration for your account.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            setToken('');
          }
        }
      ]
    );
  };

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={handleClose}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalView}>
          <ThemedText type="title" style={styles.modalTitle}>
            GoCardless API Configuration
          </ThemedText>
          
          <ThemedText style={styles.description}>
            Enter your GoCardless API token to enable direct debit integration for your account.
          </ThemedText>

          {/* API Token Field */}
          <View style={styles.inputGroup}>
            <ThemedText style={styles.inputLabel}>
              GoCardless API Token *
            </ThemedText>
            {Platform.OS === 'web' ? (
              <input
                style={styles.textInput}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="e.g., live_1234567890abcdef..."
                type="password"
                disabled={saving}
              />
            ) : (
              <TextInput
                style={styles.textInput}
                value={token}
                onChangeText={setToken}
                placeholder="e.g., live_1234567890abcdef..."
                placeholderTextColor="#999"
                secureTextEntry={true}
                editable={!saving}
              />
            )}
          </View>

          {/* Security Warning */}
          <View style={styles.warningContainer}>
            <ThemedText style={styles.warningText}>
              ⚠️ Security Notice: Your API token will be stored securely and used only for GoCardless operations. Never share this token with others.
            </ThemedText>
          </View>

          {/* Token Status */}
          {token && (
            <View style={styles.statusContainer}>
              <ThemedText style={styles.statusLabel}>
                Token Type:
              </ThemedText>
              <ThemedText style={[
                styles.statusValue,
                token.startsWith('live_') ? styles.liveToken : styles.sandboxToken
              ]}>
                {token.startsWith('live_') ? 'Live Environment' : 'Sandbox Environment'}
              </ThemedText>
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.buttonRow}>
            <Pressable
              style={[styles.button, styles.cancelButton]}
              onPress={handleClose}
              disabled={saving}
            >
              <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
            </Pressable>
            
            {token && (
              <Pressable
                style={[styles.button, styles.clearButton]}
                onPress={handleClearToken}
                disabled={saving}
              >
                <ThemedText style={styles.clearButtonText}>Clear</ThemedText>
              </Pressable>
            )}
            
            <Pressable
              style={[
                styles.button,
                styles.saveButton,
                saving && styles.disabledButton
              ]}
              onPress={handleSave}
              disabled={saving}
            >
              <ThemedText style={styles.saveButtonText}>
                {saving ? 'Saving...' : 'Save'}
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalView: {
    margin: 20,
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 35,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    width: '90%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: 'white',
  },
  warningContainer: {
    backgroundColor: '#fff3cd',
    borderWidth: 1,
    borderColor: '#ffeaa7',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  warningText: {
    fontSize: 12,
    color: '#856404',
    lineHeight: 16,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginRight: 8,
  },
  statusValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  liveToken: {
    color: '#dc3545',
  },
  sandboxToken: {
    color: '#28a745',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  button: {
    flex: 1,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  cancelButton: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#dee2e6',
  },
  clearButton: {
    backgroundColor: '#dc3545',
  },
  saveButton: {
    backgroundColor: '#007AFF',
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
  cancelButtonText: {
    color: '#6c757d',
    fontSize: 16,
    fontWeight: '500',
  },
  clearButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '500',
  },
  saveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '500',
  },
}); 