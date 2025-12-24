import type { ComponentType, ReactNode } from 'react'
import { CompareView } from './compare/CompareView'
import { SequenceView } from './sequence/SequenceView'
import { OptimizeView } from './optimize/OptimizeView'
import { RecommendView } from './recommend/RecommendView'

export type ModeId = 'compare' | 'sequence' | 'optimize' | 'recommend'

export type ModeDefinition = {
  id: ModeId
  label: string
  description: string
  Component: ComponentType<{ modeSwitcher?: ReactNode }>
}

export const modes: ModeDefinition[] = [
  {
    id: 'compare',
    label: '酒店对比',
    description: '酒店与地点批量对比交通方式',
    Component: CompareView,
  },
  {
    id: 'sequence',
    label: '顺序路线',
    description: '单框多地址，按顺序输出每一段路线',
    Component: SequenceView,
  },
  {
    id: 'optimize',
    label: '路线优化',
    description: '多点路径自动优化顺序',
    Component: OptimizeView,
  },
  {
    id: 'recommend',
    label: '周边推荐',
    description: '多点附近推荐酒店/餐厅/影院',
    Component: RecommendView,
  },
]
