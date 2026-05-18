"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode
} from "react";
import { CreateProjectModal } from "@/components/CreateProjectModal";

type Value = {
  openCreateProject: () => void;
};

const CreateProjectModalContext = createContext<Value | null>(null);

export function useCreateProjectModal() {
  return useContext(CreateProjectModalContext);
}

export function CreateProjectModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openCreateProject = useCallback(() => setOpen(true), []);

  return (
    <CreateProjectModalContext.Provider value={{ openCreateProject }}>
      {children}
      <CreateProjectModal open={open} onClose={() => setOpen(false)} />
    </CreateProjectModalContext.Provider>
  );
}
