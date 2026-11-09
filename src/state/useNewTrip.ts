import { router } from 'expo-router';
import { Alert } from 'react-native';

import { FREE_TRIP_LIMIT } from '../config';
import type { Trip, TripStop } from '../lib/trips';
import { newId } from '../lib/vehicles';
import { useAppState } from './AppState';
import { usePro } from './Pro';

/** Creates a trip (respecting the free limit) and returns its id, or null. */
export function useNewTrip() {
  const { trips, saveTrip, settings } = useAppState();
  const { isPro } = usePro();
  return (firstStops: TripStop[] = []): string | null => {
    if (!isPro && trips.length >= FREE_TRIP_LIMIT) {
      Alert.alert(
        'Trip limit reached',
        `Free accounts can plan ${FREE_TRIP_LIMIT} trip at a time (with as many stops as you like). Go Pro for unlimited trips, vehicles and saved spots, with no ads.`,
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Go Pro', onPress: () => router.push('/upgrade') },
        ],
      );
      return null;
    }
    const trip: Trip = {
      id: newId(),
      name: `Trip ${trips.length + 1}`,
      vehicleId: settings.activeVehicleId,
      stops: firstStops,
      createdAt: new Date().toISOString(),
    };
    saveTrip(trip);
    return trip.id;
  };
}

