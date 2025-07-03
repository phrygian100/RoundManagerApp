import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Button, Text, View } from 'react-native';
import { db } from '../../core/firebase';

export default function QuoteDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [quote, setQuote] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const fetchQuote = async () => {
      const snap = await getDoc(doc(db, 'quotes', String(id)));
      setQuote(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      setLoading(false);
    };
    fetchQuote();
  }, [id]);

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} />;
  if (!quote) return <Text style={{ margin: 40 }}>Quote not found.</Text>;

  return (
    <View style={{ flex: 1, padding: 24 }}>
      <Button title="Back" onPress={() => router.back()} />
      <Text style={{ fontSize: 22, fontWeight: 'bold', marginVertical: 12 }}>Quote Details</Text>
      <Text style={{ fontSize: 18, marginBottom: 8 }}>Name: {quote.name}</Text>
      <Text style={{ fontSize: 18, marginBottom: 8 }}>Address: {quote.address}</Text>
      <Text style={{ fontSize: 18, marginBottom: 8 }}>Number: {quote.number}</Text>
      <Text style={{ fontSize: 18, marginBottom: 8 }}>Date: {quote.date}</Text>
      {/* Add more fields as needed */}
    </View>
  );
} 