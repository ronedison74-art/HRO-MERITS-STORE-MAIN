import type { BalanceWarning } from '@/lib/rules'

/** Amber warning shown on Encode. It never blocks submitting. */
export function LowBalanceNote({ warning }: { warning: BalanceWarning }) {
  const { balance, pending, needed, available } = warning
  return (
    <div
      role="status"
      className="ms-fade"
      style={{
        marginTop: 6,
        padding: '6px 10px',
        borderRadius: 6,
        fontSize: 13,
        lineHeight: 1.4,
        background: 'rgba(251, 146, 60, 0.12)',
        border: '1px solid rgba(251, 146, 60, 0.55)',
        color: '#fdba74',
      }}
    >
      ⚠️ Not enough merits: this needs <strong>{needed}</strong>
      {pending > 0 ? (
        <>
          , but only <strong>{Math.max(0, available)}</strong> is free (balance {balance}, {pending}{' '}
          already pending).
        </>
      ) : (
        <>
          , but the balance is <strong>{balance}</strong>.
        </>
      )}{' '}
      You can still encode it.
    </div>
  )
}
