import { useEffect, useRef, useState } from "react";
import { createDefaultWorkspaceState, legacyStorageKey, normalizeWorkspaceState, storageKey } from "../lib/workspaceModel.js";

export function usePersistentWorkspaceState() {
  const [workspaceState, setWorkspaceState] = useState(() => createDefaultWorkspaceState());
  const [ready, setReady] = useState(false);
  const storageRevision = useRef(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([loadWorkspaceState(), loadWorkspaceMetadata()]).then(([storedState, metadata]) => {
      if (cancelled) {
        return;
      }

      if (storedState) {
        setWorkspaceState(normalizeWorkspaceState(storedState));
      }
      storageRevision.current = metadata?.updatedAt || null;
      setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      saveWorkspaceState(normalizeWorkspaceState(workspaceState), storageRevision.current).then((result) => {
        if (result?.conflictState) {
          storageRevision.current = result.updatedAt || null;
          setWorkspaceState(normalizeWorkspaceState(result.conflictState));
          return;
        }

        if (result?.updatedAt) {
          storageRevision.current = result.updatedAt;
        }
      });
    }, 220);

    return () => window.clearTimeout(timeout);
  }, [workspaceState, ready]);

  useEffect(() => {
    if (!ready || !window.infinimindStorage?.metadata) {
      return undefined;
    }

    const interval = window.setInterval(async () => {
      const metadata = await loadWorkspaceMetadata();
      if (!isNewerStorageRevision(metadata?.updatedAt, storageRevision.current)) {
        return;
      }

      const storedState = await loadWorkspaceState();
      if (!storedState) {
        return;
      }

      storageRevision.current = metadata.updatedAt;
      setWorkspaceState(normalizeWorkspaceState(storedState));
    }, 2000);

    return () => window.clearInterval(interval);
  }, [ready]);

  return { workspaceState, setWorkspaceState, ready };
}

async function loadWorkspaceState() {
  if (window.infinimindStorage?.load) {
    return window.infinimindStorage.load();
  }

  try {
    const raw = window.localStorage.getItem(storageKey) || window.localStorage.getItem(legacyStorageKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function saveWorkspaceState(workspaceState, expectedRevision) {
  if (window.infinimindStorage?.save) {
    const currentMetadata = await loadWorkspaceMetadata();
    if (isNewerStorageRevision(currentMetadata?.updatedAt, expectedRevision)) {
      return {
        conflictState: await window.infinimindStorage.load(),
        updatedAt: currentMetadata.updatedAt,
      };
    }

    return window.infinimindStorage.save(workspaceState);
  }

  window.localStorage.setItem(storageKey, JSON.stringify(workspaceState));
  return { updatedAt: new Date().toISOString() };
}

async function loadWorkspaceMetadata() {
  if (!window.infinimindStorage?.metadata) {
    return null;
  }

  try {
    return window.infinimindStorage.metadata();
  } catch {
    return null;
  }
}

function isNewerStorageRevision(candidate, current) {
  if (!candidate) {
    return false;
  }
  if (!current) {
    return true;
  }

  const candidateTime = Date.parse(candidate);
  const currentTime = Date.parse(current);
  return Number.isFinite(candidateTime) && Number.isFinite(currentTime) && candidateTime > currentTime;
}
