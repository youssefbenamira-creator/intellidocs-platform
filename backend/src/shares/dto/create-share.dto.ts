export class CreateShareDto {
  documentId: number;
  documentType: string; // "uploaded" | "scraped"
  sharedWithIds: number[];
  message?: string;
}
