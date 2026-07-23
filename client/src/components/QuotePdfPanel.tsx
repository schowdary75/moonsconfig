// @ts-nocheck -- behavior-parity screen pending incremental type hardening.
//
// All @react-pdf/renderer usage lives here so it can be code-split away from the
// Proposals route. Importing this module (statically or dynamically) is what
// pulls in react-pdf (~1MB) + the 8 PDF templates; the Proposals page loads it
// lazily so opening the page no longer ships the PDF engine up front.
import React, { useMemo } from 'react';
import { BlobProvider, pdf } from '@react-pdf/renderer';
import { FileText } from 'lucide-react';
import { QuotePDFTemplate, type QuotePDFProps } from './QuotePDFTemplate';

/** Build a PDF blob on demand (used for download + email). */
export async function generateQuotePdfBlob(props: QuotePDFProps): Promise<Blob> {
  return pdf(<QuotePDFTemplate {...props} />).toBlob();
}

/**
 * Live PDF preview panel. Default export so the Proposals page can wrap it in
 * React.lazy() + Suspense. The document element is memoised on the incoming
 * props so BlobProvider only regenerates the PDF when the quote actually
 * changes, not on every parent re-render.
 */
export default function QuotePdfPreview(props: QuotePDFProps) {
  const propsKey = JSON.stringify(props);
  const document = useMemo(() => <QuotePDFTemplate {...props} />, [propsKey]);

  return (
    <BlobProvider document={document}>
      {({ url, loading }) => {
        if (loading || !url)
          return (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground flex-col gap-3 p-12 animate-pulse">
              <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center">
                <FileText className="w-8 h-8 text-muted-foreground/50" />
              </div>
              <p className="text-center">Generating PDF preview...</p>
            </div>
          );
        return (
          <iframe
            src={`${url}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
            className="w-full h-full border-none absolute inset-0 pointer-events-none"
            scrolling="no"
            title="PDF Preview"
          />
        );
      }}
    </BlobProvider>
  );
}
