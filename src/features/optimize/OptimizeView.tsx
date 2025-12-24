import type { ReactNode } from 'react'
import { ModeScaffold } from '../ModeScaffold'

export function OptimizeView({ modeSwitcher }: { modeSwitcher?: ReactNode }) {
  return (
    <ModeScaffold
      title="路线优化"
      description="输入多个地址，自动给出最优访问顺序"
      modeSwitcher={modeSwitcher}
    >
      <div className="tm-empty">
        <div className="tm-empty__title">功能开发中</div>
        <div className="tm-empty__desc">会支持多点路径优化，并可按时间/费用等维度排序。</div>
      </div>
    </ModeScaffold>
  )
}
