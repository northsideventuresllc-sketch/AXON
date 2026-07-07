'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AXON_USER_TOOLS,
  readToolDisplayNames,
  resolveToolDisplayName,
  writeToolDisplayName,
  type AxonUserTool,
} from './axon-user-tools';

export function useAxonToolDisplayNames() {
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    setNames(readToolDisplayNames());
  }, []);

  const getDisplayName = useCallback(
    (tool: AxonUserTool) => resolveToolDisplayName(tool, names),
    [names]
  );

  const setDisplayName = useCallback((slug: string, displayName: string) => {
    const next = writeToolDisplayName(slug, displayName);
    setNames(next);
    window.dispatchEvent(new CustomEvent('axon:tool-names-updated'));
  }, []);

  return { tools: AXON_USER_TOOLS, names, getDisplayName, setDisplayName };
}
