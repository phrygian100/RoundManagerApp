import React, { useState } from 'react';
import { Button, FlatList, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
// ... import Firestore and navigation helpers ...

type Quote = {
  id: string;
  name: string;
  address: string;
  number: string;
  date: string;
};

export default function QuotesScreen() {
  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState({ name: '', address: '', number: '', date: '' });
  const [quotes, setQuotes] = useState<Quote[]>([]); // TODO: fetch from Firestore

  const handleCreateQuote = async () => {
    // TODO: Save quote to Firestore and create a 'Quote' job on the runsheet
    setModalVisible(false);
    setForm({ name: '', address: '', number: '', date: '' });
  };

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Button title="Create New Quote" onPress={() => setModalVisible(true)} />
      <FlatList
        data={quotes}
        keyExtractor={(item: Quote) => item.id}
        renderItem={({ item }: { item: Quote }) => (
          <TouchableOpacity>
            <Text>{item.name} - {item.address} ({item.date})</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text>No quotes yet.</Text>}
      />
      <Modal visible={modalVisible} animationType="slide">
        <View style={{ flex: 1, justifyContent: 'center', padding: 20 }}>
          <Text style={{ fontSize: 20, marginBottom: 10 }}>New Quote</Text>
          <TextInput placeholder="Name" value={form.name} onChangeText={v => setForm(f => ({ ...f, name: v }))} style={{ borderWidth: 1, marginBottom: 8, padding: 8 }} />
          <TextInput placeholder="Address" value={form.address} onChangeText={v => setForm(f => ({ ...f, address: v }))} style={{ borderWidth: 1, marginBottom: 8, padding: 8 }} />
          <TextInput placeholder="Number" value={form.number} onChangeText={v => setForm(f => ({ ...f, number: v }))} style={{ borderWidth: 1, marginBottom: 8, padding: 8 }} />
          <TextInput placeholder="Date (YYYY-MM-DD)" value={form.date} onChangeText={v => setForm(f => ({ ...f, date: v }))} style={{ borderWidth: 1, marginBottom: 8, padding: 8 }} />
          <Button title="Create Quote" onPress={handleCreateQuote} />
          <Button title="Cancel" onPress={() => setModalVisible(false)} color="red" />
        </View>
      </Modal>
    </View>
  );
} 