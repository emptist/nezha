export interface MemoryEntry {
  type: string;
  content: any;
  metadata?: Record<string, any>;
  timestamp?: Date;
}
