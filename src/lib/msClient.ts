// Thin wrappers over the server functions. Every call goes through the login
// middleware; nothing here talks to the database directly.
import type { Cadet, Privilege, Transaction } from './meritStore'
import {
  fetchAllServer,
  createAvailmentsServer,
  resolveConfirmationServer,
  deleteTransactionServer,
  savePrivilegeServer,
  deletePrivilegeServer,
  addCadetServer,
  updateCadetServer,
  deleteCadetServer,
  importCadetsServer,
  syncCadetsServer,
  listUsersServer,
  saveUserServer,
  getMeServer,
  type NewAvailment,
  type MsUser,
} from './msServerFunctions'
import type { ConfirmOutcome } from './rules'

export type { NewAvailment, MsUser }

export const getMe = () => getMeServer()

export const fetchAll = () => fetchAllServer()

export const createAvailments = (input: {
  items: NewAvailment[]
  availmentDate: string
  processedBy?: string
}): Promise<Transaction[]> => createAvailmentsServer({ data: input })

export const resolveConfirmationRemote = (input: {
  id: string
  outcome: ConfirmOutcome
  confirmationDate: string
}) => resolveConfirmationServer({ data: input })

export const deleteTransactionRemote = (id: string, password: string) =>
  deleteTransactionServer({ data: { id, password } })

export const savePrivilegeRemote = (input: {
  id?: string
  name: string
  cost: number
  type: Privilege['type']
  unitLabel?: string
  active?: boolean
}): Promise<Privilege> => savePrivilegeServer({ data: input })

export const deletePrivilegeRemote = (id: string) => deletePrivilegeServer({ data: { id } })

export const addCadetRemote = (input: {
  name: string
  batch: string
  availableMerits: number
}): Promise<Cadet> => addCadetServer({ data: input })

export const updateCadetRemote = (input: {
  id: string
  name: string
  batch: string
  availableMerits: number
}): Promise<Cadet> => updateCadetServer({ data: input })

export const deleteCadetRemote = (id: string) => deleteCadetServer({ data: { id } })

export const importCadetsRemote = (input: {
  rows: { name: string; batch: string; availableMerits?: number }[]
  skipDuplicates?: boolean
  defaultMerits: number
  defaultBatch: string
}) => importCadetsServer({ data: input })

export const syncCadetsRemote = (
  rows: { id: string; name: string; batch: string; availableMerits: number }[],
) => syncCadetsServer({ data: { rows } })

export const listUsers = (): Promise<MsUser[]> => listUsersServer()

export const saveUser = (input: {
  email: string
  role: 'admin' | 'encoder'
  active: boolean
}) => saveUserServer({ data: input })
