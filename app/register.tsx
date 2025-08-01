import { useRouter } from 'expo-router';
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { useState } from 'react';
import { Alert, Button, Platform, StyleSheet, TextInput } from 'react-native';
import { ThemedText } from '../components/ThemedText';
import { ThemedView } from '../components/ThemedView';
import { auth, db } from '../core/firebase';

export default function RegisterScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [address1, setAddress1] = useState('');
  const [town, setTown] = useState('');
  const [postcode, setPostcode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!name.trim() || !contactNumber.trim() || !email.trim() || !password || !confirmPassword) {
      Alert.alert('Error', 'Please fill out all fields.');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);

      const user = userCredential.user;

      // Send verification email
      await sendEmailVerification(user);

      // Create a user document in Firestore
      const DEVELOPER_UID = 'X4TtaVGKUtQSCtPLF8wsHsVZ0oW2';
      const userData: any = {
        id: user.uid,
        email: user.email,
        name: name.trim(),
        contactNumber: contactNumber.trim(),
        createdAt: new Date().toISOString(),
        // Default subscription fields (also set by backend, but ensures immediate availability)
        subscriptionTier: user.uid === DEVELOPER_UID ? 'exempt' : 'free',
        subscriptionStatus: user.uid === DEVELOPER_UID ? 'exempt' : 'active',
        clientLimit: user.uid === DEVELOPER_UID ? null : 20,
        isExempt: user.uid === DEVELOPER_UID,
      };

      // Add address fields if provided
      if (address1.trim()) userData.address1 = address1.trim();
      if (town.trim()) userData.town = town.trim();
      if (postcode.trim()) userData.postcode = postcode.trim();

      // Create combined address for backward compatibility
      if (address1.trim() || town.trim() || postcode.trim()) {
        userData.address = [address1.trim(), town.trim(), postcode.trim()]
          .filter(Boolean)
          .join(', ');
      }

      await setDoc(doc(db, 'users', user.uid), userData);

      // Immediately sign the user out so they cannot access the app until
      // their email is verified. This prevents unverified accounts from
      // bypassing verification due to auth-state race conditions.
      await auth.signOut();

      Alert.alert(
        'Verify Your Email',
        'Your account has been created. We have sent a verification link to your email address. Please verify your email and then log in.'
      );

      router.replace('/login');
    } catch (error: any) {
      console.error(error);
      Alert.alert('Registration Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Register</ThemedText>
      <TextInput
        style={styles.input}
        placeholder="Full Name"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        placeholderTextColor="#999"
      />
      <TextInput
        style={styles.input}
        placeholder="Contact Number"
        value={contactNumber}
        onChangeText={setContactNumber}
        keyboardType="phone-pad"
        placeholderTextColor="#999"
      />
      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholderTextColor="#999"
      />
      <TextInput
        style={styles.input}
        placeholder="Address Line 1 (Optional)"
        value={address1}
        onChangeText={setAddress1}
        autoCapitalize="words"
        placeholderTextColor="#999"
      />
      <TextInput
        style={styles.input}
        placeholder="Town (Optional)"
        value={town}
        onChangeText={setTown}
        autoCapitalize="words"
        placeholderTextColor="#999"
      />
      <TextInput
        style={styles.input}
        placeholder="Postcode (Optional)"
        value={postcode}
        onChangeText={setPostcode}
        autoCapitalize="characters"
        placeholderTextColor="#999"
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholderTextColor="#999"
      />
      <TextInput
        style={styles.input}
        placeholder="Confirm Password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        placeholderTextColor="#999"
        // Disable paste on web to encourage manual entry
        {...(Platform.OS === 'web' ? { onPaste: (e: any) => e.preventDefault() } : {})}
      />
      <Button title={loading ? 'Registering...' : 'Register'} onPress={handleRegister} disabled={loading} />
      <Button title="Back to Login" onPress={() => router.replace('/login')} color="gray" />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  input: {
    height: 40,
    borderColor: 'gray',
    borderWidth: 1,
    marginBottom: 12,
    paddingHorizontal: 8,
    color: '#333',
    backgroundColor: '#fff',
    borderRadius: 5,
  },
}); 