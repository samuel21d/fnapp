// src/navigation/AppNavigator.js
import React, { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../firebaseConfig";
import { collection, query, where, onSnapshot, doc } from "firebase/firestore";
import { useFonts } from "expo-font";
import { registerForPushNotificationsAsync } from "../utils/push";
import { sweepOldHistoryForCurrentUserMinutes } from "../utils/historySweeper";

import LoginScreen from "../screens/LoginScreen";
import ServiciosScreen from "../screens/ServiciosScreen";
import MisSolicitudesScreen from "../screens/MisSolicitudesScreen";
import MisServiciosScreen from "../screens/MisServiciosScreen";
import PerfilScreen from "../screens/PerfilScreen";
import AdministrarServiciosScreen from "../screens/AdministrarServiciosScreen";
import SolicitarServiciosScreen from "../screens/SolicitarServiciosScreen";
import SolicitarServiciosListaScreen from "../screens/SolicitarServiciosListaScreen";
import ProveedoresServicioScreen from "../screens/ProveedoresServicioScreen";
import OfrecerServiciosScreen from "../screens/OfrecerServiciosScreen";
import AdminUsuariosScreen from "../screens/AdminUsuariosScreen";
import OfertasGestionScreen from "../screens/OfertasGestionScreen";
import OfertaFormScreen from "../screens/OfertaFormScreen";
import OfertasListScreen from "../screens/OfertasListScreen";
import OfertaDetalleScreen from "../screens/OfertaDetalleScreen";
import ServicioExplorarScreen from "../screens/ServicioExplorarScreen";
import ContactarProveedorScreen from "../screens/ContactarProveedorScreen";
import ContestRegisterScreen from "../screens/ContestRegisterScreen";
import ContestVotarScreen from "../screens/ContestVotarScreen";
import ConfigPublicidadScreen from "../screens/ConfigPublicidadScreen";
import AdminComprasScreen from "../screens/AdminComprasScreen";

// ?? Mercado real
import MercadoScreen from "../screens/MercadoScreen";
// ?? Contactar vendedor (Mercado)
import ContactarListingScreen from "../screens/ContactarListingScreen";

// ?? Bloqueo por cuenta inhabilitada
import AccountDisabledScreen from "../screens/AccountDisabledScreen";

// ? NUEVO: pantalla de pago Premium (IAP Play)
import PremiumPayScreen from "../screens/PremiumPayScreen";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const HISTORY_RETENTION_MINUTES = 10080;

export default function AppNavigator() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // estado para leer si la cuenta est芍 inhabilitada
  const [profileLoading, setProfileLoading] = useState(false);
  const [isDisabled, setIsDisabled] = useState(false);

  const [outCount, setOutCount] = useState(0);
  const [inCount, setInCount] = useState(0);

  // Sesi車n
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      setUser(fbUser);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  // Suscribirse al perfil para detectar "disabled"
  useEffect(() => {
    if (!user?.uid) {
      setIsDisabled(false);
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);
    const uref = doc(db, "users", user.uid);
    const unsub = onSnapshot(
      uref,
      (snap) => {
        const data = snap.data() || {};
        setIsDisabled(!!data?.disabled);
        setProfileLoading(false);
      },
      () => setProfileLoading(false)
    );
    return () => unsub();
  }, [user?.uid]);

  // Utilidades al iniciar sesi車n (solo si NO est芍 inhabilitado)
  useEffect(() => {
    if (user && !isDisabled) {
      sweepOldHistoryForCurrentUserMinutes(HISTORY_RETENTION_MINUTES).catch(
        () => {}
      );
      registerForPushNotificationsAsync().catch(() => {});
    }
  }, [user, isDisabled]);

  // Badges de solicitudes
  useEffect(() => {
    if (!user?.uid) {
      setOutCount(0);
      setInCount(0);
      return;
    }
    const qOut = query(
      collection(db, "requests"),
      where("fromUserUid", "==", user.uid),
      where("status", "in", ["pendiente", "aceptada"])
    );
    const qIn = query(
      collection(db, "requests"),
      where("toUserUid", "==", user.uid),
      where("status", "in", ["pendiente", "aceptada"])
    );
    const unsubOut = onSnapshot(qOut, (snap) => setOutCount(snap.size));
    const unsubIn = onSnapshot(qIn, (snap) => setInCount(snap.size));
    return () => {
      unsubOut();
      unsubIn();
    };
  }, [user?.uid]);

  function MainTabs() {
    return (
      <Tab.Navigator
        lazy={false}
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarIcon: ({ color, size }) => {
            let iconName = "apps-outline";
            if (route.name === "Servicios") iconName = "briefcase-outline";
            if (route.name === "Solicitudes salientes")
              iconName = "paper-plane-outline";
            if (route.name === "Solicitudes entrantes")
              iconName = "download-outline";
            if (route.name === "Perfil") iconName = "person-circle-outline";
            return <Ionicons name={iconName} size={size} color={color} />;
          },
          tabBarActiveTintColor: "#007bff",
          tabBarInactiveTintColor: "gray",
        })}
      >
        <Tab.Screen name="Servicios" component={ServiciosScreen} />
        <Tab.Screen
          name="Solicitudes salientes"
          component={MisSolicitudesScreen}
          options={{ tabBarBadge: outCount > 0 ? outCount : undefined }}
        />
        <Tab.Screen
          name="Solicitudes entrantes"
          component={MisServiciosScreen}
          options={{ tabBarBadge: inCount > 0 ? inCount : undefined }}
        />
        <Tab.Screen name="Perfil" component={PerfilScreen} />
      </Tab.Navigator>
    );
  }

  const showSpinner = authLoading || (user && profileLoading);

  if (showSpinner) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator>
        {!user ? (
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{ headerShown: false }}
          />
        ) : isDisabled ? (
          // Si la cuenta est芍 inhabilitada, s車lo mostramos esta pantalla
          <Stack.Screen
            name="AccountDisabled"
            component={AccountDisabledScreen}
            options={{ headerShown: false }}
          />
        ) : (
          <>
            <Stack.Screen
              name="Main"
              component={MainTabs}
              options={{ headerShown: false }}
            />
			
			<Stack.Screen
  name="AdminCompras"
  component={AdminComprasScreen}
  options={{ title: "Compras" }}
/>

            {/* Flujo servicios / solicitudes */}
            <Stack.Screen
              name="AdministrarServicios"
              component={AdministrarServiciosScreen}
            />
            <Stack.Screen
              name="SolicitarServicios"
              component={SolicitarServiciosScreen}
            />
            <Stack.Screen
              name="SolicitarServiciosLista"
              component={SolicitarServiciosListaScreen}
            />
            <Stack.Screen
              name="ProveedoresServicio"
              component={ProveedoresServicioScreen}
            />
            <Stack.Screen
              name="OfrecerServicios"
              component={OfrecerServiciosScreen}
            />

            {/* Unificada: proveedores + ofertas */}
            <Stack.Screen
              name="ServicioExplorar"
              component={ServicioExplorarScreen}
              options={{ title: "Proveedores y promociones" }}
            />

            {/* Admin: Mostrar panel */}
            <Stack.Screen
              name="AdminUsuarios"
              component={AdminUsuariosScreen}
              options={{ title: "Administrar usuarios" }}
            />

            {/* Promociones */}
            <Stack.Screen
              name="MisOfertas"
              component={OfertasGestionScreen}
              options={{ title: "Mis promociones" }}
            />
            <Stack.Screen
              name="OfertaForm"
              component={OfertaFormScreen}
              options={{ title: "Crear promoci車n", presentation: "modal" }}
            />
            <Stack.Screen
              name="OfertasList"
              component={OfertasListScreen}
              options={{ title: "Promociones" }}
            />
            <Stack.Screen
              name="OfertaDetalle"
              component={OfertaDetalleScreen}
              options={{
                title: "Detalle de la promoci車n",
                presentation: "modal",
              }}
            />

            {/* Contactar proveedor (Servicios) */}
            <Stack.Screen
              name="ContactarProveedor"
              component={ContactarProveedorScreen}
              options={{ title: "Contactar", presentation: "modal" }}
            />

            {/* Contactar vendedor (Mercado) */}
            <Stack.Screen
              name="ContactarListing"
              component={ContactarListingScreen}
              options={{ title: "Contactar", presentation: "modal" }}
            />

            {/* Mercado */}
            <Stack.Screen
              name="Mercado"
              component={MercadoScreen}
              options={{ title: "Mercado" }}
            />

            {/* ? NUEVO: Pago Premium (IAP) */}
            <Stack.Screen
              name="PremiumPayScreen"
              component={PremiumPayScreen}
              options={{ title: "Obtener Premium", presentation: "modal" }}
            />
			

            {/* Concurso Emprendedores */}
            <Stack.Screen
              name="ContestRegister"
              component={ContestRegisterScreen}
              options={{ title: "Registro de emprendedores" }}
            />
			
			<Stack.Screen
			  name="ConfigPublicidad"
			  component={ConfigPublicidadScreen}
			  options={{ title: "Mi publicidad" }}
			/>

            <Stack.Screen
              name="ContestVotar"
              component={ContestVotarScreen}
              options={{ title: "Votar en el concurso" }}
            />

          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
