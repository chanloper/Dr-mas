import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

// SDK 58 document context preserves generated styles/scripts in both exports.
export default function RootHtml({ children }: PropsWithChildren) {
  const { headNodes, bodyNodes, htmlAttributes, bodyAttributes } = useServerDocumentContext();
  return <html {...htmlAttributes} lang="ko">
    <head><meta charSet="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" /><ScrollViewStyleReset />
      <style>{`html,body,#root{min-width:0;background:#F5F8FC}body{overflow-wrap:anywhere}input,textarea{font:inherit}button,a,input,textarea,[role="button"],[role="tab"]{-webkit-tap-highlight-color:transparent}a:focus-visible,[role="button"]:focus-visible,[role="tab"]:focus-visible{outline:3px solid #2A83D4;outline-offset:3px}`}</style>{headNodes}</head>
    <body {...bodyAttributes}>{children}{bodyNodes}</body>
  </html>;
}
