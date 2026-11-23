export type CampaignRole = "gm" | "player" | "observer";
export type EmployeePosition = string;
export interface PublicCampaign {
  id: string; name: string; burgerIndex: number; publishedAt: string; messageCount: number;
}
export interface VisitorMessage {
  id: string; displayName: string; body: string; createdAt: string; isOwn: boolean;
}
