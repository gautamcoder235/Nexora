/**
 * Nexora — Web Browser Type Definitions
 */

export interface BrowserTab {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  isLoading: boolean;
}
