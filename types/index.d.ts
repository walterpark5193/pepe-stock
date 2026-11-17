// pepe-stock의 $.state 계약: 패널이 그리는 시세 스냅숏 하나.
export type PepeView =
  | { status: 'idle' }
  | { status: 'loading'; ticker: string }
  | { status: 'error'; ticker: string; message: string; fetchedAt: number }
  | {
      status: 'ok'
      ticker: string
      symbol: string
      name: string
      currency: string
      price: number
      pct: number
      spanMin: number
      isSinceOpen: boolean
      closes: number[]
      isOpen: boolean
      lastTradeAt: number
      gmtoffset: number
      fetchedAt: number
    }

declare module 'claude-code' {
  interface PluginState {
    'pepe-stock': { view: Shaped<PepeView> }
  }
}
