import React, { useEffect, useState } from 'react';
import { Alert, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import type { Client } from '../types/client';
import { ThemedText } from './ThemedText';

interface GoCardlessSettingsModalProps {
  visible: boolean;
  onClose: () => void;
  client: Client | null;
  onSave: (settings: { enabled: boolean; customerId: string }) => Promise<void>;
}

export default function GoCardlessSettingsModal({
  visible,
  onClose,
  client,
  onSave
}: GoCardlessSettingsModalProps) {
  const [enabled, setEnabled] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [saving, setSaving] = useState(false);

  const alertUser = (title: string, message: string) => {
    // On web, React Native's Alert.alert can be unreliable. Use window.alert for consistency.
    if (Platform.OS === 'web') {
      window.alert(message);
      return;
    }
    Alert.alert(title, message);
  };

  // Initialize modal with current client settings
  useEffect(() => {
    if (client) {
      setEnabled(client.gocardlessEnabled || false);
      setCustomerId(client.gocardlessCustomerId || '');
    }
  }, [client]);

  const handleToggle = () => {
    if (enabled && customerId.trim()) {
      // Show warning when disabling
      const message =
        'Are you sure you want to disable GoCardless for this client? This will clear the Customer ID.';

      // On web, Alert.alert can fail to render; use window.confirm.
      if (Platform.OS === 'web') {
        const confirmed = window.confirm(message);
        if (confirmed) {
          setEnabled(false);
          setCustomerId('');
        }
        return;
      }

      Alert.alert('Disable GoCardless', message, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disable',
          style: 'destructive',
          onPress: () => {
            setEnabled(false);
            setCustomerId('');
          }
        }
      ]);
    } else {
      setEnabled(!enabled);
      if (!enabled) {
        setCustomerId('');
      }
    }
  };

  const handleSave = async () => {
    if (enabled && !customerId.trim()) {
      alertUser('Error', 'GoCardless Customer ID is required when enabled.');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        enabled,
        customerId: customerId.trim()
      });
      
      // Show success message
      if (Platform.OS === 'web') {
        alert('Saved');
      } else {
        Alert.alert('Success', 'Saved');
      }
      
      onClose();
    } catch (error) {
      console.error('Error saving GoCardless settings:', error);
      alertUser('Error', 'Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (saving) return; // Prevent closing while saving
    
    // Reset to original values
    if (client) {
      setEnabled(client.gocardlessEnabled || false);
      setCustomerId(client.gocardlessCustomerId || '');
    }
    onClose();
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
            GoCardless Settings
          </ThemedText>
          
          {client && (
            <ThemedText style={styles.clientName}>
              {client.name}
            </ThemedText>
          )}

          {/* Toggle Switch */}
          <View style={styles.settingRow}>
            <ThemedText style={styles.settingLabel}>
              GoCardless Customer:
            </ThemedText>
            <Pressable
              style={[
                styles.toggleSwitch,
                enabled ? styles.toggleOn : styles.toggleOff
              ]}
              onPress={handleToggle}
              disabled={saving}
            >
              <View style={[
                styles.toggleThumb,
                enabled ? styles.toggleThumbOn : styles.toggleThumbOff
              ]} />
            </Pressable>
            <ThemedText style={styles.toggleText}>
              {enabled ? 'True' : 'False'}
            </ThemedText>
          </View>

          {/* Customer ID Field */}
          {enabled && (
            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>
                GoCardless Customer ID *
              </ThemedText>
              {Platform.OS === 'web' ? (
                <input
                  style={styles.textInput}
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  placeholder="e.g., CU002JZC3KX3Q1"
                  disabled={saving}
                />
              ) : (
                <TextInput
                  style={styles.textInput}
                  value={customerId}
                  onChangeText={setCustomerId}
                  placeholder="e.g., CU002JZC3KX3Q1"
                  placeholderTextColor="#999"
                  editable={!saving}
                />
              )}
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
  clientName: {
    fontSize: 16,
    marginBottom: 20,
    textAlign: 'center',
    color: '#666',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    justifyContent: 'space-between',
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
  },
  toggleSwitch: {
    width: 50,
    height: 30,
    borderRadius: 15,
    padding: 2,
    marginHorizontal: 10,
  },
  toggleOn: {
    backgroundColor: '#007AFF',
  },
  toggleOff: {
    backgroundColor: '#E5E5EA',
  },
  toggleThumb: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  toggleThumbOn: {
    backgroundColor: 'white',
    transform: [{ translateX: 20 }],
  },
  toggleThumbOff: {
    backgroundColor: 'white',
    transform: [{ translateX: 0 }],
  },
  toggleText: {
    fontSize: 16,
    fontWeight: '500',
    minWidth: 40,
    textAlign: 'center',
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
  saveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '500',
  },
}); 