import type { ReactNode } from 'react'
import { ModeScaffold } from '../ModeScaffold'

export function RecommendView({ modeSwitcher }: { modeSwitcher?: ReactNode }) {
  return (
    <ModeScaffold
      title="周边推荐"
      description="输入多个地址，推荐附近的酒店/餐厅/影院等"
      modeSwitcher={modeSwitcher}
    >
      <div className="tm-empty">
        <div className="tm-empty__title">功能开发中</div>
        <div className="tm-empty__desc">会支持按类目与偏好筛选，并在地图上展示候选。</div>
      </div>
    </ModeScaffold>
  )
}
