import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import ParallaxScrollView from 'components/ParallaxScrollView';
import { ThemedText } from 'components/ThemedText';
import { ThemedView } from 'components/ThemedView';

export default function HomeScreen() {
  const router = useRouter();

  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: '#A1CEDC', dark: '#1D3D47' }}
      headerImage={
       <Image
  source={require('../../assets/images/partial-react-logo.png')}
  style={styles.reactLogo}
/>

      }
    >
      <ThemedView style={styles.titleContainer}>
        <ThemedText type="title">Round Manager</ThemedText>
      </ThemedView>

      <ThemedView style={styles.stepContainer}>
        <ThemedText>
          This is the home screen. From here you will manage your daily work.
        </ThemedText>

        <Pressable style={styles.button} onPress={() => router.push('/clients')}>
          <ThemedText style={styles.buttonText}>View Clients</ThemedText>
        </Pressable>

        <Pressable style={styles.button} onPress={() => router.push('/add-client')}>
          <ThemedText style={styles.buttonText}>Add New Client</ThemedText>
        </Pressable>
      </ThemedView>
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepContainer: {
    gap: 12,
    marginTop: 16,
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  reactLogo: {
    height: 178,
    width: 290,
    bottom: 0,
    left: 0,
    position: 'absolute',
  },
});

