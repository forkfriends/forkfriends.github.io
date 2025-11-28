export type RootStackParamList = {
  HomeScreen: { showModal?: { title: string; message: string } } | undefined;
  LoginScreen: undefined;
  MakeQueueScreen: { id: string } | undefined;
  JoinQueueScreen: { id: string; code?: string } | undefined;
  PrivacyPolicyScreen: undefined;
  AdminDashboardScreen: undefined;
  HostDashboardScreen: undefined;
  HostQueueScreen: {
    code: string;
    sessionId?: string; // Optional - can be recovered from storage on page refresh
    wsUrl?: string; // Optional - can be recovered from storage on page refresh
    joinUrl?: string;
    hostAuthToken?: string;
    eventName?: string;
    maxGuests?: number;
    location?: string | null;
    contactInfo?: string | null;
    openTime?: string | null;
    closeTime?: string | null;
    requiresAuth?: boolean;
  };
  GuestQueueScreen: {
    code: string;
    partyId?: string; // Optional - can be recovered from storage on page refresh
    sessionId?: string | null;
    initialPosition?: number;
    initialAheadCount?: number;
    initialQueueLength?: number | null;
    initialEtaMs?: number | null;
    guestName?: string;
    partySize?: number;
  };
};
