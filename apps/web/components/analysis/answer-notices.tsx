import { Info, TriangleAlert } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';

/** The model's exact "not found" sentence, shown as neutral information rather than an answer. */
export function NotFoundCallout({ sentence }: { sentence: string }) {
  return (
    <Alert>
      <Info aria-hidden />
      <AlertDescription>
        {sentence} Try rephrasing the question or naming the clause you&apos;re looking for.
      </AlertDescription>
    </Alert>
  );
}

export function TruncatedWarning() {
  return (
    <Alert>
      <TriangleAlert aria-hidden />
      <AlertDescription>
        This answer was cut off because it reached the length limit. Ask a narrower question to see
        the rest.
      </AlertDescription>
    </Alert>
  );
}
