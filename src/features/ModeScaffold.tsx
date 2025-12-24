import type { CSSProperties, ReactNode } from 'react'

export function ModeScaffold({
  title,
  description,
  modeSwitcher,
  children,
  mapContent,
}: {
  title: string
  description?: string
  modeSwitcher?: ReactNode
  children?: ReactNode
  mapContent?: ReactNode
}) {
  const rootStyle = { '--tm-sidebar-w': '520px' } as CSSProperties

  return (
    <div className="tm-root" style={rootStyle}>
      <div className="tm-sidebar">
        <div className="tm-head">
          <div className="tm-head__row">
            <div className="tm-head__title">{title}</div>
          </div>
          {description ? <div className="tm-head__desc">{description}</div> : null}
          {modeSwitcher ? <div className="tm-head__modes">{modeSwitcher}</div> : null}
        </div>
        {children ? <div className="tm-panel">{children}</div> : null}
      </div>
      <div className="tm-splitter" role="separator" aria-orientation="vertical" />
      <div className="tm-mapwrap">{mapContent || <div className="tm-map-placeholder">地图模式开发中</div>}</div>
    </div>
  )
}
