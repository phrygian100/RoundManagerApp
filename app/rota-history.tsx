import { format, startOfWeek, subWeeks } from 'date-fns';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { fetchRotaRange } from '../services/rotaService';

export default function RotaHistoryScreen() {
  const [weeks, setWeeks] = useState<{ start: Date; hasData: boolean }[]>([]);

  useEffect(() => {
    const load = async () => {
      const tmp: { start: Date; hasData: boolean }[] = [];
      for (let i = 1; i <= 52; i++) {
        const start = startOfWeek(subWeeks(new Date(), i), { weekStartsOn: 1 });
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        const data = await fetchRotaRange(start, end);
        const has = Object.keys(data).length > 0;
        tmp.push({ start, hasData: has });
      }
      setWeeks(tmp);
    };
    load();
  }, []);

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      {weeks.map(w => (
        <View key={w.start.toISOString()} style={styles.row}>
          <Text style={{ flex:1 }}>{format(w.start,'d MMM yyyy')} – {format(new Date(w.start.getTime()+6*86400000),'d MMM yyyy')}</Text>
          <Text>{w.hasData ? '📄' : '—'}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row:{ flexDirection:'row', marginBottom:8 }
}); 