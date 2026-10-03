'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileUp } from 'lucide-react';
import { useState } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { toast } from 'sonner';

import type { Document } from '@repo/contracts';

import { Progress } from '@/components/ui/progress';
import { uploadDocument } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/keys';
import { MAX_UPLOAD_MB } from '@/lib/public-env';
import { useApiErrorHandler } from '@/lib/use-api-error';
import { cn } from '@/lib/utils';

type Phase = { kind: 'idle' } | { kind: 'uploading'; percent: number } | { kind: 'processing' };

function rejectionMessage(rejection: FileRejection): string {
  const code = rejection.errors[0]?.code;
  if (code === 'file-too-large') return `File exceeds ${MAX_UPLOAD_MB} MB.`;
  if (code === 'file-invalid-type') return 'Only PDF files are supported.';
  if (code === 'too-many-files') return 'Upload one file at a time.';
  return 'This file can’t be uploaded.';
}

export function UploadDropzone() {
  const queryClient = useQueryClient();
  const handleError = useApiErrorHandler();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  const upload = useMutation({
    mutationFn: (file: File) =>
      uploadDocument(file, ({ loaded, total }) => {
        const percent = Math.round((loaded / total) * 100);
        // Once the bytes are sent, the API extracts, chunks and embeds before it answers.
        setPhase(percent >= 100 ? { kind: 'processing' } : { kind: 'uploading', percent });
      }),
    onMutate: () => setPhase({ kind: 'uploading', percent: 0 }),
    onSuccess: (document: Document) => {
      toast.success('Document ready', {
        description: `${document.pageCount ?? 0} pages, ${document.chunkCount} chunks.`,
      });
    },
    onError: (error) => handleError(error, { notify: true }),
    onSettled: async () => {
      setPhase({ kind: 'idle' });
      await queryClient.invalidateQueries({ queryKey: queryKeys.documents.all });
    },
  });

  const busy = phase.kind !== 'idle';
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    multiple: false,
    maxSize: MAX_UPLOAD_MB * 1024 * 1024,
    disabled: busy,
    onDropAccepted: ([file]) => {
      if (file) upload.mutate(file);
    },
    onDropRejected: ([rejection]) => {
      if (rejection) toast.error(rejectionMessage(rejection));
    },
  });

  return (
    <div
      {...getRootProps({
        className: cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          isDragActive && 'border-ring bg-muted/50',
          busy && 'cursor-default opacity-80',
        ),
        'aria-label': 'Upload a PDF contract',
      })}
    >
      <input {...getInputProps()} />
      {phase.kind === 'idle' ? (
        <>
          <FileUp className="size-6 text-muted-foreground" aria-hidden />
          <p className="font-medium">Drop a PDF here, or click to choose one</p>
          <p className="text-sm text-muted-foreground">
            One file, up to {MAX_UPLOAD_MB} MB, with selectable text.
          </p>
        </>
      ) : null}
      {phase.kind === 'uploading' ? (
        <div className="w-full max-w-sm space-y-2" aria-live="polite">
          <p className="text-sm">Uploading… {phase.percent}%</p>
          <Progress value={phase.percent} aria-label="Upload progress" />
        </div>
      ) : null}
      {phase.kind === 'processing' ? (
        <p className="text-sm" aria-live="polite">
          Processing (extracting, chunking, embedding)…
        </p>
      ) : null}
    </div>
  );
}
