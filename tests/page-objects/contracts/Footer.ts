export interface FooterPO {
  connectionLabel(): Promise<string>;
  isStatusVisible(): Promise<boolean>;
}
