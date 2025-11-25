import React from 'react';
import { View, Text, Image, Pressable, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types/navigation';
import { useAuth } from '../../contexts/AuthContext';
import styles from './LoginScreen.Styles';

type Props = NativeStackScreenProps<RootStackParamList, 'LoginScreen'>;

export default function LoginScreen({ navigation }: Props) {
  const { login, isAuthenticated } = useAuth();

  // If already authenticated, go back
  React.useEffect(() => {
    if (isAuthenticated) {
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.navigate('HomeScreen');
      }
    }
  }, [isAuthenticated, navigation]);

  const handleGitHubLogin = async () => {
    await login('github');
  };

  const handleGoogleLogin = async () => {
    await login('google');
  };

  return (
    <SafeAreaProvider style={styles.safe}>
      <View style={styles.container}>
        {/* Logo and Title */}
        <View style={styles.logoContainer}>
          {Platform.OS === 'web' ? (
            <Image
              source={{ uri: '/icon-black.svg' }}
              style={styles.logoIcon}
              resizeMode="contain"
            />
          ) : (
            <Image
              source={require('@assets/ff_logo.png')}
              style={styles.logoIcon}
              resizeMode="contain"
            />
          )}
          <Text style={styles.title}>QueueUp</Text>
          <Text style={styles.subtitle}>Sign in to continue</Text>
        </View>

        {/* Provider Buttons */}
        <View style={styles.providersContainer}>
          <Pressable
            style={[styles.providerButton, styles.githubButton]}
            onPress={handleGitHubLogin}
            accessibilityRole="button"
            accessibilityLabel="Sign in with GitHub">
            <Image
              source={{
                uri: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0id2hpdGUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTEyIDBDNS4zNyAwIDAgNS4zNyAwIDEyYzAgNS4zMSAzLjQzNSA5LjggOC4yMDUgMTEuMzg1LjYuMTEzLjgyLS4yNTguODItLjU3NyAwLS4yODUtLjAxLTEuMDQtLjAxNS0yLjA0LTMuMzM4LjcyNC00LjA0Mi0xLjYxLTQuMDQyLTEuNjFDNC40MjIgMTcuMDcgMy42MzMgMTYuNyAzLjYzMyAxNi43Yy0xLjA4Ny0uNzQ0LjA4NC0uNzI5LjA4NC0uNzI5IDEuMjA1LjA4NCAxLjgzOCAxLjIzNiAxLjgzOCAxLjIzNiAxLjA3IDEuODM1IDIuODA5IDEuMzA1IDMuNDk1Ljk5OC4xMDgtLjc3Ni40MTctMS4zMDUuNzYtMS42MDUtMi42NjUtLjMtNS40NjYtMS4zMzItNS40NjYtNS45MyAwLTEuMzEuNDY1LTIuMzggMS4yMzUtMy4yMi0uMTM1LS4zMDMtLjU0LTEuNTIzLjEwNS0zLjE3NiAwIDAgMS4wMDUtLjMyMiAzLjMgMS4yMy45Ni0uMjY3IDEuOTgtLjM5OSAzLS40MDUgMS4wMi4wMDYgMi4wNC4xMzggMyAuNDA1IDIuMjgtMS41NTIgMy4yODUtMS4yMyAzLjI4NS0xLjIzLjY0NSAxLjY1My4yNCAyLjg3My4xMiAzLjE3Ni43NjUuODQgMS4yMyAxLjkxIDEuMjMgMy4yMiAwIDQuNjEtMi44MDUgNS42MjUtNS40NzUgNS45Mi40Mi4zNi44MSAxLjA5Ni44MSAyLjIyIDAgMS42MDYtLjAxNSAyLjg5Ni0uMDE1IDMuMjg2IDAgLjMxNS4yMS42OS44MjUuNTdDMjAuNTY1IDIxLjc5NSAyNCAxNy4zIDI0IDEyYzAtNi42My01LjM3LTEyLTEyLTEyeiIvPjwvc3ZnPg==',
              }}
              style={styles.providerIcon}
              resizeMode="contain"
            />
            <Text style={[styles.providerText, styles.githubText]}>Continue with GitHub</Text>
          </Pressable>

          <Pressable
            style={[styles.providerButton, styles.googleButton]}
            onPress={handleGoogleLogin}
            accessibilityRole="button"
            accessibilityLabel="Sign in with Google">
            <Image
              source={{
                uri: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHZpZXdCb3g9IjAgMCAyNCAyNCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBkPSJNMjIuNTYgMTIuMjVjMC0uNzgtLjA3LTEuNTMtLjItMi4yNUgxMnY0LjI2aDUuOTJjLS4yNiAxLjM3LTEuMDQgMi41My0yLjIxIDMuMzF2Mi43N2gzLjU3YzIuMDgtMS45MiAzLjI4LTQuNzQgMy4yOC04LjA5eiIgZmlsbD0iIzQyODVGNCIvPjxwYXRoIGQ9Ik0xMiAyM2MzIDAgNS41MS0uOTkgNy4zNS0yLjY5bC0zLjU3LTIuNzdjLS45OS42Ny0yLjI2IDEuMDctMy43OCAxLjA3LTIuOSAwLTUuMzYtMS45Ny02LjI0LTQuNjFIMS42OHYyLjg1QzMuNDggMjAuNTMgNy40NCAyMyAxMiAyM3oiIGZpbGw9IiMzNEE4NTMiLz48cGF0aCBkPSJNNS43NiAxNC41OGMtLjI1LS43NC0uMzktMS41NC0uMzktMi4zNiAwLS44My4xNC0xLjYyLjM4LTIuMzZWNi45OEgxLjY4QTExLjk5IDExLjk5IDAgMCAwIDAgMTJjMCAxLjk0LjQ3IDMuNzcgMS4zIDUuNGw0LjQ2LTIuODJ6IiBmaWxsPSIjRkJCQzA1Ii8+PHBhdGggZD0iTTEyIDUuMzhjMS42MSAwIDMuMDYuNTYgNC4yMSAxLjY0bDMuMTUtMy4xNUMxNy40NSAxLjk5IDE0Ljk3LjgxIDEyIC44MSA3LjQ1LjgxIDMuNDggMy4yNiAxLjY5IDYuOThsNC41NiAyLjg1YzEtMi42NiAzLjU2LTQuNjUgNS43NS00LjY1eiIgZmlsbD0iI0VBNDMzNSIvPjwvc3ZnPg==',
              }}
              style={styles.providerIcon}
              resizeMode="contain"
            />
            <Text style={[styles.providerText, styles.googleText]}>Continue with Google</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaProvider>
  );
}
