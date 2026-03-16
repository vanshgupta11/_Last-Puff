import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import MapView, { Circle, Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { SafeAreaView } from "react-native-safe-area-context";

// ------------------------------------------------
// CONFIG
// ------------------------------------------------
const GEOFENCING_TASK_NAME = "GEOFENCING_TASK";
const PRIMARY_COLOR = "#39FF14"; // Neon Green
const BG_COLOR = "#000000"; // Dark Background
const CARD_BG = "#121212";

// ------------------------------------------------
// NOTIFICATION HANDLER
// ------------------------------------------------
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

interface GeofenceRegion {
  identifier: string;
  latitude: number;
  longitude: number;
  radius: number;
  notifyOnEnter: boolean;
  notifyOnExit: boolean;
}

export default function GeofencingScreen() {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [currentLocation, setCurrentLocation] = useState<Location.LocationObject | null>(null);
  const [regions, setRegions] = useState<GeofenceRegion[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const mapRef = useRef<MapView>(null);

  // 1. Initial Setup
  useEffect(() => {
    (async () => {
      // A. Notifications Permission
      const { status: notifStatus } = await Notifications.requestPermissionsAsync();
      if (notifStatus !== "granted") {
        Alert.alert("Permission to notify was denied");
        return;
      }

      // B. Loction Permissions (Foreground & Background)
      const { status: foreStatus } = await Location.requestForegroundPermissionsAsync();
      if (foreStatus !== "granted") {
        setHasPermission(false);
        return;
      }

      const { status: backStatus } = await Location.requestBackgroundPermissionsAsync();
      if (backStatus !== "granted") {
        Alert.alert("Background location is required for geofencing to work properly.");
      }

      setHasPermission(true);

      // C. Get Current Location
      let location = await Location.getCurrentPositionAsync({});
      setCurrentLocation(location);

      // D. Check if already monitoring
      const isRegistered = await TaskManager.isTaskRegisteredAsync(GEOFENCING_TASK_NAME);
      setIsMonitoring(isRegistered);
    })();
  }, []);

  // 2. Add a Geofence Region
  const addGeofence = async () => {
    if (!currentLocation) return;

    // Create a new region around current location (or map center in future)
    const newRegion: GeofenceRegion = {
      identifier: `zone_${Date.now()}`,
      latitude: currentLocation.coords.latitude,
      longitude: currentLocation.coords.longitude,
      radius: 100, // meters
      notifyOnEnter: true,
      notifyOnExit: true,
    };

    const newRegions = [...regions, newRegion];
    setRegions(newRegions);

    // If monitoring is active, update it
    if (isMonitoring) {
      await Location.startGeofencingAsync(GEOFENCING_TASK_NAME, newRegions);
      Alert.alert("Geofence Added", "New active zone added.");
    } else {
      Alert.alert("Geofence Added", "Enable monitoring to activate.");
    }
  };

  // 3. Toggle Monitoring
  const toggleMonitoring = async () => {
    try {
      if (isMonitoring) {
        await Location.stopGeofencingAsync(GEOFENCING_TASK_NAME);
        setIsMonitoring(false);
        Alert.alert("Stopped", "Geofencing monitoring stopped.");
      } else {
        if (regions.length === 0) {
          Alert.alert("No Zones", "Please add a geofence zone first.");
          return;
        }
        await Location.startGeofencingAsync(GEOFENCING_TASK_NAME, regions);
        setIsMonitoring(true);
        Alert.alert("Started", "You will be notified when entering/leaving zones.");
      }
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  if (hasPermission === false) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ color: "#fff" }}>Location permission is required.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Geofencing</Text>
        <TouchableOpacity onPress={toggleMonitoring}>
          <View style={[styles.statusBadge, { backgroundColor: isMonitoring ? PRIMARY_COLOR : "#333" }]}>
            <Text style={[styles.statusText, { color: isMonitoring ? "#000" : "#fff" }]}>
              {isMonitoring ? "ACTIVE" : "INACTIVE"}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.mapContainer}>
        {currentLocation ? (
          <MapView
            ref={mapRef}
            style={styles.map}
            provider={PROVIDER_GOOGLE}
            initialRegion={{
              latitude: currentLocation.coords.latitude,
              longitude: currentLocation.coords.longitude,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            }}
            showsUserLocation
            customMapStyle={mapStyle} // Dark mode map style
          >
            {regions.map((region) => (
              <React.Fragment key={region.identifier}>
                <Marker
                  coordinate={{ latitude: region.latitude, longitude: region.longitude }}
                  title="Trigger Zone"
                  pinColor={PRIMARY_COLOR}
                />
                <Circle
                  center={{ latitude: region.latitude, longitude: region.longitude }}
                  radius={region.radius}
                  strokeColor={PRIMARY_COLOR}
                  fillColor="rgba(57, 255, 20, 0.2)"
                />
              </React.Fragment>
            ))}
          </MapView>
        ) : (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={PRIMARY_COLOR} />
            <Text style={{ color: "#fff", marginTop: 10 }}>Locating...</Text>
          </View>
        )}
      </View>

      <View style={styles.controls}>
        <Text style={styles.infoText}>
          {regions.length} Active Zones configured.
        </Text>

        <TouchableOpacity style={styles.addButton} onPress={addGeofence}>
          <Ionicons name="add-circle" size={24} color="#000" />
          <Text style={styles.btnText}>Add Current Location as Zone</Text>
        </TouchableOpacity>

        <Text style={styles.hint}>
          Add locations where you usually smoke. We'll verify if you are near them.
        </Text>
      </View>
    </SafeAreaView>
  );
}

