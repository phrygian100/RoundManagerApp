import { Picker } from '@react-native-picker/picker';
import React, { useState } from 'react';
import { Dimensions, FlatList, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

const { width } = Dimensions.get('window');
const ITEM_HEIGHT = Platform.OS === 'web' ? 40 : 50;
const VISIBLE_ITEMS = 5;

// Generate all times from 08:00 to 18:00 in 5-minute increments
const generateTimeSlots = () => {
  const times = [];
  for (let hour = 8; hour <= 18; hour++) {
    for (let minute = 0; minute < 60; minute += 5) {
      const timeString = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      times.push(timeString);
    }
  }
  return times;
};

const timeSlots = generateTimeSlots();

interface TimePickerModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (time: string) => void;
  initialTime?: string;
  previousJobEta?: string;
}

const TimePickerModal: React.FC<TimePickerModalProps> = ({ 
  visible, 
  onClose, 
  onConfirm, 
  initialTime,
  previousJobEta 
}) => {
  // Determine the initial selection: use initialTime if set, otherwise previousJobEta, otherwise 09:00
  const defaultTime = initialTime || previousJobEta || '09:00';
  const [selectedTime, setSelectedTime] = useState(defaultTime);

  const handleConfirm = () => {
    onConfirm(selectedTime);
  };

  const renderItem = ({ item }: { item: string }) => {
    const isSelected = item === selectedTime;
    return (
      <Pressable
        onPress={() => setSelectedTime(item)}
        style={[styles.item, isSelected && styles.selectedItem]}
      >
        <Text style={[styles.itemText, isSelected && styles.selectedItemText]}>{item}</Text>
      </Pressable>
    );
  };

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        <View style={styles.pickerContainer}>
          <Text style={styles.title}>Select ETA</Text>
          {previousJobEta && !initialTime && (
            <Text style={styles.contextText}>Previous job: {previousJobEta}</Text>
          )}

          {Platform.OS === 'web' ? (
            <View style={{ marginVertical: 16 }}>
              <Picker
                selectedValue={selectedTime}
                onValueChange={(val) => setSelectedTime(val as string)}
                style={{ width: 200, height: 44 }}
              >
                {timeSlots.map((time) => (
                  <Picker.Item key={time} label={time} value={time} />
                ))}
              </Picker>
            </View>
          ) : (
            <FlatList
              data={timeSlots}
              renderItem={renderItem}
              keyExtractor={(item) => item}
              showsVerticalScrollIndicator={false}
              snapToInterval={ITEM_HEIGHT}
              decelerationRate="fast"
              onMomentumScrollEnd={(e) => {
                const index = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
                setSelectedTime(timeSlots[index]);
              }}
              getItemLayout={(_, index) => ({
                length: ITEM_HEIGHT,
                offset: ITEM_HEIGHT * index,
                index,
              })}
              initialScrollIndex={timeSlots.indexOf(defaultTime)}
              contentContainerStyle={styles.listContentContainer}
              style={styles.timeList}
            />
          )}

          <View style={styles.buttonContainer}>
            <Pressable onPress={onClose} style={[styles.button, styles.cancelButton]}>
              <Text style={styles.buttonText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={handleConfirm} style={[styles.button, styles.confirmButton]}>
              <Text style={styles.buttonText}>Confirm</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  pickerContainer: {
    width: Platform.OS === 'web' ? 400 : width * 0.8,
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  contextText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 10,
  },
  timeList: {
    height: ITEM_HEIGHT * VISIBLE_ITEMS,
    width: '100%',
  },
  listContentContainer: {
    paddingVertical: ITEM_HEIGHT * Math.floor(VISIBLE_ITEMS / 2),
  },
  item: {
    height: ITEM_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  selectedItem: {
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
  },
  itemText: {
    fontSize: Platform.OS === 'web' ? 18 : 24,
    color: '#ccc',
  },
  selectedItemText: {
    fontSize: Platform.OS === 'web' ? 22 : 30,
    color: '#000',
    fontWeight: 'bold',
  },
  buttonContainer: {
    flexDirection: 'row',
    marginTop: 20,
    width: '100%',
    justifyContent: 'space-between',
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    flex: 0.48,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f44336',
  },
  confirmButton: {
    backgroundColor: '#4CAF50',
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
});

export default TimePickerModal; 