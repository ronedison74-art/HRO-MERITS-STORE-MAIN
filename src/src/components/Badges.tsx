import type { TransactionStatus, PrivilegeType } from '@/lib/meritStore'

const STATUS_CLASS: Record<TransactionStatus, string> = {
  Pending: 'b-pending',
  Confirmed: 'b-confirmed',
  Cancelled: 'b-cancelled',
  'Not Confirmed': 'b-notconfirmed',
  Invalid: 'b-invalid',
}

export function StatusBadge({ status }: { status: TransactionStatus }) {
  return <span className={`badge ${STATUS_CLASS[status]}`}>{status}</span>
}

export function ViolationBadge({ violation }: { violation: boolean }) {
  return <span className={`badge ${violation ? 'b-yes' : 'b-no'}`}>{violation ? 'YES' : 'NO'}</span>
}

export function TypeBadge({ type }: { type: PrivilegeType }) {
  return (
    <span className={`badge ${type === 'REGULAR' ? 'b-regular' : 'b-accountability'}`}>
      {type === 'REGULAR' ? 'Regular' : 'Accountability'}
    </span>
  )
}
