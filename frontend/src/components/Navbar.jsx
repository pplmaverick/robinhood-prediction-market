import { NavLink } from 'react-router-dom'
import { useAccount, useConnect, useDisconnect, useBalance } from 'wagmi'
import { injected } from 'wagmi/connectors'

export default function Navbar() {
  const { address, isConnected } = useAccount()
  const { connect }    = useConnect()
  const { disconnect } = useDisconnect()
  const { data: bal }  = useBalance({ address })

  const navCls = ({ isActive }) =>
    isActive
      ? 'text-tertiary-fixed-dim font-bold font-label-caps uppercase tracking-widest transition-colors'
      : 'text-on-surface-variant font-label-caps hover:text-primary transition-colors uppercase tracking-widest'

  return (
    <header className="sticky top-0 z-50 border-b border-outline-variant bg-surface-container-low">
      <div className="flex justify-between items-center w-full px-gutter max-w-container-max mx-auto h-16">
        {/* Logo */}
        <div className="font-headline-md text-headline-md font-semibold text-on-surface flex items-center gap-1">
          Robinhood Stock Market
          <span className="w-1.5 h-1.5 bg-primary rounded-full inline-block" />
        </div>

        {/* Nav */}
        <nav className="hidden md:flex items-center gap-8">
          <NavLink to="/"              className={navCls}>Markets</NavLink>
          <NavLink to="/my-bets"       className={navCls}>My Bets</NavLink>
          <NavLink to="/market-status" className={navCls}>Market Status</NavLink>
        </nav>

        {/* Wallet */}
        <div className="flex items-center gap-3">
          {isConnected && address && (
            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-surface-container border border-outline-variant rounded-lg">
              <span className="font-data-sm text-on-surface-variant">
                {address.slice(0, 6)}…{address.slice(-4)}
              </span>
              {bal && (
                <span className="font-data-sm text-primary">
                  {Number(bal.formatted).toFixed(4)} ETH
                </span>
              )}
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            </div>
          )}

          {isConnected ? (
            <button
              onClick={() => disconnect()}
              className="bg-surface-container-high text-on-surface font-label-caps px-4 py-2 rounded-lg border border-outline-variant hover:border-secondary transition-all"
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={() => connect({ connector: injected() })}
              className="bg-primary text-on-primary-container font-label-caps px-4 py-2 rounded-lg hover:brightness-110 active:scale-95 transition-all"
            >
              Connect
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
