import { createContext, useContext } from 'react'

export const FieldLabelContext = createContext<
  { text?: string; register: (id: string | undefined) => void } | undefined
>(undefined)
export function useFieldLabel() {
  return useContext(FieldLabelContext)
}
