// HWP "다. OpenAPI 에러코드 정리". S001/OK remains the only accepted
// success contract; numeric NORMAL_CODE is not silently equated to S001.
export const kdcaProviderErrors = {
  '0': 'NORMAL_CODE', '1': 'APPLICATION_ERROR', '2': 'DB_ERROR',
  '3': 'NODATA_ERROR', '4': 'HTTP_ERROR', '5': 'SERVICETIMEOUT_ERROR',
  '10': 'INVALID_REQUEST_PARAMETER_ERROR', '11': 'NO_MANDATORY_REQUEST_PARAMETERS_ERROR',
  '12': 'NO_OPENAPI_SERVICE_ERROR', '20': 'SERVICE_ACCESS_DENIED_ERROR',
  '21': 'TEMPORARILY_DISABLE_THE_SERVICEKEY_ERROR',
  '22': 'LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR',
  '30': 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR', '31': 'DEADLINE_HAS_EXPIRED_ERROR',
  '32': 'UNREGISTERED_IP_ERROR', '33': 'UNSIGNED_CALL_ERROR', '99': 'UNKNOWN_ERROR',
} as const;
export function safeKdcaProviderCode(value: string): keyof typeof kdcaProviderErrors | undefined {
  return Object.hasOwn(kdcaProviderErrors, value) ? value as keyof typeof kdcaProviderErrors : undefined;
}
