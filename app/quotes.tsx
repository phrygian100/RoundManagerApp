import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import { useRouter } from 'expo-router';
import { addDoc, collection, deleteDoc, doc, getDocs, updateDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import 'react-datepicker/dist/react-datepicker.css';
import { Button, FlatList, Modal, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useQuoteToClient } from '../contexts/QuoteToClientContext';
import { db } from '../core/firebase';
import { getDataOwnerId } from '../core/supabase';

type Quote = {
  id: string;
  name: string;
  address: string;
  town: string;
  number: string;
  date: string;
  status: string;
  frequency?: string;
  value?: string;
  notes?: string;
};

let DatePicker: any = null;
if (Platform.OS === 'web') {
  DatePicker = require('react-datepicker').default;
  require('react-datepicker/dist/react-datepicker.css');
}

export default function QuotesScreen() {
  const router = useRouter();
  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState({ name: '', address: '', town: '', number: '', date: '' });
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [webDate, setWebDate] = useState<Date | null>(null);
  const [detailsModal, setDetailsModal] = useState<{ visible: boolean, quote: Quote | null }>({ visible: false, quote: null });
  const [detailsForm, setDetailsForm] = useState({ frequency: '4 weekly', value: '', notes: '' });
  const [addClientModal, setAddClientModal] = useState<{ visible: boolean, quote: Quote | null }>({ visible: false, quote: null });
  const [clientForm, setClientForm] = useState({ name: '', address: '', town: '', mobileNumber: '', quote: '', frequency: '' });
  const { setQuoteData } = useQuoteToClient();

  useEffect(() => {
    const fetchQuotes = async () => {
      const snap = await getDocs(collection(db, 'quotes'));
      setQuotes(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Quote));
    };
    fetchQuotes();
  }, []);

  const handleCreateQuote = async () => {
    // Get the current owner ID
    const ownerId = await getDataOwnerId();
    if (!ownerId) {
      console.error('No owner ID found');
      return;
    }
    // Save quote to Firestore with status 'scheduled'
    const docRef = await addDoc(collection(db, 'quotes'), { ...form, status: 'scheduled' });
    // Create a 'Quote' job on the runsheet for the selected date
    await addDoc(collection(db, 'jobs'), {
      ownerId,
      clientId: 'QUOTE_' + docRef.id,
      scheduledTime: form.date + 'T09:00:00',
      status: 'pending',
      type: 'quote',
      serviceId: 'quote',
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

  const handleOpenDetails = (quote: Quote) => {
    setDetailsForm({
      frequency: quote.frequency || '4 weekly',
      value: quote.value || '',
      notes: quote.notes || '',
    });
    setDetailsModal({ visible: true, quote });
  };

  const handleSaveDetails = async () => {
    if (!detailsModal.quote) return;
    const ref = doc(db, 'quotes', detailsModal.quote.id);
    await updateDoc(ref, {
      frequency: detailsForm.frequency,
      value: detailsForm.value,
      notes: detailsForm.notes,
      status: 'pending',
    });
    setDetailsModal({ visible: false, quote: null });
    setDetailsForm({ frequency: '4 weekly', value: '', notes: '' });
    // Refresh quotes
    const snap = await getDocs(collection(db, 'quotes'));
    setQuotes(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Quote));
  };

  // Handler to open Add Client form with context and navigate
  const handleOpenAddClient = (quote: Quote) => {
    setQuoteData({
      id: quote.id,
      name: quote.name || '',
      address: quote.address || '',
      town: quote.town || '',
      number: quote.number || '',
      value: quote.value || '',
      frequency: quote.frequency || '',
      notes: quote.notes || '',
      date: quote.date || '',
    });
    router.push('/add-client');
  };

  // Group quotes by status
  const scheduledQuotes = quotes.filter(q => q.status === 'scheduled');
  const pendingQuotes = quotes.filter(q => q.status === 'pending');
  const completeQuotes = quotes.filter(q => q.status === 'complete');

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Button title="Home" onPress={() => router.push('/')} />
      <Button title="Create New Quote" onPress={() => setModalVisible(true)} />
      {/* Scheduled Section */}
      <Text style={{ fontWeight: 'bold', fontSize: 18, marginTop: 20 }}>Scheduled</Text>
      <FlatList
        data={scheduledQuotes}
        keyExtractor={(item: Quote) => item.id}
        renderItem={({ item }: { item: Quote }) => (
          <TouchableOpacity>
            <Text>{item.name} - {item.address}, {item.town} ({item.date})</Text>
            <Button title="Next" onPress={() => handleOpenDetails(item)} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text>No scheduled quotes.</Text>}
      />
      {/* Pending Section */}
      <Text style={{ fontWeight: 'bold', fontSize: 18, marginTop: 20 }}>Pending</Text>
      <FlatList
        data={pendingQuotes}
        keyExtractor={(item: Quote) => item.id}
        renderItem={({ item }: { item: Quote }) => (
          <TouchableOpacity>
            <Text>{item.name} - {item.address}, {item.town} ({item.date})</Text>
            <Button title="Next" onPress={() => handleOpenAddClient(item)} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text>No pending quotes.</Text>}
      />
      {/* Complete Section */}
      <Text style={{ fontWeight: 'bold', fontSize: 18, marginTop: 20 }}>Complete</Text>
      <FlatList
        data={completeQuotes}
        keyExtractor={(item: Quote) => item.id}
        renderItem={({ item }: { item: Quote }) => (
          <TouchableOpacity>
            <Text>{item.name} - {item.address}, {item.town} ({item.date})</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text>No complete quotes.</Text>}
      />
      {/* Create Quote Modal */}
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
            Platform.OS === 'web' && DatePicker ? (
              <View style={{ position: 'absolute', top: 200, left: 0, right: 0, zIndex: 1000, backgroundColor: '#fff', padding: 16, borderRadius: 8, alignItems: 'center' }}>
                <DatePicker
                  selected={webDate}
                  onChange={(date: Date | null) => {
                    if (date) {
                      const yyyy = date.getFullYear();
                      const mm = String(date.getMonth() + 1).padStart(2, '0');
                      const dd = String(date.getDate()).padStart(2, '0');
                      setForm(f => ({ ...f, date: `${yyyy}-${mm}-${dd}` }));
                      setWebDate(date);
                    }
                    setShowDatePicker(false);
                  }}
                  inline
                />
                <Button title="Cancel" onPress={() => setShowDatePicker(false)} color="red" />
              </View>
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
      {/* Details Modal for Scheduled Quotes */}
      <Modal visible={detailsModal.visible} animationType="slide">
        <View style={{ flex: 1, justifyContent: 'center', padding: 20 }}>
          <Text style={{ fontSize: 20, marginBottom: 10 }}>Quote Details</Text>
          <Text style={{ marginBottom: 8 }}>Visit Frequency</Text>
          <Picker
            selectedValue={detailsForm.frequency}
            onValueChange={v => setDetailsForm(f => ({ ...f, frequency: v }))}
            style={{ marginBottom: 8 }}
          >
            <Picker.Item label="4 weekly" value="4 weekly" />
            <Picker.Item label="8 weekly" value="8 weekly" />
            <Picker.Item label="one-off" value="one-off" />
          </Picker>
          <TextInput placeholder="Quote £ value" value={detailsForm.value} onChangeText={v => setDetailsForm(f => ({ ...f, value: v }))} style={{ borderWidth: 1, marginBottom: 8, padding: 8 }} keyboardType="numeric" />
          <TextInput placeholder="Notes" value={detailsForm.notes} onChangeText={v => setDetailsForm(f => ({ ...f, notes: v }))} style={{ borderWidth: 1, marginBottom: 8, padding: 8 }} multiline />
          <Button title="Save" onPress={handleSaveDetails} />
          <Button title="Cancel" onPress={() => setDetailsModal({ visible: false, quote: null })} color="red" />
        </View>
      </Modal>
    </View>
  );
} 