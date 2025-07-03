import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { addDoc, collection, deleteDoc, doc, getDocs } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { Button, FlatList, Modal, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { db } from '../core/firebase';
// ... import Firestore and navigation helpers ...

type Quote = {
  id: string;
  name: string;
  address: string;
  town: string;
  number: string;
  date: string;
};

export default function QuotesScreen() {
  const router = useRouter();
  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState({ name: '', address: '', town: '', number: '', date: '' });
  const [quotes, setQuotes] = useState<Quote[]>([]); // TODO: fetch from Firestore
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    const fetchQuotes = async () => {
      const snap = await getDocs(collection(db, 'quotes'));
      setQuotes(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Quote));
    };
    fetchQuotes();
  }, []);

  const handleCreateQuote = async () => {
    // Save quote to Firestore
    const docRef = await addDoc(collection(db, 'quotes'), form);
    // Create a 'Quote' job on the runsheet for the selected date
    await addDoc(collection(db, 'jobs'), {
      clientId: null,
      scheduledTime: form.date + 'T09:00:00',
      status: 'pending',
      type: 'quote',
      label: 'Quote',
      name: form.name,
      address: form.address,
      town: form.town,
      number: form.number,
      quoteId: docRef.id,
    });
    setModalVisible(false);
    setForm({ name: '', address: '', town: '', number: '', date: '' });
    // Refresh quotes
    const snap = await getDocs(collection(db, 'quotes'));
    setQuotes(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Quote));
  };

  const handleDeleteQuote = async (id: string) => {
    await deleteDoc(doc(db, 'quotes', id));
    // Refresh quotes
    const snap = await getDocs(collection(db, 'quotes'));
    setQuotes(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Quote));
  };

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Button title="Home" onPress={() => router.push('/')} />
      <Button title="Create New Quote" onPress={() => setModalVisible(true)} />
      <FlatList
        data={quotes}
        keyExtractor={(item: Quote) => item.id}
        renderItem={({ item }: { item: Quote }) => (
          <TouchableOpacity>
            <Text>{item.name} - {item.address}, {item.town} ({item.date})</Text>
            <Button title="Delete" onPress={() => handleDeleteQuote(item.id)} color="red" />
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text>No quotes yet.</Text>}
      />
      <Modal visible={modalVisible} animationType="slide">
        <View style={{ flex: 1, justifyContent: 'center', padding: 20 }}>
          <Text style={{ fontSize: 20, marginBottom: 10 }}>New Quote</Text>
          <TextInput placeholder="Name" value={form.name} onChangeText={v => setForm(f => ({ ...f, name: v }))} style={{ borderWidth: 1, marginBottom: 8, padding: 8 }} />
          <TextInput placeholder="Address" value={form.address} onChangeText={v => setForm(f => ({ ...f, address: v }))} style={{ borderWidth: 1, marginBottom: 8, padding: 8 }} />
          <TextInput placeholder="Town" value={form.town} onChangeText={v => setForm(f => ({ ...f, town: v }))} style={{ borderWidth: 1, marginBottom: 8, padding: 8 }} />
          <TextInput placeholder="Number" value={form.number} onChangeText={v => setForm(f => ({ ...f, number: v }))} style={{ borderWidth: 1, marginBottom: 8, padding: 8 }} />
          <TouchableOpacity onPress={() => setShowDatePicker(true)} style={{ borderWidth: 1, marginBottom: 8, padding: 8, backgroundColor: '#f0f0f0' }}>
            <Text>{form.date ? form.date : 'Select Date'}</Text>
          </TouchableOpacity>
          {showDatePicker && (
            Platform.OS === 'web' ? (
              <input
                type="date"
                value={form.date}
                onChange={e => {
                  setForm(f => ({ ...f, date: e.target.value }));
                  setShowDatePicker(false);
                }}
                style={{ marginBottom: 8, padding: 8 }}
              />
            ) : (
              <DateTimePicker
                value={form.date ? new Date(form.date) : new Date()}
                mode="date"
                display="default"
                onChange={(_event, selectedDate) => {
                  if (selectedDate) {
                    const yyyy = selectedDate.getFullYear();
                    const mm = String(selectedDate.getMonth() + 1).padStart(2, '0');
                    const dd = String(selectedDate.getDate()).padStart(2, '0');
                    setForm(f => ({ ...f, date: `${yyyy}-${mm}-${dd}` }));
                  }
                  setShowDatePicker(false);
                }}
              />
            )
          )}
          <Button title="Create Quote" onPress={handleCreateQuote} />
          <Button title="Cancel" onPress={() => setModalVisible(false)} color="red" />
        </View>
      </Modal>
    </View>
  );
} 