import type { ReactNode } from 'react'
import { ModeScaffold } from '../ModeScaffold'

export function SequenceView({ modeSwitcher }: { modeSwitcher?: ReactNode }) {
  return (
    <ModeScaffold
      title="顺序路线"
      description="输入多个地址，按顺序计算相邻点位之间的交通方式"
      modeSwitcher={modeSwitcher}
    >
      <div className="tm-empty">
        <div className="tm-empty__title">功能开发中</div>
        <div className="tm-empty__desc">会支持单输入框多地址，并按顺序输出每一段路线。</div>
      </div>
    </ModeScaffold>
  )
}
