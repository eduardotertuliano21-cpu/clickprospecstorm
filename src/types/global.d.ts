declare const chrome: any;

interface Window {
  electronAPI?: {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
    getVersion: () => Promise<string>;
    getWhatsAppPreloadPath: () => Promise<string>;
  };
  WPP?: any;
}

declare module '*.png' {
  const content: string;
  export default content;
}

declare module '*.svg' {
  const content: string;
  export default content;
}
