// App.js
import 'react-native-gesture-handler';
import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import AppNavigator from './src/navigation/AppNavigator';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
import { Ionicons } from '@expo/vector-icons';

// Mantenemos el splash visible hasta que todo esté listo
SplashScreen.preventAutoHideAsync();

export default function App() {
  const [appIsReady, setAppIsReady] = useState(false);

  useEffect(() => {
    async function prepare() {
      try {
        // Cargar explícitamente la fuente de Ionicons
        await Font.loadAsync({
          ...Ionicons.font,
        });
      } catch (e) {
        // Si algo falla, no bloquees el arranque
        console.log('Font load error:', e);
      } finally {
        setAppIsReady(true);
      }
    }
    prepare();
  }, []);

  // Oculta el splash en cuanto el árbol principal termine de renderizar
  const onLayoutRootView = useCallback(async () => {
    if (appIsReady) {
      try { await SplashScreen.hideAsync(); } catch {}
    }
  }, [appIsReady]);

  if (!appIsReady) return null;

  return (
    <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
      <AppNavigator />
    </View>
  );
}
