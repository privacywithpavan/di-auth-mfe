export type Method = "EMAIL_OTP" | "SMS_OTP";

export interface ChallengeResponse {
  challengeId: string;
  maskedDestination: string;
  debugCode?: string;
}
