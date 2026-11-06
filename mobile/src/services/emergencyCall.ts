// No automatic invocation, emergency service API, location, or server writes.
// Call only from an explicit user action; the user completes dialing in the OS.
export async function requestEmergencyDialer(openURL: (url: string) => Promise<unknown>): Promise<'requested' | 'unavailable'> {
  try { await openURL('tel:119'); return 'requested'; }
  catch { return 'unavailable'; }
}
