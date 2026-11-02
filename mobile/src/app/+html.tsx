import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

// SDK 58 document context preserves generated styles/scripts in both exports.
export default function RootHtml({ children }: PropsWithChildren) {
  const { headNodes, bodyNodes, htmlAttributes, bodyAttributes } = useServerDocumentContext();
  return <html {...htmlAttributes} lang="ko">
    <head><meta charSet="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><ScrollViewStyleReset />{headNodes}</head>
    <body {...bodyAttributes}>{children}{bodyNodes}</body>
  </html>;
}
