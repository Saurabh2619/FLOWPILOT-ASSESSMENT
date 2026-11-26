"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";

const EMPTY = { path: null, data: null, error: null };

export function useResource(path, { pollWhile, interval = 5000 } = {}) {
  const [state, setState] = useState(EMPTY);
  const [version, setVersion] = useState(0);
  const latest = useRef(0);

  const load = useCallback(async () => {
    const ticket = (latest.current += 1);
    try {
      const data = await api(path);
      if (ticket === latest.current) setState({ path, data, error: null });
    } catch (error) {
      if (ticket !== latest.current) return;
      setState((previous) => ({
        path,
        data: previous.path === path ? previous.data : null,
        error,
      }));
    }
  }, [path]);

  useEffect(() => {
    if (path) queueMicrotask(load);
  }, [path, load, version]);

  const current = state.path === path ? state : EMPTY;
  const polling = Boolean(path && current.data && pollWhile?.(current.data));

  useEffect(() => {
    if (!polling) return undefined;
    const timer = setInterval(load, interval);
    return () => clearInterval(timer);
  }, [polling, load, interval]);

  const setData = useCallback((update) => {
    latest.current += 1;
    setState((previous) => ({ ...previous, data: update(previous.data) }));
  }, []);

  return {
    data: current.data,
    error: current.error,
    loading: Boolean(path) && !current.data && !current.error,
    reload: useCallback(() => setVersion((value) => value + 1), []),
    setData,
  };
}
