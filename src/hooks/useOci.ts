import { useQuery } from '@tanstack/react-query';
import { listBucketObjects } from '@/lib/object-storage';

export const ociKeys = {
  all: ['oci'] as const,
  files: ['oci', 'files'] as const,
};

/** Lists the documents currently in the OCI Object Storage bucket. */
export function useOciFiles() {
  return useQuery({
    queryKey: ociKeys.files,
    queryFn: listBucketObjects,
    staleTime: 30_000,
  });
}
