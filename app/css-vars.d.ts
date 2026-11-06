import 'react';

// Variables CSS que se pasan por style={{ ... }}: declaradas aquí no hace falta `as CSSProperties` en cada uso
declare module 'react' {
  interface CSSProperties {
    '--i'?: number;
    '--w'?: string;
  }
}