// ------------------------------------------------
// TASK MANAGER (Must be defined in global scope)
// ------------------------------------------------
TaskManager.defineTask(GEOFENCING_TASK_NAME, ({ data, error }: any) => {
  if (error) {
    console.error("Geofencing task error:", error);
    return;
  }
  if (data) {
    const { eventType, region } = data;
    const eventName =
      eventType === Location.GeofencingEventType.Enter ? "Entered" : "Exited";

    // Trigger Notification
    Notifications.scheduleNotificationAsync({
      content: {
        title: `Geofence Alert: ${eventName}`,
        body: `You have ${eventName.toLowerCase()} a trigger zone! Stay strong!`,
        sound: true,
      },
      trigger: null, // Send immediately
    });
  }
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG_COLOR,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: BG_COLOR,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusText: {
    fontWeight: "bold",
    fontSize: 12,
  },
  mapContainer: {
    flex: 1,
    overflow: "hidden",
    margin: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#333",
  },
  map: {
    width: "100%",
    height: "100%",
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#121212",
    justifyContent: "center",
    alignItems: "center",
  },
  controls: {
    padding: 20,
    backgroundColor: CARD_BG,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  infoText: {
    color: "#ccc",
    marginBottom: 16,
    textAlign: "center",
  },
  addButton: {
    backgroundColor: PRIMARY_COLOR,
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
    gap: 8,
  },
  btnText: {
    color: "#000",
    fontWeight: "bold",
    fontSize: 16,
  },
  hint: {
    color: "#666",
    fontSize: 12,
    textAlign: "center",
    marginTop: 16,
  },
});

// Dark Map Style JSON
const mapStyle = [
  {
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#212121"
      }
    ]
  },
  {
    "elementType": "labels.icon",
    "stylers": [
      {
        "visibility": "off"
      }
    ]
  },
  {
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#757575"
      }
    ]
  },
  {
    "elementType": "labels.text.stroke",
    "stylers": [
      {
        "color": "#212121"
      }
    ]
  },
  {
    "featureType": "administrative",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#757575"
      }
    ]
  },
  {
    "featureType": "administrative.country",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#9e9e9e"
      }
    ]
  },
  {
    "featureType": "administrative.land_parcel",
    "stylers": [
      {
        "visibility": "off"
      }
    ]
  },
  {
    "featureType": "administrative.locality",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#bdbdbd"
      }
    ]
  },
  {
    "featureType": "poi",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#757575"
      }
    ]
  },
  {
    "featureType": "poi.park",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#181818"
      }
    ]
  },
  {
    "featureType": "poi.park",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#616161"
      }
    ]
  },
  {
    "featureType": "poi.park",
    "elementType": "labels.text.stroke",
    "stylers": [
      {
        "color": "#1b1b1b"
      }
    ]
  },
  {
    "featureType": "road",
    "elementType": "geometry.fill",
    "stylers": [
      {
        "color": "#2c2c2c"
      }
    ]
  },
  {
    "featureType": "road",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#8a8a8a"
      }
    ]
  },
  {
    "featureType": "road.arterial",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#373737"
      }
    ]
  },
  {
    "featureType": "road.highway",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#3c3c3c"
      }
    ]
  },
  {
    "featureType": "road.highway.controlled_access",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#4e4e4e"
      }
    ]
  },
  {
    "featureType": "road.local",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#616161"
      }
    ]
  },
  {
    "featureType": "transit",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#757575"
      }
    ]
  },
  {
    "featureType": "water",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#000000"
      }
    ]
  },
  {
    "featureType": "water",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#3d3d3d"
      }
    ]
  }
];